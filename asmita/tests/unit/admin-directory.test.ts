import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Admins page's directory (review-console-spec.md WP144) on the memory
// backend: one row per allowlisted admin, roles read-only from ADMIN_ROLES,
// the MFA enrolment, the last sign-in from the audit trail, and the review
// queues each admin can reach — with no full email address anywhere: the
// page data carries the hash and the masked form only. Invented addresses.

vi.mock("@/lib/security-log", () => ({ logSecurityEvent: vi.fn() }));

import { inMemoryAuditLog, writeAuditLog } from "@/lib/audit";
import { createAdminIdentity } from "@/lib/auth/admin-allowlist";
import { generateTotp } from "@/lib/auth/admin-mfa";
import { confirmAdminMfa, enrolAdminMfa, resetAdminMfa } from "@/lib/auth/admin-mfa-store";
import { hashEmail } from "@/lib/hash";
import { listAdminDirectory, maskAdminEmail } from "@/lib/admin-directory";
import { grantReviewQueueAccess, resetReviewMemory } from "@/lib/review-jobs";
import { resetReviewAdapters, registerComplaintReviewAdapters } from "@/lib/review-adapters";

const OWNER = "directory-owner@example.test";
const REVIEWER = "directory-reviewer@example.test";
const GO_EDITOR = "directory-go@example.test";
const NO_ROLE = "directory-norole@example.test";

const saved: Record<string, string | undefined> = {};
const ENV = ["DATABASE_URL", "ADMIN_EMAILS", "ADMIN_ROLES", "AUDIT_LOG_PERSISTENCE"];

beforeEach(() => {
  for (const name of ENV) saved[name] = process.env[name];
  delete process.env.DATABASE_URL;
  delete process.env.AUDIT_LOG_PERSISTENCE;
  process.env.ADMIN_EMAILS = [OWNER, REVIEWER, GO_EDITOR, NO_ROLE].join(",");
  process.env.ADMIN_ROLES = `${OWNER}=SUPER_ADMIN,${REVIEWER}=CASE_REVIEWER,${GO_EDITOR}=GO_EDITOR`;
  resetReviewMemory();
  resetReviewAdapters();
  registerComplaintReviewAdapters();
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
});

afterEach(async () => {
  await resetAdminMfa(hashEmail(OWNER));
  await resetAdminMfa(hashEmail(REVIEWER));
  for (const name of ENV) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

describe("maskAdminEmail", () => {
  it("never shows the local part beyond its first character", () => {
    const masked = maskAdminEmail(OWNER);
    expect(masked).toBe("d*****@example.test");
    expect(masked).not.toContain("directory-owner");
    // The domain stays: the owner configured it and it is not survivor data.
    expect(masked.endsWith("@example.test")).toBe(true);
  });
});

describe("listAdminDirectory", () => {
  it("lists one row per allowlisted admin, with roles, MFA state and reachable queues", async () => {
    const secret = await enrolAdminMfa(hashEmail(OWNER));
    expect(secret).toBeTruthy();
    expect(await confirmAdminMfa(hashEmail(OWNER), generateTotp(secret!))).toBe(true);

    // A recorded sign-in for the reviewer.
    const reviewerIdentity = createAdminIdentity(REVIEWER);
    await writeAuditLog({
      eventType: "ADMIN_ACTION",
      entityType: "Admin",
      entityId: reviewerIdentity.id,
      actorId: reviewerIdentity.id,
      data: { action: "ADMIN_LOGIN", mfa: "enrolled" },
    });

    const rows = await listAdminDirectory();
    expect(rows).toHaveLength(4);
    const byHash = new Map(rows.map((row) => [row.emailHash, row]));

    const owner = byHash.get(hashEmail(OWNER))!;
    expect(owner.role).toBe("SUPER_ADMIN");
    expect(owner.mfaEnrolled).toBe(true);
    expect(owner.lastSignInAt).toBeNull();
    // A SUPER_ADMIN reaches every queue, minor-hold included.
    expect(owner.queueNames).toContain("Flagged links");
    expect(owner.queueNames).toContain("Possible minor");

    const reviewer = byHash.get(hashEmail(REVIEWER))!;
    expect(reviewer.role).toBe("CASE_REVIEWER");
    expect(reviewer.mfaEnrolled).toBe(false);
    expect(reviewer.lastSignInAt).toBeTruthy();
    expect(reviewer.queueNames).toEqual(["Flagged links", "Fingerprints", "Crawler findings"]);

    const goEditor = byHash.get(hashEmail(GO_EDITOR))!;
    expect(goEditor.role).toBe("GO_EDITOR");
    expect(goEditor.queueNames).toEqual(["Partner applications"]);

    const noRole = byHash.get(hashEmail(NO_ROLE))!;
    expect(noRole.role).toBeNull();
    expect(noRole.roleProblem).toBe("role_missing");
    expect(noRole.queueNames).toEqual([]);

    // The WP144 queue access narrows what the directory reports: once the
    // links queue lists only the reviewer, everyone else loses it.
    const { getReviewQueueByKey } = await import("@/lib/review-jobs");
    const linksQueue = await getReviewQueueByKey("links");
    if (!linksQueue) throw new Error("links queue missing");
    const granted = await grantReviewQueueAccess({
      queueId: linksQueue.id,
      adminEmailHash: hashEmail(REVIEWER),
      callerRole: "SUPER_ADMIN",
      actorId: "admin-owner",
    });
    expect(granted.ok).toBe(true);
    const narrowed = await listAdminDirectory();
    const narrowedReviewer = narrowed.find((row) => row.emailHash === hashEmail(REVIEWER))!;
    // The other queues keep no rows, so the reviewer still sees them.
    expect(narrowedReviewer.queueNames).toEqual(["Flagged links", "Fingerprints", "Crawler findings"]);
    const narrowedOwner = narrowed.find((row) => row.emailHash === hashEmail(OWNER))!;
    expect(narrowedOwner.queueNames).not.toContain("Flagged links");

    // No full address ever leaves the module: only the masked form does.
    const serialised = JSON.stringify(rows) + JSON.stringify(narrowed);
    expect(serialised).not.toContain("directory-owner");
    expect(serialised).not.toContain("directory-reviewer");
    expect(serialised).not.toContain("directory-go");
    expect(serialised).not.toContain("directory-norole");
    expect(serialised).toContain("d*****@example.test");
  });

  it("gives every row an opaque target key that is not the email hash", async () => {
    const { allowlistedHashByTargetKey } = await import("@/lib/auth/admin-allowlist");
    const rows = await listAdminDirectory();
    for (const row of rows) {
      // The key is the hash OF the hash: a page carrying it does not carry
      // the single-step hash that every console row is keyed by.
      expect(row.targetKey).toBe(hashEmail(row.emailHash));
      expect(row.targetKey).not.toBe(row.emailHash);
      expect(allowlistedHashByTargetKey(row.targetKey)).toBe(row.emailHash);
    }
    // A key that matches no allowlisted admin resolves to nothing.
    expect(allowlistedHashByTargetKey(hashEmail(hashEmail("stranger@example.test")))).toBeNull();
  });
});
