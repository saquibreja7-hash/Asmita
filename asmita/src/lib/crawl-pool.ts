import { decryptField } from "@/lib/encryption";
import { sha256 } from "@/lib/hash";
import { crawlMemory } from "@/lib/crawl-store";
import { sscdEnabled, sscdModelId, sscdModelVersion } from "@/lib/crawler-flags";
import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";
import { LOW_QUALITY_THRESHOLD } from "@/lib/hash-submission";
import * as store from "@/lib/store";

/*
 * The fingerprint pool the crawler service matches against.
 *
 * A fingerprint is in the pool only while all of these hold:
 * - an analyst approved it (APPROVED, or DISPATCHED after an advisory went out);
 * - its case has a live crawl authorisation (signed, not withdrawn) that lists it;
 * - the case is open, or the authorisation's re-upload window is still running
 *   (watch-and-verify WP24: CrawlConsent.watchUntil, set when the case was
 *   resolved — crawl-watch.ts);
 * - it has a crawlPoolId, set when that authorisation was signed;
 * - for an image, its PDQ quality is at least MIN_POOL_QUALITY (50).
 *
 * The pool lists each fingerprint under its crawlPoolId: random, unrelated to
 * the HashSubmission id, and cleared on withdrawal or erasure, so the crawler
 * cannot link two fingerprints to one case or to a survivor, and an id it
 * still holds after a withdrawal matches nothing. No case, user or email data
 * is ever part of the pool.
 *
 * Video fingerprints (algorithm VPDQ, video-fingerprints spec WP20) are in
 * the pool as their own shape: { id, kind: "video", frames } with the kept
 * frame hashes the survivor's browser computed on her device — hashes only,
 * never qualities or timestamps, never bytes. The crawler indexes the frames
 * (multi-index hashing) and reports a match against the video's pool id
 * exactly like an image match, for human review.
 *
 * SSCD embeddings (ADR 008, WP28): while ENABLE_SSCD is on, an image
 * fingerprint's entry also carries the decrypted embeddings of its
 * analyst-confirmed copies — { model, version, vectors }, at most 16, under
 * exactly today's gating. Video entries never carry them, and an image entry
 * without embeddings keeps the pre-WP28 shape, so nothing changes while the
 * switch is off.
 */

/** PDQ Hamming distance the crawler may report as a possible match. */
export const CRAWL_MATCH_THRESHOLD = 31;

/** At most this many embeddings the pool serves per fingerprint (ADR 008). */
export const MAX_POOL_EMBEDDINGS_PER_FINGERPRINT = 16;

const POOL_STATUSES = ["APPROVED", "DISPATCHED"] as const;
const PDQ = /^[0-9a-f]{64}$/;

/**
 * Watch-and-verify WP24: the case statuses under which a live authorisation
 * keeps her fingerprints in the pool on their own. PARTIALLY_RESOLVED and
 * ESCALATED are still open — notices are moving and follow-ups run. Once the
 * case is RESOLVED (or CLOSED, which today only a deletion request does, and
 * that withdraws the authorisation anyway), only the re-upload window
 * (`CrawlConsent.watchUntil`) keeps them (crawl-watch.ts).
 */
export const OPEN_CASE_STATUSES = ["OPEN", "PARTIALLY_RESOLVED", "ESCALATED"] as const;

export function isCaseOpen(status: string): boolean {
  return (OPEN_CASE_STATUSES as readonly string[]).includes(status);
}

export type CrawlPoolSscd = { model: string; version: string; vectors: number[][] };
export type CrawlPoolImageEntry = { id: string; pdq: string; quality: number; sscd?: CrawlPoolSscd };
export type CrawlPoolVideoEntry = { id: string; kind: "video"; frames: string[] };
export type CrawlPoolEntry = CrawlPoolImageEntry | CrawlPoolVideoEntry;
export type CrawlPool = { version: string; generatedAt: string; threshold: number; fingerprints: CrawlPoolEntry[] };

type Candidate = {
  id: string;
  caseId: string;
  crawlPoolId: string | null;
  hashEncrypted: string;
  quality: number;
  status: string;
  algorithm: string;
  /** Video only (VPDQ): the kept frame list as JSON, encrypted. */
  videoFramesEncrypted: string | null;
};

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

type Coverage = Map<string, { consentId: string; ids: Set<string>; watchUntil: Date | null }>;

/** Live consents, as caseId -> the live consent and the ids it covers (one live consent per case). */
async function liveCoverage(caseIds?: string[]): Promise<Coverage> {
  let rows: Array<{ id: string; caseId: string; hashSubmissionIds: string[]; watchUntil?: Date | null }>;
  if (isDevNoDb()) {
    rows = crawlMemory().consents.filter((c) => !c.withdrawnAt && (!caseIds || caseIds.includes(c.caseId)));
  } else if (usesWorkerKysely()) {
    let query = getWorkerDb().selectFrom("CrawlConsent").select(["id", "caseId", "hashSubmissionIds", "watchUntil"]).where("withdrawnAt", "is", null);
    if (caseIds) query = query.where("caseId", "in", caseIds.length ? caseIds : [""]);
    rows = await query.execute();
  } else {
    const { db } = await import("@/lib/db");
    rows = await db.crawlConsent.findMany({
      where: { withdrawnAt: null, ...(caseIds ? { caseId: { in: caseIds } } : {}) },
      select: { id: true, caseId: true, hashSubmissionIds: true, watchUntil: true },
    });
  }
  const coverage: Coverage = new Map();
  for (const row of rows) {
    const entry = coverage.get(row.caseId) ?? { consentId: row.id, ids: new Set<string>(), watchUntil: row.watchUntil ?? null };
    for (const id of row.hashSubmissionIds ?? []) entry.ids.add(id);
    coverage.set(row.caseId, entry);
  }
  return coverage;
}

/** The statuses of the given cases, as caseId -> status. */
async function caseStatuses(caseIds: string[]): Promise<Map<string, string>> {
  const statuses = new Map<string, string>();
  if (caseIds.length === 0) return statuses;
  if (isDevNoDb()) {
    for (const caseId of caseIds) {
      const status = store.cases.get(caseId)?.status;
      if (status) statuses.set(caseId, status);
    }
    return statuses;
  }
  if (usesWorkerKysely()) {
    const rows = await getWorkerDb().selectFrom("Case").select(["id", "status"]).where("id", "in", caseIds).execute();
    for (const row of rows) statuses.set(row.id, row.status);
    return statuses;
  }
  const { db } = await import("@/lib/db");
  const rows = await db.case.findMany({ where: { id: { in: caseIds } }, select: { id: true, status: true } });
  for (const row of rows) statuses.set(row.id, row.status);
  return statuses;
}

/**
 * The pool's own rule (watch-and-verify WP24): live consents, further cut to
 * the cases whose fingerprints the crawler may still be matched against —
 * either the case is open, or the re-upload window is still running. A
 * resolved case outside its window leaves the pool, exactly as a withdrawn
 * authorisation does, without touching the consent itself.
 */
async function poolCoverage(caseIds?: string[], now = new Date()): Promise<Coverage> {
  const coverage = await liveCoverage(caseIds);
  const statuses = await caseStatuses([...coverage.keys()]);
  for (const [caseId, entry] of coverage) {
    const open = isCaseOpen(statuses.get(caseId) ?? "");
    const inWindow = entry.watchUntil !== null && entry.watchUntil.getTime() > now.getTime();
    if (!open && !inWindow) coverage.delete(caseId);
  }
  return coverage;
}

async function fingerprintsByIds(ids: string[]): Promise<Candidate[]> {
  if (ids.length === 0) return [];
  if (isDevNoDb()) {
    const memory = crawlMemory();
    // Absent algorithm reads as PDQ: dev rows seeded before video fingerprints.
    return ids.flatMap((id) => {
      const row = memory.fingerprints.get(id);
      return row
        ? [{ ...row, algorithm: row.algorithm ?? "PDQ", videoFramesEncrypted: row.videoFramesEncrypted ?? null }]
        : [];
    });
  }
  if (usesWorkerKysely()) {
    return getWorkerDb().selectFrom("HashSubmission")
      .select(["id", "caseId", "crawlPoolId", "hashEncrypted", "quality", "status", "algorithm", "videoFramesEncrypted"])
      .where("id", "in", ids).execute();
  }
  const { db } = await import("@/lib/db");
  return db.hashSubmission.findMany({
    where: { id: { in: ids } },
    select: { id: true, caseId: true, crawlPoolId: true, hashEncrypted: true, quality: true, status: true, algorithm: true, videoFramesEncrypted: true },
  });
}

async function fingerprintByPoolId(poolId: string): Promise<Candidate | null> {
  if (isDevNoDb()) {
    for (const fingerprint of crawlMemory().fingerprints.values()) {
      if (fingerprint.crawlPoolId === poolId) {
        return { ...fingerprint, algorithm: fingerprint.algorithm ?? "PDQ", videoFramesEncrypted: fingerprint.videoFramesEncrypted ?? null };
      }
    }
    return null;
  }
  if (usesWorkerKysely()) {
    return (await getWorkerDb().selectFrom("HashSubmission")
      .select(["id", "caseId", "crawlPoolId", "hashEncrypted", "quality", "status", "algorithm", "videoFramesEncrypted"])
      .where("crawlPoolId", "=", poolId).executeTakeFirst()) ?? null;
  }
  const { db } = await import("@/lib/db");
  return db.hashSubmission.findUnique({
    where: { crawlPoolId: poolId },
    select: { id: true, caseId: true, crawlPoolId: true, hashEncrypted: true, quality: true, status: true, algorithm: true, videoFramesEncrypted: true },
  });
}

function inPool(candidate: Candidate, coverage: Coverage): candidate is Candidate & { crawlPoolId: string } {
  return (
    Boolean(candidate.crawlPoolId) &&
    (POOL_STATUSES as readonly string[]).includes(candidate.status) &&
    meetsPoolQuality(candidate) &&
    Boolean(coverage.get(candidate.caseId)?.ids.has(candidate.id))
  );
}

/**
 * An image fingerprint below PDQ quality 50 stays out of the pool even after
 * an analyst approves it: such a hash matches unrelated images and would fill
 * the review queue. Video fingerprints filter their own frames instead
 * (VPDQ_MIN_FRAME_QUALITY), so the floor applies to images only.
 */
export const MIN_POOL_QUALITY = LOW_QUALITY_THRESHOLD;

function meetsPoolQuality(candidate: Candidate): boolean {
  return candidate.algorithm === "VPDQ" || candidate.quality >= MIN_POOL_QUALITY;
}

/**
 * The frame hashes a video fingerprint serves in the pool (WP20): the kept
 * frame list stored encrypted as JSON of { hash, quality, t }, reduced to its
 * 64-hex hashes. If the list is gone or unreadable, the stored best frame's
 * hash stands in for it — the same fallback the hash annex uses, so an entry
 * never silently vanishes; account erasure clears the pool id in the same
 * statement as the list, so the fallback is defence, not a live path. Null
 * when neither source holds a valid hash: the row is skipped.
 */
function videoFramesOf(candidate: Candidate & { crawlPoolId: string }): string[] | null {
  const frames: string[] = [];
  if (candidate.videoFramesEncrypted) {
    try {
      const parsed: unknown = JSON.parse(decryptField(candidate.videoFramesEncrypted));
      if (Array.isArray(parsed)) {
        for (const frame of parsed) {
          if (typeof frame === "object" && frame !== null) {
            const hash = (frame as { hash?: unknown }).hash;
            if (typeof hash === "string" && PDQ.test(hash)) frames.push(hash);
          }
        }
      }
    } catch {
      // Not the stored JSON shape: fall through to the best frame below.
    }
  }
  if (frames.length > 0) return frames;
  try {
    const best = decryptField(candidate.hashEncrypted).trim().toLowerCase();
    return PDQ.test(best) ? [best] : null;
  } catch {
    return null;
  }
}

export async function buildCrawlPool(now = new Date()): Promise<CrawlPool> {
  const coverage = await poolCoverage(undefined, now);
  const candidates = await fingerprintsByIds([...new Set([...coverage.values()].flatMap((entry) => [...entry.ids]))]);
  // inPool is the type guard, so the filter keeps the narrowed non-null pool id.
  const inPoolCandidates = candidates.filter((candidate): candidate is Candidate & { crawlPoolId: string } => inPool(candidate, coverage));
  // The second layer's vectors (ADR 008, WP28): only while the switch is on,
  // and only for the in-pool image fingerprints the crawler may match. The
  // helper is imported lazily — crawl-embeddings imports resolvePoolFingerprint
  // from here, and a static edge both ways would make module initialisation
  // order decide whether the schemas come out whole.
  const embeddingsBySubmission = sscdEnabled()
    ? await (await import("@/lib/crawl-embeddings")).poolEmbeddingsForPoolIds(inPoolCandidates.map((candidate) => candidate.id))
    : new Map<string, number[][]>();
  const fingerprints: CrawlPoolEntry[] = [];
  for (const candidate of inPoolCandidates) {
    if (candidate.algorithm === "VPDQ") {
      const frames = videoFramesOf(candidate);
      if (!frames) continue;
      fingerprints.push({ id: candidate.crawlPoolId, kind: "video", frames });
      continue;
    }
    let pdq: string;
    try {
      pdq = decryptField(candidate.hashEncrypted).trim().toLowerCase();
    } catch {
      continue;
    }
    if (!PDQ.test(pdq)) continue;
    const vectors = embeddingsBySubmission.get(candidate.id);
    // An image entry without embeddings keeps the exact pre-WP28 shape.
    fingerprints.push(vectors
      ? { id: candidate.crawlPoolId, pdq, quality: candidate.quality, sscd: { model: sscdModelId(), version: sscdModelVersion(), vectors } }
      : { id: candidate.crawlPoolId, pdq, quality: candidate.quality });
  }
  // Sorted by the random id, so the order says nothing about cases or age.
  fingerprints.sort((a, b) => a.id.localeCompare(b.id));
  const version = sha256(
    fingerprints.map((f) => {
      if ("kind" in f) return `${f.id}:video:${f.frames.join("")}`;
      // The version covers the served vectors too, so an embedding added or
      // removed flips it and the crawler re-syncs (WP28).
      const base = `${f.id}:${f.pdq}:${f.quality}`;
      return "sscd" in f && f.sscd
        ? `${base}:${f.sscd.model}:${f.sscd.version}:${f.sscd.vectors.map((vector) => vector.join(",")).join(";")}`
        : base;
    }).join("\n"),
  ).slice(0, 32);
  return { version, generatedAt: now.toISOString(), threshold: CRAWL_MATCH_THRESHOLD, fingerprints };
}

/**
 * The fingerprint behind a pool id, only while it is still in the pool —
 * an image or a video (WP20): a video finding resolves to its video
 * submission like an image finding to its image submission. The matched
 * submission's algorithm is part of the answer so a finding reported without
 * a method is still labelled VPDQ (ADR 008, WP28).
 * Null for an unknown, withdrawn, erased or no-longer-approved id.
 */
export async function resolvePoolFingerprint(poolId: string): Promise<{ hashSubmissionId: string; caseId: string; consentId: string; algorithm: string } | null> {
  const candidate = await fingerprintByPoolId(poolId);
  if (!candidate) return null;
  const coverage = await poolCoverage([candidate.caseId]);
  if (!inPool(candidate, coverage)) return null;
  return {
    hashSubmissionId: candidate.id,
    caseId: candidate.caseId,
    consentId: coverage.get(candidate.caseId)!.consentId,
    algorithm: candidate.algorithm,
  };
}

/** Whether a fingerprint is still covered by a live authorisation on its case. */
export async function fingerprintStillConsented(caseId: string, hashSubmissionId: string): Promise<boolean> {
  const coverage = await liveCoverage([caseId]);
  return Boolean(coverage.get(caseId)?.ids.has(hashSubmissionId));
}

/**
 * Whether a live authorisation covers a finding: it lists the matched
 * fingerprint, and the finding was recorded under it or under the watch-only
 * authorisation this full one replaced at "Take it down" (convertedFromId;
 * WP22). A finding recorded under an earlier authorisation is never covered
 * by a later one; a row from before crawlConsentId existed is covered only
 * if it was first seen after this authorisation was signed. A copy seen again
 * under a new authorisation is a new finding, reviewed from the start.
 */
export function consentCoversFinding(
  consent: { id: string; hashSubmissionIds: string[]; signedAt: Date; convertedFromId?: string | null },
  finding: { hashSubmissionId: string; crawlConsentId?: string | null; firstSeenAt: Date },
): boolean {
  if (!consent.hashSubmissionIds.includes(finding.hashSubmissionId)) return false;
  if (finding.crawlConsentId) {
    return finding.crawlConsentId === consent.id || finding.crawlConsentId === consent.convertedFromId;
  }
  return consent.signedAt.getTime() <= finding.firstSeenAt.getTime();
}

/** Whether the live authorisation on the finding's case covers it (consentCoversFinding). */
export async function findingStillConsented(finding: { caseId: string; hashSubmissionId: string; crawlConsentId?: string | null; firstSeenAt: Date }): Promise<boolean> {
  let rows: Array<{ id: string; hashSubmissionIds: string[]; signedAt: Date; convertedFromId?: string | null }>;
  if (isDevNoDb()) {
    rows = crawlMemory().consents.filter((c) => c.caseId === finding.caseId && !c.withdrawnAt);
  } else if (usesWorkerKysely()) {
    rows = await getWorkerDb().selectFrom("CrawlConsent").select(["id", "hashSubmissionIds", "signedAt", "convertedFromId"])
      .where("caseId", "=", finding.caseId).where("withdrawnAt", "is", null).execute();
  } else {
    const { db } = await import("@/lib/db");
    rows = await db.crawlConsent.findMany({ where: { caseId: finding.caseId, withdrawnAt: null }, select: { id: true, hashSubmissionIds: true, signedAt: true, convertedFromId: true } });
  }
  return rows.some((consent) => consentCoversFinding({ ...consent, signedAt: new Date(consent.signedAt) }, finding));
}

/**
 * Whether the case has at least one fingerprint in the pool right now: a
 * live authorisation that lists an approved fingerprint carrying a pool id
 * (exactly the inPool rule above), on an open case or inside its re-upload
 * window. The removal re-check's image-level conclusion relies on this
 * (watch-and-verify WP23, link-verification.ts): a fetched page proves her
 * image is gone only while the crawler was actually matching her fingerprints.
 */
export async function caseHasPoolFingerprints(caseId: string, now = new Date()): Promise<boolean> {
  const coverage = await poolCoverage([caseId], now);
  const entry = coverage.get(caseId);
  if (!entry || entry.ids.size === 0) return false;
  const candidates = await fingerprintsByIds([...entry.ids]);
  return candidates.some((candidate) => inPool(candidate, coverage));
}
