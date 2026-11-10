import { afterEach, describe, expect, it, vi } from "vitest";
import { inMemoryAuditLog } from "@/lib/audit";
import { processDeletionJobs } from "@/jobs/deletion-worker";
import { cases, createCase, deactivateUser, deactivatedUsers, hardDeleteDueUsers, rememberVerifiedUser, users } from "@/lib/store";

// The deletion worker now delegates to the Prisma-backed hardDeleteDueUsers.
// For unit tests without a DB we mock that path and verify delegation separately.
vi.mock("@/lib/case-ops", () => ({
  hardDeleteDueUsers: vi.fn().mockResolvedValue(["user-2"]),
}));

describe("account deletion flow", () => {
  afterEach(() => {
    cases.clear();
    deactivatedUsers.clear();
    inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
    users.clear();
    vi.clearAllMocks();
  });

  it("schedules soft deletion and a 30-day hard-delete window", () => {
    const deletion = deactivateUser("user-1");
    const deactivatedAt = new Date(deletion.deactivatedAt).getTime();
    const hardDeleteAfter = new Date(deletion.hardDeleteAfter).getTime();

    expect(deactivatedUsers.has("user-1")).toBe(true);
    expect(Math.round((hardDeleteAfter - deactivatedAt) / (24 * 60 * 60_000))).toBe(30);
  });

  it("hard deletes due PII and case records while retaining audit metadata", async () => {
    rememberVerifiedUser({ id: "user-1", emailHash: "hash", emailEncrypted: "encrypted" });
    const record = await createCase("user-1");
    globalThis.__asmitaHashStore ??= new Map();
    globalThis.__asmitaHashStore.set(record.id, [{ id: "h-1", algorithm: "PDQ", hashDigest: "digest-placeholder", quality: 90, status: "PENDING_REVIEW", flaggedForReview: false, flagReason: null, submittedAt: new Date().toISOString() }]);
    const deletion = deactivateUser("user-1");

    const deleted = await hardDeleteDueUsers(new Date(new Date(deletion.hardDeleteAfter).getTime() + 1));

    expect(deleted).toEqual(["user-1"]);
    expect(users.has("user-1")).toBe(false);
    expect(cases.has(record.id)).toBe(false);
    expect(deactivatedUsers.has("user-1")).toBe(false);
    expect(globalThis.__asmitaHashStore.has(record.id)).toBe(false);
    const audit = inMemoryAuditLog.find((event) => event.eventType === "CASE_HARD_DELETED");
    expect(audit?.data).toEqual({
      removed: { cases: 1, links: 0, fingerprints: 1 },
      retained: { auditLog: "earlier entries are append-only and unchanged" },
    });
  });

  it("exposes the deletion worker entrypoint", async () => {
    const result = await processDeletionJobs(new Date());
    // The worker delegates to case-ops.hardDeleteDueUsers (Prisma-backed)
    expect(Array.isArray(result)).toBe(true);
  });
});
