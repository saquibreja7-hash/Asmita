import { randomUUID } from "node:crypto";
import { decryptField } from "@/lib/encryption";
import { crawlMemory } from "@/lib/crawl-store";
import { partnerMemory } from "@/lib/partner-store";
import { isPartnerShareableStatus } from "@/lib/partner-share-consent";
import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";
import * as store from "@/lib/store";

/*
 * The partner feed (WP32, partner-sharing-spec.md): an append-only log of
 * "this fingerprint became shareable" / "this fingerprint stopped being
 * shareable" events, served to authenticated partners in seq order by
 * GET /api/partner/v1/fingerprints.
 *
 * What makes a fingerprint shareable is Rule 2, and it is re-derived, never
 * cached: a live (not withdrawn) PartnerShareConsent on its case, an analyst
 * approval (APPROVED or DISPATCHED), an adult case. Every mutation that can
 * change any of those (consent given or withdrawn, hash approval or rejection,
 * case deletion, account erasure) runs syncPartnerFeedFingerprints(), which
 * writes an ADD when a shareable fingerprint's latest event is not an ADD and
 * a WITHDRAW when a shared fingerprint stops being shareable — so replaying
 * the feed from seq 0 always converges on exactly the currently shareable
 * set, whatever order the mutations happened in.
 *
 * Rule 1: an event carries the fingerprint id, its kind and the case
 * reference, and nothing else. The hash itself is never stored here; the feed
 * reads it from HashSubmission at serve time and only while the fingerprint is
 * still shareable, so no page ever hands out the hash of a withdrawn,
 * rejected, minor or otherwise unshared fingerprint (the ADD event is simply
 * left out — a partner that polls late then sees only the WITHDRAW, which
 * asks it to delete an id it never received).
 *
 * Backends like every crawl/partner module: the in-memory store without
 * DATABASE_URL (dev/tests), Kysely on the Worker, Prisma otherwise. The
 * memory store carries no ages (see partner-share-consent.ts), so its paths
 * rely on the adultOnly session gates exactly as WP31's do.
 */

/** The feed's maximum page size (partner-sharing-spec.md, WP32). */
export const PARTNER_FEED_MAX_PAGE = 500;

export type PartnerFeedKind = "image" | "video";

/** The PDQ value the API carries for an image fingerprint. */
const PDQ_HASH = /^[0-9a-f]{64}$/;

/** "VPDQ" is a video; "PDQ" (and anything else, today) is an image. */
export function kindForAlgorithm(algorithm: string): PartnerFeedKind {
  return algorithm.trim().toUpperCase() === "VPDQ" ? "video" : "image";
}

/** The stored kind is always one the feed itself wrote ("image" / "video"). */
function kindFromStored(kind: string): PartnerFeedKind {
  return kind === "video" ? "video" : "image";
}

/**
 * Turns the stored, decrypted fingerprint value into what the feed carries:
 * the 64-hex PDQ hash for an image, the frame hashes for a video. Null when
 * the value is unreadable or not a bare hash list — a fingerprint whose
 * stored value cannot be read must not reach a partner.
 */
export function feedHashPayload(algorithm: string, decrypted: string): { hash: string } | { frames: string[] } | null {
  const value = decrypted.trim().toLowerCase();
  if (kindForAlgorithm(algorithm) === "video") {
    let raw: unknown = null;
    try {
      raw = JSON.parse(value);
    } catch {
      raw = value.includes(",") ? value.split(",") : [value];
    }
    if (!Array.isArray(raw)) return null;
    const frames = raw.map((entry) => (typeof entry === "string" ? entry.trim() : ""));
    return frames.length > 0 && frames.every((frame) => PDQ_HASH.test(frame)) ? { frames } : null;
  }
  return PDQ_HASH.test(value) ? { hash: value } : null;
}

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

async function prismaDb() {
  const { db } = await import("@/lib/db");
  return db;
}

// ---------------------------------------------------------------------------
// Facts the sync needs, one implementation per backend

type FingerprintFact = { id: string; caseId: string; status: string; algorithm: string };

type FeedQueries = {
  fingerprintFacts(ids: string[]): Promise<FingerprintFact[]>;
  /** The latest event type per fingerprint, from the whole event log. */
  latestEventTypes(ids: string[]): Promise<Map<string, "ADD" | "WITHDRAW">>;
  /** Case ids with a live partner-sharing agreement. */
  liveConsentCaseIds(caseIds: string[]): Promise<Set<string>>;
  /** Case ids that are adult cases (Rule 3, re-checked at the query). */
  adultCaseIds(caseIds: string[]): Promise<Set<string>>;
  caseRefs(caseIds: string[]): Promise<Map<string, string | null>>;
  append(events: FeedEventInput[]): Promise<void>;
};

/** One event to append to the feed. */
export type FeedEventInput = {
  fingerprintId: string;
  type: "ADD" | "WITHDRAW";
  kind: PartnerFeedKind;
  caseId: string | null;
  caseRef: string | null;
};

// --- in-memory store (dev/tests) -------------------------------------------

function memoryLatestEventTypes(ids: string[]): Map<string, "ADD" | "WITHDRAW"> {
  const wanted = new Set(ids);
  const latest = new Map<string, "ADD" | "WITHDRAW">();
  for (const event of partnerMemory().feedEvents) {
    if (wanted.has(event.fingerprintId)) latest.set(event.fingerprintId, event.type);
  }
  return latest;
}

function memoryLiveConsentCaseIds(caseIds: string[]): Set<string> {
  const wanted = new Set(caseIds);
  return new Set(
    partnerMemory().shareConsents.filter((consent) => wanted.has(consent.caseId) && !consent.withdrawnAt).map((consent) => consent.caseId),
  );
}

function memoryQueries(): FeedQueries {
  return {
    async fingerprintFacts(ids) {
      return ids.flatMap((id) => {
        const fingerprint = crawlMemory().fingerprints.get(id);
        return fingerprint ? [{ id: fingerprint.id, caseId: fingerprint.caseId, status: fingerprint.status, algorithm: "PDQ" }] : [];
      });
    },
    async latestEventTypes(ids) {
      return memoryLatestEventTypes(ids);
    },
    async liveConsentCaseIds(caseIds) {
      return memoryLiveConsentCaseIds(caseIds);
    },
    async adultCaseIds(caseIds) {
      // The memory store carries no ages; the adultOnly session gates cover
      // every route that can reach here (WP31's decision, partner-store.ts).
      return new Set(caseIds);
    },
    async caseRefs(caseIds) {
      const refs = new Map<string, string | null>();
      for (const caseId of caseIds) refs.set(caseId, store.cases.get(caseId)?.referenceNumber ?? null);
      return refs;
    },
    async append(events) {
      const memory = partnerMemory();
      for (const event of events) {
        memory.feedEvents.push({ id: randomUUID(), seq: memory.nextFeedSeq++, createdAt: new Date(), ...event });
      }
    },
  };
}

// --- Kysely (Worker) --------------------------------------------------------

function kyselyEventValues(events: FeedEventInput[]) {
  return events.map((event) => ({
    id: randomUUID(),
    fingerprintId: event.fingerprintId,
    type: event.type,
    kind: event.kind,
    caseId: event.caseId,
    caseRef: event.caseRef,
  }));
}

/** The latest event type per fingerprint, in seq order, from the whole log. */
function latestFromRows(rows: Array<{ fingerprintId: string; type: string }>, ids: string[]): Map<string, "ADD" | "WITHDRAW"> {
  const wanted = new Set(ids);
  const latest = new Map<string, "ADD" | "WITHDRAW">();
  for (const row of rows) {
    if (wanted.has(row.fingerprintId)) latest.set(row.fingerprintId, row.type as "ADD" | "WITHDRAW");
  }
  return latest;
}

function kyselyQueries(db: ReturnType<typeof getWorkerDb>): FeedQueries {
  return {
    async fingerprintFacts(ids) {
      if (ids.length === 0) return [];
      const rows = await db.selectFrom("HashSubmission").select(["id", "caseId", "status", "algorithm"])
        .where("id", "in", ids).execute();
      return rows.map((row) => ({ id: row.id, caseId: row.caseId, status: String(row.status), algorithm: String(row.algorithm) }));
    },
    async latestEventTypes(ids) {
      if (ids.length === 0) return new Map();
      const rows = await db.selectFrom("PartnerFeedEvent").select(["fingerprintId", "type"]).orderBy("seq").execute();
      return latestFromRows(rows, ids);
    },
    async liveConsentCaseIds(caseIds) {
      if (caseIds.length === 0) return new Set<string>();
      const rows = await db.selectFrom("PartnerShareConsent").select("caseId")
        .where("caseId", "in", caseIds).where("withdrawnAt", "is", null).execute();
      return new Set(rows.map((row) => row.caseId));
    },
    async adultCaseIds(caseIds) {
      if (caseIds.length === 0) return new Set<string>();
      // Rule 3 at the query: only cases whose user attested to being an adult.
      const rows = await db.selectFrom("Case").innerJoin("User", (join) => join.onRef("Case.userId", "=", "User.id"))
        .select("Case.id").where("Case.id", "in", caseIds).where("User.ageOver18", "=", true).execute();
      return new Set(rows.map((row) => row.id));
    },
    async caseRefs(caseIds) {
      if (caseIds.length === 0) return new Map();
      const rows = await db.selectFrom("Case").select(["id", "referenceNumber"]).where("id", "in", caseIds).execute();
      return new Map(rows.map((row) => [row.id, row.referenceNumber]));
    },
    async append(events) {
      if (events.length === 0) return;
      await db.insertInto("PartnerFeedEvent").values(kyselyEventValues(events)).execute();
    },
  };
}

// --- Prisma (Node dev, and the survivor routes on the Worker) --------------

// The Prisma query helpers are shared by the ambient db and the consent hooks'
// transaction; both satisfy the same model surface, so the client is typed
// loosely here and the callers keep their own types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function prismaQueries(client: any): FeedQueries {
  return {
    async fingerprintFacts(ids) {
      if (ids.length === 0) return [];
      const rows = await client.hashSubmission.findMany({
        where: { id: { in: ids } },
        select: { id: true, caseId: true, status: true, algorithm: true },
      });
      return rows.map((row: FingerprintFact) => ({ ...row, status: String(row.status), algorithm: String(row.algorithm) }));
    },
    async latestEventTypes(ids) {
      if (ids.length === 0) return new Map();
      const rows = await client.partnerFeedEvent.findMany({
        where: { fingerprintId: { in: ids } },
        select: { fingerprintId: true, type: true, seq: true },
        orderBy: { seq: "asc" },
      });
      return latestFromRows(rows, ids);
    },
    async liveConsentCaseIds(caseIds) {
      if (caseIds.length === 0) return new Set<string>();
      const rows = await client.partnerShareConsent.findMany({
        where: { caseId: { in: caseIds }, withdrawnAt: null },
        select: { caseId: true },
        distinct: ["caseId"],
      });
      return new Set(rows.map((row: { caseId: string }) => row.caseId));
    },
    async adultCaseIds(caseIds) {
      if (caseIds.length === 0) return new Set<string>();
      // Rule 3 at the query: only cases whose user attested to being an adult.
      const rows = await client.case.findMany({
        where: { id: { in: caseIds }, user: { ageOver18: true } },
        select: { id: true },
      });
      return new Set(rows.map((row: { id: string }) => row.id));
    },
    async caseRefs(caseIds) {
      if (caseIds.length === 0) return new Map();
      const rows = await client.case.findMany({ where: { id: { in: caseIds } }, select: { id: true, referenceNumber: true } });
      return new Map(rows.map((row: { id: string; referenceNumber: string }) => [row.id, row.referenceNumber]));
    },
    async append(events) {
      if (events.length === 0) return;
      // createMany lets Postgres hand out the seq numbers in one statement;
      // the events are sorted so the order inside the batch is deterministic.
      await client.partnerFeedEvent.createMany({ data: events.map((event) => ({ id: randomUUID(), ...event })) });
    },
  };
}

async function resolveQueries(explicit?: FeedQueries): Promise<FeedQueries> {
  if (explicit) return explicit;
  if (isDevNoDb()) return memoryQueries();
  if (usesWorkerKysely()) return kyselyQueries(getWorkerDb());
  return prismaQueries(await prismaDb());
}

// ---------------------------------------------------------------------------
// The sync itself

/**
 * Writes the events that make the feed match reality: an ADD for every
 * shareable fingerprint whose latest event is not an ADD, a WITHDRAW for
 * every previously shared fingerprint that stopped being shareable. Safe to
 * call for any fingerprint at any time; a fingerprint whose state did not
 * change writes nothing.
 */
export async function syncPartnerFeedFingerprints(
  ids: string[],
  queries?: FeedQueries,
): Promise<{ added: number; withdrawn: number }> {
  const db = await resolveQueries(queries);
  const unique = [...new Set(ids)];
  if (unique.length === 0) return { added: 0, withdrawn: 0 };
  const facts = await db.fingerprintFacts(unique);
  if (facts.length === 0) return { added: 0, withdrawn: 0 };
  const caseIds = [...new Set(facts.map((fact) => fact.caseId))];
  const [latest, consentCases, adultCases, refs] = await Promise.all([
    db.latestEventTypes(facts.map((fact) => fact.id)),
    db.liveConsentCaseIds(caseIds),
    db.adultCaseIds(caseIds),
    db.caseRefs(caseIds),
  ]);

  const events: FeedEventInput[] = [];
  for (const fact of [...facts].sort((a, b) => a.id.localeCompare(b.id))) {
    const shareable = consentCases.has(fact.caseId) && adultCases.has(fact.caseId) && isPartnerShareableStatus(fact.status);
    const last = latest.get(fact.id);
    if (shareable && last !== "ADD") {
      events.push({ fingerprintId: fact.id, type: "ADD", kind: kindForAlgorithm(fact.algorithm), caseId: fact.caseId, caseRef: refs.get(fact.caseId) ?? null });
    } else if (!shareable && last === "ADD") {
      events.push({ fingerprintId: fact.id, type: "WITHDRAW", kind: kindForAlgorithm(fact.algorithm), caseId: fact.caseId, caseRef: refs.get(fact.caseId) ?? null });
    }
  }
  await db.append(events);
  return { added: events.filter((event) => event.type === "ADD").length, withdrawn: events.filter((event) => event.type === "WITHDRAW").length };
}

/** Every fingerprint id on a case, on the ambient backend. */
export async function fingerprintIdsForCase(caseId: string): Promise<string[]> {
  if (isDevNoDb()) {
    return [...crawlMemory().fingerprints.values()].filter((f) => f.caseId === caseId).map((f) => f.id).sort();
  }
  if (usesWorkerKysely()) {
    const rows = await getWorkerDb().selectFrom("HashSubmission").select("id").where("caseId", "=", caseId).execute();
    return rows.map((row) => row.id).sort();
  }
  const db = await prismaDb();
  const rows = await db.hashSubmission.findMany({ where: { caseId }, select: { id: true } });
  return rows.map((row) => row.id).sort();
}

/** Syncs every fingerprint of one case (consent given, consent withdrawn, ...). */
export async function syncPartnerFeedForCase(caseId: string): Promise<{ added: number; withdrawn: number }> {
  return syncPartnerFeedFingerprints(await fingerprintIdsForCase(caseId));
}

/** Syncs one fingerprint (hash approval, hash rejection). */
export async function syncPartnerFeedFingerprint(hashSubmissionId: string): Promise<{ added: number; withdrawn: number }> {
  return syncPartnerFeedFingerprints([hashSubmissionId]);
}

/**
 * The consent hooks (partner-share-consent.ts) pass their Prisma transaction
 * here, so a consent can never exist without its feed events and a
 * withdrawal can never lose its WITHDRAW to a later failure. The transaction
 * is typed loosely: the hooks own the real type.
 */
export async function syncCaseFeedEventsPrisma(tx: unknown, caseId: string): Promise<{ added: number; withdrawn: number }> {
  const client = tx as { hashSubmission: { findMany(args: unknown): Promise<Array<{ id: string }>> } };
  const rows = await client.hashSubmission.findMany({ where: { caseId }, select: { id: true } });
  return syncPartnerFeedFingerprints(rows.map((row) => row.id), prismaQueries(tx));
}

// ---------------------------------------------------------------------------
// Erasure: nothing of hers may stay shareable

type ErasureFingerprint = { id: string; caseId: string; algorithm: string };

async function erasureWithdrawals(
  fingerprints: ErasureFingerprint[],
  latestOf: (ids: string[]) => Promise<Map<string, "ADD" | "WITHDRAW">>,
  caseRefById: Map<string, string | null>,
  append: (events: FeedEventInput[]) => Promise<void>,
): Promise<number> {
  if (fingerprints.length === 0) return 0;
  const latest = await latestOf(fingerprints.map((f) => f.id));
  const events: FeedEventInput[] = [];
  for (const fingerprint of fingerprints) {
    if (latest.get(fingerprint.id) !== "ADD") continue;
    events.push({
      fingerprintId: fingerprint.id,
      type: "WITHDRAW",
      kind: kindForAlgorithm(fingerprint.algorithm),
      caseId: fingerprint.caseId,
      caseRef: caseRefById.get(fingerprint.caseId) ?? null,
    });
  }
  if (events.length === 0) return 0;
  await append(events);
  return events.length;
}

/**
 * Account erasure (case-ops.ts): every fingerprint of the erased cases whose
 * latest event is an ADD gets its WITHDRAW, written inside the erasure
 * transaction so it can never be lost. The fingerprints themselves are kept
 * (HARD_DELETE_RETAINED) — partners are told to delete them anyway, which is
 * the point of Rule 2's "case deletion" clause. `caseRefById` carries the
 * reference numbers read before the cases are cleared.
 */
export async function withdrawSharedFingerprintsForErasureKysely(
  db: ReturnType<typeof getWorkerDb>,
  caseIds: string[],
  caseRefById: Map<string, string | null>,
): Promise<number> {
  if (caseIds.length === 0) return 0;
  const rows = await db.selectFrom("HashSubmission").select(["id", "caseId", "algorithm"])
    .where("caseId", "in", caseIds).execute();
  return erasureWithdrawals(
    rows.map((row) => ({ id: row.id, caseId: row.caseId, algorithm: String(row.algorithm) })),
    async (ids) => {
      const eventRows = await db.selectFrom("PartnerFeedEvent").select(["fingerprintId", "type"]).orderBy("seq").execute();
      return latestFromRows(eventRows, ids);
    },
    caseRefById,
    async (events) => {
      await db.insertInto("PartnerFeedEvent").values(kyselyEventValues(events)).execute();
    },
  );
}

export async function withdrawSharedFingerprintsForErasurePrisma(
  tx: unknown,
  caseIds: string[],
  caseRefById: Map<string, string | null>,
): Promise<number> {
  if (caseIds.length === 0) return 0;
  const client = tx as {
    hashSubmission: { findMany(args: unknown): Promise<Array<{ id: string; caseId: string; algorithm: string }>> };
    partnerFeedEvent: {
      findMany(args: unknown): Promise<Array<{ fingerprintId: string; type: string; seq: number }>>;
      createMany(args: unknown): Promise<{ count: number }>;
    };
  };
  const rows = await client.hashSubmission.findMany({
    where: { caseId: { in: caseIds } },
    select: { id: true, caseId: true, algorithm: true },
  });
  return erasureWithdrawals(
    rows.map((row) => ({ id: row.id, caseId: row.caseId, algorithm: String(row.algorithm) })),
    async (ids) => {
      const eventRows = await client.partnerFeedEvent.findMany({
        where: { fingerprintId: { in: ids } },
        select: { fingerprintId: true, type: true, seq: true },
        orderBy: { seq: "asc" },
      });
      return latestFromRows(eventRows, ids);
    },
    caseRefById,
    async (events) => {
      await client.partnerFeedEvent.createMany({ data: events.map((event) => ({ id: randomUUID(), ...event })) });
    },
  );
}

/** The memory twin, for store.ts's hard delete sweep. */
export async function withdrawSharedFingerprintsForErasureMemory(
  caseIds: string[],
  caseRefById?: Map<string, string | null>,
): Promise<number> {
  if (caseIds.length === 0) return 0;
  const wanted = new Set(caseIds);
  const fingerprints = [...crawlMemory().fingerprints.values()]
    .filter((f) => wanted.has(f.caseId))
    .map((f) => ({ id: f.id, caseId: f.caseId, algorithm: "PDQ" }));
  const refs = caseRefById ?? new Map(caseIds.map((caseId) => [caseId, store.cases.get(caseId)?.referenceNumber ?? null]));
  return erasureWithdrawals(
    fingerprints,
    async (ids) => memoryLatestEventTypes(ids),
    refs,
    async (events) => {
      const memory = partnerMemory();
      for (const event of events) {
        memory.feedEvents.push({ id: randomUUID(), seq: memory.nextFeedSeq++, createdAt: new Date(), ...event });
      }
    },
  );
}

// ---------------------------------------------------------------------------
// The feed itself

export type PartnerFeedEventPayload = {
  seq: number;
  type: "add" | "withdraw";
  fingerprintId: string;
  kind: PartnerFeedKind;
  hash?: string;
  frames?: string[];
  caseRef: string | null;
};

export type PartnerFeedPage = { events: PartnerFeedEventPayload[]; nextCursor: number | null };

type FeedRow = { seq: number; type: string; fingerprintId: string; kind: string; caseRef: string | null };

async function feedRows(cursor: number, limit: number): Promise<FeedRow[]> {
  if (isDevNoDb()) {
    return partnerMemory().feedEvents
      .filter((event) => event.seq > cursor)
      .sort((a, b) => a.seq - b.seq)
      .slice(0, limit);
  }
  if (usesWorkerKysely()) {
    return getWorkerDb().selectFrom("PartnerFeedEvent")
      .select(["seq", "type", "fingerprintId", "kind", "caseRef"])
      .where("seq", ">", cursor).orderBy("seq").limit(limit).execute();
  }
  const db = await prismaDb();
  return db.partnerFeedEvent.findMany({
    where: { seq: { gt: cursor } },
    orderBy: { seq: "asc" },
    take: limit,
    select: { seq: true, type: true, fingerprintId: true, kind: true, caseRef: true },
  });
}

/**
 * One page of the feed: everything after `cursor` (0 = the beginning), at
 * most `limit` events. nextCursor is the seq of the last raw event when the
 * page was full — it advances even when ADD events were held back, so a
 * partner can never stall behind a page of filtered events.
 */
export async function getPartnerFeedPage(cursor: number, limit: number): Promise<PartnerFeedPage> {
  const rows = await feedRows(cursor, limit);
  if (rows.length === 0) return { events: [], nextCursor: null };
  const nextCursor = rows.length === limit ? rows[rows.length - 1]!.seq : null;

  // Rule 2, re-derived at serve time: an ADD carries its hash only while the
  // fingerprint is still shareable, so a withdrawn, rejected, unconsented or
  // minor fingerprint never appears in any page Asmita serves.
  const addIds = rows.filter((row) => row.type === "ADD").map((row) => row.fingerprintId);
  const shareable = addIds.length > 0 ? await shareableFingerprints(addIds) : new Map<string, { algorithm: string; hashEncrypted: string }>();

  const events: PartnerFeedEventPayload[] = [];
  for (const row of rows) {
    if (row.type === "ADD") {
      const fact = shareable.get(row.fingerprintId);
      if (!fact) continue; // not shareable any more: never hand out the hash
      let parsed: { hash: string } | { frames: string[] } | null = null;
      try {
        parsed = feedHashPayload(fact.algorithm, decryptField(fact.hashEncrypted));
      } catch {
        parsed = null; // unreadable stored value: never hand out a broken hash
      }
      if (!parsed) continue;
      events.push({
        seq: row.seq,
        type: "add",
        fingerprintId: row.fingerprintId,
        kind: kindForAlgorithm(fact.algorithm),
        caseRef: row.caseRef,
        ...parsed,
      });
    } else {
      events.push({
        seq: row.seq,
        type: "withdraw",
        fingerprintId: row.fingerprintId,
        kind: kindFromStored(row.kind),
        caseRef: row.caseRef,
      });
    }
  }
  return { events, nextCursor };
}

/** The fingerprints (by id) that are shareable right now, with their stored values. */
async function shareableFingerprints(ids: string[]): Promise<Map<string, { algorithm: string; hashEncrypted: string }>> {
  const out = new Map<string, { algorithm: string; hashEncrypted: string }>();
  let facts: Array<{ id: string; caseId: string; status: string; algorithm: string; hashEncrypted: string }> = [];
  if (isDevNoDb()) {
    facts = ids.flatMap((id) => {
      const fingerprint = crawlMemory().fingerprints.get(id);
      return fingerprint
        ? [{ id: fingerprint.id, caseId: fingerprint.caseId, status: fingerprint.status, algorithm: "PDQ", hashEncrypted: fingerprint.hashEncrypted }]
        : [];
    });
  } else if (usesWorkerKysely()) {
    const rows = await getWorkerDb().selectFrom("HashSubmission")
      .select(["id", "caseId", "status", "algorithm", "hashEncrypted"]).where("id", "in", ids).execute();
    facts = rows.map((row) => ({ ...row, status: String(row.status), algorithm: String(row.algorithm) }));
  } else {
    const db = await prismaDb();
    facts = await db.hashSubmission.findMany({
      where: { id: { in: ids } },
      select: { id: true, caseId: true, status: true, algorithm: true, hashEncrypted: true },
    });
  }
  if (facts.length === 0) return out;
  const caseIds = [...new Set(facts.map((fact) => fact.caseId))];
  const queries = await resolveQueries();
  const [consentCases, adultCases] = await Promise.all([queries.liveConsentCaseIds(caseIds), queries.adultCaseIds(caseIds)]);
  for (const fact of facts) {
    if (isPartnerShareableStatus(fact.status) && consentCases.has(fact.caseId) && adultCases.has(fact.caseId)) {
      out.set(fact.id, { algorithm: fact.algorithm, hashEncrypted: fact.hashEncrypted });
    }
  }
  return out;
}

/**
 * Whether a fingerprint id was ever shared (has any feed event at all) — the
 * outcomes route's check that a partner is reporting about something Asmita
 * actually sent it.
 */
export async function fingerprintWasShared(fingerprintId: string): Promise<boolean> {
  if (isDevNoDb()) {
    return partnerMemory().feedEvents.some((event) => event.fingerprintId === fingerprintId);
  }
  if (usesWorkerKysely()) {
    const row = await getWorkerDb().selectFrom("PartnerFeedEvent").select("id")
      .where("fingerprintId", "=", fingerprintId).limit(1).executeTakeFirst();
    return Boolean(row);
  }
  const db = await prismaDb();
  const row = await db.partnerFeedEvent.findFirst({ where: { fingerprintId }, select: { id: true } });
  return Boolean(row);
}
