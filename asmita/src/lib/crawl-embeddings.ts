import { randomUUID } from "node:crypto";
import { z } from "zod";
import { crawlMemory, findingEmbeddingByFinding, type MemoryFindingEmbedding } from "@/lib/crawl-store";
import { MAX_POOL_EMBEDDINGS_PER_FINGERPRINT, resolvePoolFingerprint } from "@/lib/crawl-pool";
import { crawlUrlSchema, crawlerShapedUrl, findingDigest } from "@/lib/crawl-findings";
import { sscdModelId, sscdModelVersion } from "@/lib/crawler-flags";
import { decryptField, encryptField } from "@/lib/encryption";
import { parseSubmittedUrl } from "@/lib/url-parser";
import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";

/*
 * SSCD embeddings of confirmed copies (ADR 008, WP28), the app side of the
 * second matching layer.
 *
 * The crawler — never the survivor's device, never the app — computes the
 * descriptor of an image it already holds in memory on a PDQ match and posts
 * it here. The app stores it ONLY when the finding the crawler names exists,
 * is APPROVED (an analyst confirmed the copy) and was matched under a live
 * crawl authorisation; so the stored set is exactly "embeddings of
 * analyst-confirmed copies", and the analyst's acceptance — not the
 * crawler's guess — is the gate.
 *
 * Safety shape, same as every crawl module:
 * - URLs are only ever strings, validated with exactly the finding rules
 *   (crawlUrlSchema + parseSubmittedUrl + crawlerShapedUrl), never fetched,
 *   never logged; they only locate the confirmed finding.
 * - The vector is encrypted at rest (encryptField) and NEVER written to a log
 *   or an audit entry — the audit log has no entry for embeddings at all.
 * - One embedding per finding (idempotent repeats answer embedding_exists).
 * - Deletion: the fingerprint's rejection, the consent's withdrawal and the
 *   case's erasure each delete its embeddings, on every backend; nothing
 *   else holds them and they are NOT subject to the 30-day URL blanking.
 * - Model pinning: only the configured model id + version are accepted or
 *   served, so a model change never mixes incomparable vectors.
 */

export const MAX_EMBEDDINGS_PER_BATCH = 50;
/** The L2-normalised descriptor's dimension bound (the pinned model emits 512). */
const MAX_VECTOR_DIMENSIONS = 2048;
/** L2-normalised floats: every component is within [-1.001, 1.001]. */
const VECTOR_COMPONENT_ABS_MAX = 1.001;

const embeddingItemSchema = z
  .object({
    fingerprintId: z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/),
    pageUrl: crawlUrlSchema,
    imageUrl: crawlUrlSchema,
    model: z.string().min(1).max(64),
    version: z.string().min(1).max(64),
    vector: z
      .array(z.number())
      .min(1)
      .max(MAX_VECTOR_DIMENSIONS)
      .refine((vector) => vector.every((value) => Number.isFinite(value) && Math.abs(value) <= VECTOR_COMPONENT_ABS_MAX), {
        message: "invalid_vector",
      }),
  })
  .strict();

// The envelope is checked whole (400 when wrong); each embedding is checked on
// its own, so one malformed item is "rejected" without losing the others —
// the findings route's pattern.
export const crawlEmbeddingsBodySchema = z
  .object({
    runId: z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/),
    embeddings: z.array(z.unknown()).min(1).max(MAX_EMBEDDINGS_PER_BATCH),
  })
  .strict();

export type CrawlEmbeddingsBody = z.infer<typeof crawlEmbeddingsBodySchema>;

export type CrawlEmbeddingResult = { status: "stored" | "rejected"; reason?: string };

// One reason for every fingerprint refusal, so the crawler cannot tell an
// unknown id from a withdrawn or unapproved one (crawl-findings.ts).
const FINGERPRINT_REFUSED = "fingerprint_not_accepted";

type EmbeddingInput = {
  hashSubmissionId: string;
  caseId: string;
  consentId: string;
  pageUrl: string;
  imageUrl: string;
  urlDigest: string;
  model: string;
  version: string;
  vector: number[];
};

type StoreAnswer = "stored" | "embedding_exists" | "fingerprint_not_accepted" | "finding_not_confirmed";

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

/**
 * Inserts one embedding, only while the authorisation the finding was matched
 * under is still live and the finding it names is APPROVED. The live
 * authorisation row is locked (FOR SHARE) in the same transaction as the
 * write — like upsertFinding — so a withdrawal either commits first (and
 * this report is refused) or waits and then deletes what it created.
 */
async function storeEmbedding(input: EmbeddingInput, now: Date): Promise<StoreAnswer> {
  if (isDevNoDb()) {
    const memory = crawlMemory();
    if (!memory.consents.some((c) => c.id === input.consentId && !c.withdrawnAt)) return "fingerprint_not_accepted";
    const finding = [...memory.findings.values()].find((f) => f.caseId === input.caseId && f.urlDigest === input.urlDigest);
    if (!finding || finding.hashSubmissionId !== input.hashSubmissionId || finding.reviewStatus !== "APPROVED") {
      return "finding_not_confirmed";
    }
    if (findingEmbeddingByFinding(finding.id)) return "embedding_exists";
    const row: MemoryFindingEmbedding = {
      id: randomUUID(), findingId: finding.id, hashSubmissionId: input.hashSubmissionId, caseId: input.caseId,
      model: input.model, version: input.version, vector: input.vector, createdAt: now,
    };
    memory.embeddings.set(row.id, row);
    return "stored";
  }

  if (usesWorkerKysely()) {
    return getWorkerDb().transaction().execute(async (trx) => {
      const live = await trx.selectFrom("CrawlConsent").select("id")
        .where("id", "=", input.consentId).where("withdrawnAt", "is", null)
        .forShare().executeTakeFirst();
      if (!live) return "fingerprint_not_accepted";
      const finding = await trx.selectFrom("CrawlFinding").select(["id", "hashSubmissionId", "reviewStatus"])
        .where("caseId", "=", input.caseId).where("urlDigest", "=", input.urlDigest).executeTakeFirst();
      if (!finding || finding.hashSubmissionId !== input.hashSubmissionId || finding.reviewStatus !== "APPROVED") {
        return "finding_not_confirmed";
      }
      // One statement: two concurrent reports of the same confirmed copy
      // cannot create two rows, and the repeat needs no second round trip.
      const inserted = await trx.insertInto("FindingEmbedding").values({
        id: randomUUID(), findingId: finding.id, hashSubmissionId: input.hashSubmissionId, caseId: input.caseId,
        model: input.model, version: input.version, vectorEncrypted: encryptField(JSON.stringify(input.vector)),
        createdAt: now,
      }).onConflict((oc) => oc.column("findingId").doNothing())
        .returning("id").executeTakeFirst();
      return inserted ? "stored" : "embedding_exists";
    });
  }

  const { db } = await import("@/lib/db");
  return db.$transaction(async (tx) => {
    const live = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "CrawlConsent" WHERE "id" = ${input.consentId} AND "withdrawnAt" IS NULL FOR SHARE`;
    if (live.length === 0) return "fingerprint_not_accepted";
    const finding = await tx.crawlFinding.findUnique({
      where: { caseId_urlDigest: { caseId: input.caseId, urlDigest: input.urlDigest } },
      select: { id: true, hashSubmissionId: true, reviewStatus: true },
    });
    if (!finding || finding.hashSubmissionId !== input.hashSubmissionId || finding.reviewStatus !== "APPROVED") {
      return "finding_not_confirmed";
    }
    const existing = await tx.findingEmbedding.findUnique({ where: { findingId: finding.id }, select: { id: true } });
    if (existing) return "embedding_exists";
    try {
      await tx.findingEmbedding.create({
        data: {
          findingId: finding.id, hashSubmissionId: input.hashSubmissionId, caseId: input.caseId,
          model: input.model, version: input.version, vectorEncrypted: encryptField(JSON.stringify(input.vector)),
          createdAt: now,
        },
      });
      return "stored";
    } catch (err) {
      // Another report of the same confirmed copy created it first.
      if ((err as { code?: string }).code === "P2002") return "embedding_exists";
      throw err;
    }
  });
}

/**
 * Records a validated batch of embeddings. Results are index-aligned with the
 * input. Nothing about a vector, a URL or a fingerprint is ever logged: a
 * stored embedding writes no audit entry at all (the crawler's counters are
 * its own record).
 */
export async function recordCrawlEmbeddings(
  body: CrawlEmbeddingsBody,
  now = new Date(),
): Promise<{ results: CrawlEmbeddingResult[]; mediaRejected: boolean }> {
  const fingerprints = new Map<string, Awaited<ReturnType<typeof resolvePoolFingerprint>>>();
  const results: CrawlEmbeddingResult[] = [];
  let mediaRejected = false;

  for (const raw of body.embeddings) {
    const checked = embeddingItemSchema.safeParse(raw);
    if (!checked.success) {
      const issues = checked.error.issues;
      const media = issues.some((issue) => issue.message === "media_payload_rejected");
      mediaRejected ||= media;
      // Any issue on the vector — its type, length bounds or the finite /
      // normalised-fragment refine — answers invalid_vector; anything else
      // about the item's shape is invalid_embedding.
      const vectorIssue = issues.some((issue) => issue.path[0] === "vector");
      results.push({ status: "rejected", reason: media ? "media_payload_rejected" : vectorIssue ? "invalid_vector" : "invalid_embedding" });
      continue;
    }
    const item = checked.data;
    const page = parseSubmittedUrl(item.pageUrl);
    const image = parseSubmittedUrl(item.imageUrl);
    if (!page.ok || !image.ok || !crawlerShapedUrl(item.pageUrl) || !crawlerShapedUrl(item.imageUrl)) {
      results.push({ status: "rejected", reason: "invalid_url" });
      continue;
    }
    if (!fingerprints.has(item.fingerprintId)) fingerprints.set(item.fingerprintId, await resolvePoolFingerprint(item.fingerprintId));
    const fingerprint = fingerprints.get(item.fingerprintId);
    if (!fingerprint) {
      results.push({ status: "rejected", reason: FINGERPRINT_REFUSED });
      continue;
    }
    // Only the configured descriptor is accepted: vectors are comparable
    // within one model id + version and never across them (ADR 008).
    if (item.model !== sscdModelId() || item.version !== sscdModelVersion()) {
      results.push({ status: "rejected", reason: "model_mismatch" });
      continue;
    }
    const answer = await storeEmbedding({
      hashSubmissionId: fingerprint.hashSubmissionId,
      caseId: fingerprint.caseId,
      consentId: fingerprint.consentId,
      pageUrl: page.normalizedUrl,
      imageUrl: image.normalizedUrl,
      urlDigest: findingDigest(fingerprint.caseId, fingerprint.consentId, page.normalizedUrl, image.normalizedUrl),
      model: item.model,
      version: item.version,
      vector: item.vector,
    }, now);
    if (answer === "stored") results.push({ status: "stored" });
    // Idempotent: the confirmed copy is already embedded (ADR 008).
    else if (answer === "embedding_exists") results.push({ status: "stored", reason: "embedding_exists" });
    else results.push({ status: "rejected", reason: answer });
  }
  return { results, mediaRejected };
}

// ---------------------------------------------------------------------------
// The pool read (WP28): the vectors the crawler matches against

/** The vector of one stored row, or null when it does not decode to finite floats. */
function decodeVector(vector: unknown): number[] | null {
  if (Array.isArray(vector)) {
    return vector.every((value) => typeof value === "number" && Number.isFinite(value)) ? (vector as number[]) : null;
  }
  if (typeof vector !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(decryptField(vector));
    if (!Array.isArray(parsed)) return null;
    return parsed.every((value) => typeof value === "number" && Number.isFinite(value)) ? (parsed as number[]) : null;
  } catch {
    return null;
  }
}

/**
 * The embeddings of the given fingerprints' confirmed copies, grouped by
 * hashSubmissionId, for the pool (ADR 008, WP28): only rows of the
 * configured model + version, at most 16 per fingerprint, newest first, the
 * vectors decrypted. The caller has already checked the fingerprint is in the
 * pool; the gating lives there (crawl-pool.ts), exactly as for the hashes.
 */
export async function poolEmbeddingsForPoolIds(hashSubmissionIds: string[]): Promise<Map<string, number[][]>> {
  const grouped = new Map<string, number[][]>();
  if (hashSubmissionIds.length === 0) return grouped;
  const model = sscdModelId();
  const version = sscdModelVersion();
  // `raw` is the encrypted column on the database paths and the plain vector
  // on the memory path; decodeVector below reads either, newest rows first.
  let rows: Array<{ hashSubmissionId: string; model: string; version: string; createdAt: Date; raw: unknown }>;
  if (isDevNoDb()) {
    rows = [...crawlMemory().embeddings.values()]
      .filter((row) => hashSubmissionIds.includes(row.hashSubmissionId))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((row) => ({ hashSubmissionId: row.hashSubmissionId, model: row.model, version: row.version, createdAt: row.createdAt, raw: row.vector }));
  } else if (usesWorkerKysely()) {
    rows = (await getWorkerDb().selectFrom("FindingEmbedding")
      .select(["hashSubmissionId", "model", "version", "vectorEncrypted", "createdAt"])
      .where("hashSubmissionId", "in", hashSubmissionIds)
      .orderBy("createdAt", "desc").execute())
      .map((row) => ({ hashSubmissionId: row.hashSubmissionId, model: row.model, version: row.version, createdAt: new Date(row.createdAt), raw: row.vectorEncrypted as unknown }));
  } else {
    const { db } = await import("@/lib/db");
    rows = (await db.findingEmbedding.findMany({
      where: { hashSubmissionId: { in: hashSubmissionIds } },
      select: { hashSubmissionId: true, model: true, version: true, vectorEncrypted: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    })).map((row) => ({ hashSubmissionId: row.hashSubmissionId, model: row.model, version: row.version, createdAt: row.createdAt, raw: row.vectorEncrypted as unknown }));
  }
  // Newest first, the configured model only, at most 16 per fingerprint.
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.model !== model || row.version !== version) continue;
    const count = counts.get(row.hashSubmissionId) ?? 0;
    if (count >= MAX_POOL_EMBEDDINGS_PER_FINGERPRINT) continue;
    const vector = decodeVector(row.raw);
    if (!vector) continue;
    counts.set(row.hashSubmissionId, count + 1);
    grouped.set(row.hashSubmissionId, [...(grouped.get(row.hashSubmissionId) ?? []), vector]);
  }
  return grouped;
}

// ---------------------------------------------------------------------------
// Deletion: the fingerprint's rejection, the consent's withdrawal, the case's
// erasure (ADR 008). All three backends; nothing else deletes embeddings.

export async function deleteEmbeddingsForCase(caseIds: string[]): Promise<number> {
  if (caseIds.length === 0) return 0;
  if (isDevNoDb()) {
    const memory = crawlMemory();
    const ids = new Set(caseIds);
    let deleted = 0;
    for (const [id, embedding] of memory.embeddings) {
      if (ids.has(embedding.caseId)) {
        memory.embeddings.delete(id);
        deleted += 1;
      }
    }
    return deleted;
  }
  if (usesWorkerKysely()) {
    const result = await getWorkerDb().deleteFrom("FindingEmbedding").where("caseId", "in", caseIds).executeTakeFirst();
    return Number(result.numDeletedRows);
  }
  const { db } = await import("@/lib/db");
  return (await db.findingEmbedding.deleteMany({ where: { caseId: { in: caseIds } } })).count;
}

export async function deleteEmbeddingsForSubmission(hashSubmissionId: string): Promise<number> {
  if (isDevNoDb()) {
    const memory = crawlMemory();
    let deleted = 0;
    for (const [id, embedding] of memory.embeddings) {
      if (embedding.hashSubmissionId === hashSubmissionId) {
        memory.embeddings.delete(id);
        deleted += 1;
      }
    }
    return deleted;
  }
  if (usesWorkerKysely()) {
    const result = await getWorkerDb().deleteFrom("FindingEmbedding").where("hashSubmissionId", "=", hashSubmissionId).executeTakeFirst();
    return Number(result.numDeletedRows);
  }
  const { db } = await import("@/lib/db");
  return (await db.findingEmbedding.deleteMany({ where: { hashSubmissionId } })).count;
}
