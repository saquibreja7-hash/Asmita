import { decryptField } from "@/lib/encryption";
import { sha256 } from "@/lib/hash";
import { crawlMemory } from "@/lib/crawl-store";
import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";

/*
 * The fingerprint pool the crawler service matches against.
 *
 * A fingerprint is in the pool only while all of these hold:
 * - an analyst approved it (APPROVED, or DISPATCHED after an advisory went out);
 * - its case has a live crawl authorisation (signed, not withdrawn) that lists it;
 * - it has a crawlPoolId, set when that authorisation was signed.
 *
 * The pool lists each fingerprint under its crawlPoolId: random, unrelated to
 * the HashSubmission id, and cleared on withdrawal or erasure, so the crawler
 * cannot link two fingerprints to one case or to a survivor, and an id it
 * still holds after a withdrawal matches nothing. No case, user or email data
 * is ever part of the pool.
 */

/** PDQ Hamming distance the crawler may report as a possible match. */
export const CRAWL_MATCH_THRESHOLD = 31;

const POOL_STATUSES = ["APPROVED", "DISPATCHED"] as const;
const PDQ = /^[0-9a-f]{64}$/;

export type CrawlPoolEntry = { id: string; pdq: string; quality: number };
export type CrawlPool = { version: string; generatedAt: string; threshold: number; fingerprints: CrawlPoolEntry[] };

type Candidate = { id: string; caseId: string; crawlPoolId: string | null; hashEncrypted: string; quality: number; status: string };

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

type Coverage = Map<string, { consentId: string; ids: Set<string> }>;

/** Live consents, as caseId -> the live consent and the ids it covers (one live consent per case). */
async function liveCoverage(caseIds?: string[]): Promise<Coverage> {
  let rows: Array<{ id: string; caseId: string; hashSubmissionIds: string[] }>;
  if (isDevNoDb()) {
    rows = crawlMemory().consents.filter((c) => !c.withdrawnAt && (!caseIds || caseIds.includes(c.caseId)));
  } else if (usesWorkerKysely()) {
    let query = getWorkerDb().selectFrom("CrawlConsent").select(["id", "caseId", "hashSubmissionIds"]).where("withdrawnAt", "is", null);
    if (caseIds) query = query.where("caseId", "in", caseIds.length ? caseIds : [""]);
    rows = await query.execute();
  } else {
    const { db } = await import("@/lib/db");
    rows = await db.crawlConsent.findMany({
      where: { withdrawnAt: null, ...(caseIds ? { caseId: { in: caseIds } } : {}) },
      select: { id: true, caseId: true, hashSubmissionIds: true },
    });
  }
  const coverage: Coverage = new Map();
  for (const row of rows) {
    const entry = coverage.get(row.caseId) ?? { consentId: row.id, ids: new Set<string>() };
    for (const id of row.hashSubmissionIds ?? []) entry.ids.add(id);
    coverage.set(row.caseId, entry);
  }
  return coverage;
}

async function fingerprintsByIds(ids: string[]): Promise<Candidate[]> {
  if (ids.length === 0) return [];
  if (isDevNoDb()) {
    const memory = crawlMemory();
    return ids.flatMap((id) => (memory.fingerprints.has(id) ? [memory.fingerprints.get(id)!] : []));
  }
  if (usesWorkerKysely()) {
    return getWorkerDb().selectFrom("HashSubmission")
      .select(["id", "caseId", "crawlPoolId", "hashEncrypted", "quality", "status"])
      .where("id", "in", ids).execute();
  }
  const { db } = await import("@/lib/db");
  return db.hashSubmission.findMany({
    where: { id: { in: ids } },
    select: { id: true, caseId: true, crawlPoolId: true, hashEncrypted: true, quality: true, status: true },
  });
}

async function fingerprintByPoolId(poolId: string): Promise<Candidate | null> {
  if (isDevNoDb()) {
    for (const fingerprint of crawlMemory().fingerprints.values()) {
      if (fingerprint.crawlPoolId === poolId) return fingerprint;
    }
    return null;
  }
  if (usesWorkerKysely()) {
    return (await getWorkerDb().selectFrom("HashSubmission")
      .select(["id", "caseId", "crawlPoolId", "hashEncrypted", "quality", "status"])
      .where("crawlPoolId", "=", poolId).executeTakeFirst()) ?? null;
  }
  const { db } = await import("@/lib/db");
  return db.hashSubmission.findUnique({
    where: { crawlPoolId: poolId },
    select: { id: true, caseId: true, crawlPoolId: true, hashEncrypted: true, quality: true, status: true },
  });
}

function inPool(candidate: Candidate, coverage: Coverage): candidate is Candidate & { crawlPoolId: string } {
  return (
    Boolean(candidate.crawlPoolId) &&
    (POOL_STATUSES as readonly string[]).includes(candidate.status) &&
    Boolean(coverage.get(candidate.caseId)?.ids.has(candidate.id))
  );
}

export async function buildCrawlPool(now = new Date()): Promise<CrawlPool> {
  const coverage = await liveCoverage();
  const candidates = await fingerprintsByIds([...new Set([...coverage.values()].flatMap((entry) => [...entry.ids]))]);
  const fingerprints: CrawlPoolEntry[] = [];
  for (const candidate of candidates) {
    if (!inPool(candidate, coverage)) continue;
    let pdq: string;
    try {
      pdq = decryptField(candidate.hashEncrypted).trim().toLowerCase();
    } catch {
      continue;
    }
    if (!PDQ.test(pdq)) continue;
    fingerprints.push({ id: candidate.crawlPoolId, pdq, quality: candidate.quality });
  }
  // Sorted by the random id, so the order says nothing about cases or age.
  fingerprints.sort((a, b) => a.id.localeCompare(b.id));
  const version = sha256(fingerprints.map((f) => `${f.id}:${f.pdq}:${f.quality}`).join("\n")).slice(0, 32);
  return { version, generatedAt: now.toISOString(), threshold: CRAWL_MATCH_THRESHOLD, fingerprints };
}

/**
 * The fingerprint behind a pool id, only while it is still in the pool.
 * Null for an unknown, withdrawn, erased or no-longer-approved id.
 */
export async function resolvePoolFingerprint(poolId: string): Promise<{ hashSubmissionId: string; caseId: string; consentId: string } | null> {
  const candidate = await fingerprintByPoolId(poolId);
  if (!candidate) return null;
  const coverage = await liveCoverage([candidate.caseId]);
  if (!inPool(candidate, coverage)) return null;
  return { hashSubmissionId: candidate.id, caseId: candidate.caseId, consentId: coverage.get(candidate.caseId)!.consentId };
}

/** Whether a fingerprint is still covered by a live authorisation on its case. */
export async function fingerprintStillConsented(caseId: string, hashSubmissionId: string): Promise<boolean> {
  const coverage = await liveCoverage([caseId]);
  return Boolean(coverage.get(caseId)?.ids.has(hashSubmissionId));
}

/**
 * The live authorisation on the case, when it still lists the fingerprint.
 * A finding recorded under an earlier authorisation (crawlConsentId) does not
 * count as covered by a later one.
 */
export async function findingStillConsented(finding: { caseId: string; hashSubmissionId: string; crawlConsentId?: string | null }): Promise<boolean> {
  const live = (await liveCoverage([finding.caseId])).get(finding.caseId);
  if (!live || !live.ids.has(finding.hashSubmissionId)) return false;
  return !finding.crawlConsentId || finding.crawlConsentId === live.consentId;
}
