import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    hashSubmission: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/encryption", () => ({
  decryptField: vi.fn((v: string) => v.replace("enc:", "")),
  encryptField: vi.fn((v: string) => `enc:${v}`),
}));

import { db } from "@/lib/db";
import { buildCaseHashAnnex } from "@/lib/case-hash-annex";
import { generateBase32Secret } from "@/lib/auth/admin-mfa-store";
import { generateTotp, verifyAdminTotp } from "@/lib/auth/admin-mfa";
import { GET as health } from "@/app/api/health/route";

const HEX = "a".repeat(64);

describe("per-admin MFA secrets", () => {
  it("generates a base32 secret an authenticator app accepts", () => {
    const secret = generateBase32Secret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(generateBase32Secret()).not.toBe(secret);
  });

  it("verifies against the admin's own secret, not the shared one", () => {
    const own = generateBase32Secret();
    const shared = generateBase32Secret();
    process.env.ADMIN_TOTP_SECRET = shared;
    const now = new Date("2026-09-06T00:00:00Z");
    const ownCode = generateTotp(own, now);
    expect(verifyAdminTotp({ token: ownCode, secret: own, now, windowSteps: 0 })).toBe(true);
    // A code from the shared secret must not pass when an own secret is supplied.
    const sharedCode = generateTotp(shared, now);
    if (sharedCode !== ownCode) {
      expect(verifyAdminTotp({ token: sharedCode, secret: own, now, windowSteps: 0 })).toBe(false);
    }
  });
});

describe("fingerprint annex coverage", () => {
  beforeEach(() => vi.mocked(db.hashSubmission.findMany).mockReset());

  it("for signing, lists every non-rejected fingerprint", async () => {
    vi.mocked(db.hashSubmission.findMany).mockResolvedValue([
      { hashEncrypted: `enc:${HEX}`, quality: 90, clientVersion: "pdq-1", submittedAt: new Date() },
    ] as never);
    const annex = await buildCaseHashAnnex("case-1", { kind: "for-signing" });
    expect(annex).toContain(HEX);
    const where = vi.mocked(db.hashSubmission.findMany).mock.calls[0][0]?.where as Record<string, unknown>;
    expect(where.status).toEqual({ not: "REJECTED" });
  });

  it("for dispatch, sends nothing when the declaration was never signed", async () => {
    const annex = await buildCaseHashAnnex("case-1", { kind: "for-dispatch", signedAt: null });
    expect(annex).toBe("");
    expect(db.hashSubmission.findMany).not.toHaveBeenCalled();
  });

  it("for dispatch, only includes approved fingerprints submitted before signing", async () => {
    vi.mocked(db.hashSubmission.findMany).mockResolvedValue([] as never);
    const signedAt = new Date("2026-09-01T00:00:00Z");
    await buildCaseHashAnnex("case-1", { kind: "for-dispatch", signedAt });
    const where = vi.mocked(db.hashSubmission.findMany).mock.calls[0][0]?.where as Record<string, unknown>;
    expect(where.status).toEqual({ in: ["APPROVED", "DISPATCHED"] });
    expect(where.submittedAt).toEqual({ lte: signedAt });
  });
});

describe("health endpoint", () => {
  it("reveals no configuration without the cron secret", async () => {
    process.env.CRON_SECRET = "cron-secret-for-tests-that-is-long";
    const res = await health(new Request("http://localhost/api/health"));
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns configuration to the cron caller", async () => {
    process.env.CRON_SECRET = "cron-secret-for-tests-that-is-long";
    const res = await health(
      new Request("http://localhost/api/health", {
        headers: { authorization: "Bearer cron-secret-for-tests-that-is-long" },
      }),
    );
    expect(await res.json()).toMatchObject({ ok: true, service: "asmita" });
  });
});
