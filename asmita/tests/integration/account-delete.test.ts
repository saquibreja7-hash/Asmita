import { afterEach, describe, expect, it } from "vitest";
import { inMemoryAuditLog } from "@/lib/audit";
import { processDeletionJobs } from "@/jobs/deletion-worker";
import { cases, createCase, deactivateUser, deactivatedUsers, hardDeleteDueUsers, rememberVerifiedUser, users } from "@/lib/store";

describe("account deletion flow", () => {
  afterEach(() => {
    cases.clear();
    deactivatedUsers.clear();
    inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
    users.clear();
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
    const deletion = deactivateUser("user-1");

    const deleted = await hardDeleteDueUsers(new Date(new Date(deletion.hardDeleteAfter).getTime() + 1));

    expect(deleted).toEqual(["user-1"]);
    expect(users.has("user-1")).toBe(false);
    expect(cases.has(record.id)).toBe(false);
    expect(deactivatedUsers.has("user-1")).toBe(false);
    expect(inMemoryAuditLog.some((event) => event.eventType === "CASE_HARD_DELETED")).toBe(true);
  });

  it("exposes the deletion worker entrypoint", async () => {
    deactivateUser("user-2");
    const deletion = deactivatedUsers.get("user-2")!;

    await expect(processDeletionJobs(new Date(new Date(deletion.hardDeleteAfter).getTime() + 1))).resolves.toEqual([
      "user-2",
    ]);
  });
});
