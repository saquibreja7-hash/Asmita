import { partnerMemory } from "@/lib/partner-store";
import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";

/*
 * Partner programme part 2 (WP33): the per-partner metrics the admin
 * console shows — fingerprints delivered, outcomes reported, and the
 * median time between a fingerprint reaching the feed and the partner
 * reporting an outcome about it.
 *
 * "Fingerprints delivered" counts the distinct fingerprints that have an
 * ADD event in the feed, because the feed is one shared stream every
 * ACTIVE partner polls with its own key (WP32's recorded decision): this
 * is what a partner that polls receives. It is therefore the same number
 * for every partner, and the console says so next to it. "Outcomes
 * reported" and the median are the partner's own.
 *
 * The median is measured from the fingerprint's first ADD event (when it
 * became shareable with partners) to the outcome row's creation, over the
 * outcomes that name a fingerprint Asmita actually shared; outcomes about
 * an unknown or unshared fingerprint count as reported but carry no
 * duration. Null when no outcome has a measurable duration.
 *
 * Backends like every partner module: the in-memory store without
 * DATABASE_URL (dev/tests), Kysely on the Worker, Prisma otherwise. Ids
 * and times only — nothing here reads an address, a hash value or
 * anything survivor-facing.
 */

export type PartnerMetrics = {
  /** Distinct fingerprints with an ADD event in the shared feed. */
  fingerprintsDelivered: number;
  /** Rows this partner reported through POST /api/partner/v1/outcomes. */
  outcomesReported: number;
  /** Median first-ADD-to-outcome duration in ms; null when not measurable. */
  medianTimeToOutcomeMs: number | null;
};

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

async function prismaDb() {
  const { db } = await import("@/lib/db");
  return db;
}

export function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** The first ADD time per fingerprint id, and the total distinct count. */
async function firstAddTimes(db?: Awaited<ReturnType<typeof prismaDb>>): Promise<Map<string, Date>> {
  const first = new Map<string, Date>();
  let rows: Array<{ fingerprintId: string; createdAt: Date }>;
  if (isDevNoDb()) {
    rows = partnerMemory().feedEvents
      .filter((event) => event.type === "ADD")
      .sort((a, b) => a.seq - b.seq)
      .map((event) => ({ fingerprintId: event.fingerprintId, createdAt: event.createdAt }));
  } else if (usesWorkerKysely()) {
    rows = await getWorkerDb().selectFrom("PartnerFeedEvent")
      .select(["fingerprintId", "createdAt"])
      .where("type", "=", "ADD")
      .orderBy("seq").execute();
  } else {
    // One client, resolved once by the caller: the two reads below share
    // it instead of importing the module concurrently.
    const client = db ?? (await prismaDb());
    rows = await client.partnerFeedEvent.findMany({
      where: { type: "ADD" },
      select: { fingerprintId: true, createdAt: true, seq: true },
      orderBy: { seq: "asc" },
    });
  }
  for (const row of rows) {
    const when = new Date(row.createdAt);
    const known = first.get(row.fingerprintId);
    if (!known || when < known) first.set(row.fingerprintId, when);
  }
  return first;
}

/** This partner's reported outcomes: the fingerprint id and the time. */
async function partnerOutcomeTimes(partnerId: string, db?: Awaited<ReturnType<typeof prismaDb>>): Promise<Array<{ fingerprintId: string | null; createdAt: Date }>> {
  if (isDevNoDb()) {
    return partnerMemory().outcomes
      .filter((outcome) => outcome.partnerId === partnerId)
      .map((outcome) => ({ fingerprintId: outcome.fingerprintId, createdAt: outcome.createdAt }));
  }
  if (usesWorkerKysely()) {
    const rows = await getWorkerDb().selectFrom("PartnerOutcome")
      .select(["fingerprintId", "createdAt"])
      .where("partnerId", "=", partnerId)
      .orderBy("createdAt").execute();
    return rows.map((row) => ({ fingerprintId: row.fingerprintId, createdAt: new Date(row.createdAt) }));
  }
  const client = db ?? (await prismaDb());
  const rows = await client.partnerOutcome.findMany({
    where: { partnerId },
    select: { fingerprintId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => ({ fingerprintId: row.fingerprintId, createdAt: row.createdAt }));
}

/** The WP33 metrics for one partner, for the admin partner page. */
export async function getPartnerMetrics(partnerId: string): Promise<PartnerMetrics> {
  // The Prisma client is resolved once and shared by both reads, so the two
  // never import the database module at the same time.
  const db = isDevNoDb() || usesWorkerKysely() ? undefined : await prismaDb();
  const [firstAdds, outcomes] = await Promise.all([firstAddTimes(db), partnerOutcomeTimes(partnerId, db)]);
  const durations: number[] = [];
  for (const outcome of outcomes) {
    const sharedAt = outcome.fingerprintId === null ? undefined : firstAdds.get(outcome.fingerprintId);
    if (!sharedAt) continue;
    const duration = new Date(outcome.createdAt).getTime() - sharedAt.getTime();
    if (duration >= 0) durations.push(duration);
  }
  return {
    fingerprintsDelivered: firstAdds.size,
    outcomesReported: outcomes.length,
    medianTimeToOutcomeMs: medianOf(durations),
  };
}
