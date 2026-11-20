import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The scorecard's read-only guarantee (docs/org/spec.md, WP58 58.3): the
 * scorecard reads complaint data and never writes to the complaint workflow.
 * The mocked client below serves the three findMany reads and throws on any
 * other property access, so any mutation attempt fails the test. Synthetic
 * data only.
 */

const fixtures = vi.hoisted(() => {
  const SENT = "2026-08-15T10:00:00.000Z";
  const urlNotices = [
    {
      id: "n-1",
      urlId: "u-1",
      sentAt: new Date(SENT),
      responseReceivedAt: new Date("2026-08-15T11:30:00.000Z"),
      responseType: "REMOVED",
      removedAt: new Date("2026-08-15T11:30:00.000Z"),
      followUpOf: null,
      submittedUrl: { platformId: "platform-a", status: "REMOVED" },
    },
    {
      id: "n-2",
      urlId: "u-2",
      sentAt: new Date(SENT),
      responseReceivedAt: null,
      responseType: null,
      removedAt: null,
      followUpOf: "n-1",
      submittedUrl: { platformId: "platform-a", status: "REMOVED" },
    },
  ];
  const hashDispatches = [
    { platformId: "platform-a", dispatchedAt: new Date(SENT) },
    { platformId: "platform-b", dispatchedAt: new Date(SENT) },
  ];
  const platforms = [
    { id: "platform-a", name: "Example Chat" },
    { id: "platform-b", name: "Example Video" },
  ];
  return { urlNotices, hashDispatches, platforms };
});

const upsertCalls = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => {
  const delegate = {
    notice: { findMany: vi.fn().mockResolvedValue(fixtures.urlNotices) },
    hashDispatch: { findMany: vi.fn().mockResolvedValue(fixtures.hashDispatches) },
    platform: { findMany: vi.fn().mockResolvedValue(fixtures.platforms) },
    // The only table any scorecard code may write: the snapshot itself.
    scorecardSnapshot: { upsert: upsertCalls, findUnique: vi.fn().mockResolvedValue(null) },
  };
  const db = new Proxy(delegate, {
    get(target, prop, receiver) {
      if (!(prop in target)) {
        throw new Error(`scorecard wrote to the complaint workflow: db.${String(prop)}`);
      }
      return Reflect.get(target, prop, receiver);
    },
  });
  return { db };
});

vi.mock("@/lib/audit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  inMemoryAuditLog: [],
}));

import { collectScorecardRows, recomputeScorecardSnapshot } from "@/lib/scorecard-snapshots";
import { aggregateScorecard } from "@/lib/scorecard";

describe("the scorecard reads complaint data without ever writing it", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgresql://scorecard:test@127.0.0.1:5432/scorecard_readonly");
    vi.stubEnv("NODE_ENV", "test");
    upsertCalls.mockClear();
  });

  it("collects rows with findMany only — any mutation would throw", async () => {
    const rows = await collectScorecardRows();
    expect(rows.urlNotices).toHaveLength(1);
    expect(rows.urlNotices[0]).toMatchObject({
      platformId: "platform-a",
      urlStatus: "REMOVED",
      followUps: 1, // the follow-up notice was counted against its original
    });
    expect(rows.hashAdvisories).toEqual([
      { platformId: "platform-a", dispatchedAt: "2026-08-15T10:00:00.000Z" },
      { platformId: "platform-b", dispatchedAt: "2026-08-15T10:00:00.000Z" },
    ]);
  });

  it("computes a snapshot writing only to ScorecardSnapshot", async () => {
    const result = await recomputeScorecardSnapshot("2026-Q3", "admin-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(upsertCalls).toHaveBeenCalledTimes(1);
    expect(upsertCalls.mock.calls[0][0]).toMatchObject({ where: { period: "2026-Q3" } });
  });

  it("stores no case, notice or url id anywhere in the aggregate", async () => {
    const rows = await collectScorecardRows();
    const data = aggregateScorecard({ period: "2026-Q3", ...rows });
    const serialized = JSON.stringify(data);
    expect(serialized).not.toMatch(/u-1|n-1|n-2|platform-a|platform-b|caseId|urlId|noticeId/);
    // Only platform names and numbers leave the computation (both synthetic
    // platforms fall under the small-number rule with this fixture, which is
    // itself part of what is being pinned).
    expect(data.platforms.map((row) => row.platformName)).toEqual(["Example Chat", "Example Video"]);
    expect(data.platforms.every((row) => row.insufficient)).toBe(true);
  });
});
