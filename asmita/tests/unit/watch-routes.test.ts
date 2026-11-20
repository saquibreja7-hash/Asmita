import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The watch entry routes (WP22): the verify-otp "watch" purpose with its
// minor routing, POST /api/watch (create the watch case + fingerprints +
// authorisation draft; never a link), and POST /api/cases/:id/watch/convert
// ("Take it down"). Placeholder data only.

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  otpVerify: vi.fn(),
  signSession: vi.fn(),
  upsertVerifiedUser: vi.fn(),
  findVerifiedUserByEmail: vi.fn(),
  listCaseIdsForUser: vi.fn(),
  createWatchCase: vi.fn(),
  convertWatchToCase: vi.fn(),
  addHashesToCase: vi.fn(),
  draft: vi.fn(),
}));

vi.mock("@/lib/csrf", () => ({ verifyCsrfRequest: () => true }));
vi.mock("@/lib/auth/middleware", () => ({ requireSession: mocks.session }));
vi.mock("@/lib/auth/otp", () => ({ verifyOtp: mocks.otpVerify }));
vi.mock("@/lib/auth/jwt", () => ({ signSession: mocks.signSession }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/security-log", () => ({ logSecurityEvent: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitAsync: async () => ({ allowed: true }) }));
vi.mock("@/lib/case-ops", () => ({
  upsertVerifiedUser: mocks.upsertVerifiedUser,
  findVerifiedUserByEmail: mocks.findVerifiedUserByEmail,
  listCaseIdsForUser: async () => [],
  listCasesForUser: async (userId: string) => casesOf(userId),
  getCaseForUser: async (caseId: string, userId: string) => {
    const record = casesOf(userId).find((entry) => entry.id === caseId);
    return record ?? null;
  },
}));
vi.mock("@/lib/watch-ops", () => ({
  createWatchCase: mocks.createWatchCase,
  convertWatchToCase: mocks.convertWatchToCase,
  notifyWatchCopyFound: vi.fn(),
}));
vi.mock("@/lib/hash-submission", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hash-submission")>();
  return { ...actual, addHashesToCase: mocks.addHashesToCase };
});
vi.mock("@/lib/crawl-consent", () => ({
  CRAWL_AUTHORISATION_TYPE: "CRAWL_AUTHORISATION",
  WATCH_AUTHORISATION_TYPE: "WATCH_AUTHORISATION",
  buildCrawlAuthorisationDraft: mocks.draft,
  crawlAuthorisationTypeFor: (mode: string) => (mode === "WATCH" ? "WATCH_AUTHORISATION" : "CRAWL_AUTHORISATION"),
  getCrawlConsentState: vi.fn(),
  recordCrawlConsent: vi.fn(),
  withdrawCrawlConsent: vi.fn(),
  stopWatching: vi.fn(),
}));

// A tiny in-memory case list the mocked case-ops reads.
let world: Array<{ id: string; userId: string; mode: "CASE" | "WATCH"; referenceNumber: string }> = [];
function casesOf(userId: string) {
  return world.filter((entry) => entry.userId === userId).map((entry) => ({ ...entry, urls: [], createdAt: "", status: "OPEN" }));
}

import { POST as verifyOtp } from "@/app/api/auth/verify-otp/route";
import { POST as createWatch } from "@/app/api/watch/route";
import { POST as convertWatch } from "@/app/api/cases/[caseId]/watch/convert/route";

const adult = { ok: true as const, session: { sub: "user-1", ageOver18: true, emailHash: "hash-1" } };
const minor = { ok: false as const, status: 403, error: "minor_pathway_required" };

const req = (path: string, body: unknown) =>
  new Request(`https://asmita.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const PDQ = "ab".repeat(32);
const hashes = [{ hash: PDQ, quality: 90, clientVersion: "pdq-test" }];

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
  vi.stubEnv("ENABLE_HASH_UPLOAD", "true");
  vi.stubEnv("ENABLE_CRAWLER", "true");
  world = [];
  mocks.session.mockReset().mockResolvedValue(adult);
  mocks.otpVerify.mockReset().mockResolvedValue(true);
  mocks.signSession.mockReset().mockReturnValue("session-token");
  mocks.upsertVerifiedUser.mockReset().mockResolvedValue({ id: "user-1", emailHash: "hash-1" });
  mocks.findVerifiedUserByEmail.mockReset().mockResolvedValue(null);
  mocks.createWatchCase.mockReset().mockResolvedValue({ id: "watch-1", referenceNumber: "ASMITA-2026-00001" });
  mocks.convertWatchToCase.mockReset().mockResolvedValue({ ok: true, withdrawnConsentIds: ["c-1"] });
  mocks.addHashesToCase.mockReset().mockResolvedValue([{ ok: true, duplicate: false, submission: {} }]);
  mocks.draft.mockReset().mockResolvedValue({
    template: { id: "tpl-watch" }, hashSubmissionIds: ["hs-1"],
    subject: "Authorisation to watch", body: "The watch authorisation text", templateRef: "tpl-watch.ref.fp",
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("signing in for a watch (verify-otp, purpose watch)", () => {
  it("sends an adult to /watch with a session", async () => {
    const res = await verifyOtp(req("/api/auth/verify-otp", { email: "survivor@example.invalid", otp: "123456", ageOver18: true, purpose: "watch" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { redirectTo?: string };
    expect(body.redirectTo).toBe("/watch");
    expect(mocks.upsertVerifiedUser).toHaveBeenCalledWith("survivor@example.invalid", true);
    expect(res.headers.get("set-cookie")).toContain("asmita_session=");
  });

  it("a minor is routed to minor support before anything else: no account, no session, no watch", async () => {
    const res = await verifyOtp(req("/api/auth/verify-otp", { email: "minor@example.invalid", otp: "123456", ageOver18: false, purpose: "watch" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { redirectTo?: string };
    expect(body.redirectTo).toBe("/minor-support");
    expect(mocks.upsertVerifiedUser).not.toHaveBeenCalled();
    expect(mocks.signSession).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("refuses a watch purpose without the age answer", async () => {
    const res = await verifyOtp(req("/api/auth/verify-otp", { email: "survivor@example.invalid", otp: "123456", purpose: "watch" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/watch", () => {
  it("creates the watch case, stores the fingerprints and answers with the tick draft", async () => {
    const res = await createWatch(req("/api/watch", { hashes }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { caseId?: string; draft?: { templateRef?: string } };
    expect(body.caseId).toBe("watch-1");
    expect(body.draft?.templateRef).toBe("tpl-watch.ref.fp");
    expect(mocks.createWatchCase).toHaveBeenCalledWith("user-1");
    expect(mocks.addHashesToCase).toHaveBeenCalledWith("watch-1", hashes);
    // No link is ever asked for or stored.
    expect(JSON.stringify(mocks.createWatchCase.mock.calls)).not.toContain("urls");
  });

  it("refuses a minor before anything is read or written", async () => {
    mocks.session.mockResolvedValue(minor);
    const res = await createWatch(req("/api/watch", { hashes }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "minor_pathway_required" });
    expect(mocks.createWatchCase).not.toHaveBeenCalled();
  });

  it("refuses anything that is not a 64-hex fingerprint, creating nothing", async () => {
    for (const bad of [
      { hashes: [{ hash: "data:image/png;base64,AAAA", quality: 90 }] },
      { hashes: [{ hash: "zz", quality: 90 }] },
      { hashes: [{ hash: PDQ, quality: 101 }] },
      { hashes: [] },
      {},
    ]) {
      const res = await createWatch(req("/api/watch", bad));
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
    expect(mocks.createWatchCase).not.toHaveBeenCalled();
  });

  it("sends her to her existing watch instead of creating a second one", async () => {
    world = [{ id: "watch-old", userId: "user-1", mode: "WATCH", referenceNumber: "ASMITA-2026-00009" }];
    const res = await createWatch(req("/api/watch", { hashes }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { caseId?: string; existing?: boolean };
    expect(body).toMatchObject({ caseId: "watch-old", existing: true });
    expect(mocks.createWatchCase).not.toHaveBeenCalled();
  });

  it("does not exist when hash upload is off", async () => {
    vi.stubEnv("ENABLE_HASH_UPLOAD", "false");
    expect((await createWatch(req("/api/watch", { hashes }))).status).toBe(404);
  });
});

describe("POST /api/cases/:id/watch/convert (Take it down)", () => {
  const context = { params: Promise.resolve({ caseId: "watch-1" }) };

  it("converts her watch and answers with the new mode", async () => {
    world = [{ id: "watch-1", userId: "user-1", mode: "WATCH", referenceNumber: "ASMITA-2026-00001" }];
    const res = await convertWatch(req("/api/cases/watch-1/watch/convert", {}), context);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, mode: "CASE" });
    expect(mocks.convertWatchToCase).toHaveBeenCalledWith("watch-1", "user-1");
  });

  it("refuses a case that is not a watch, and a case that is not hers", async () => {
    world = [{ id: "case-9", userId: "user-1", mode: "CASE", referenceNumber: "ASMITA-2026-00002" }];
    const notWatch = await convertWatch(req("/api/cases/case-9/watch/convert", {}), { params: Promise.resolve({ caseId: "case-9" }) });
    expect(notWatch.status).toBe(409);
    expect(await notWatch.json()).toEqual({ error: "not_a_watch" });

    const notHers = await convertWatch(req("/api/cases/watch-1/watch/convert", {}), context);
    expect(notHers.status).toBe(404);
    expect(mocks.convertWatchToCase).not.toHaveBeenCalled();
  });

  it("refuses a minor session before anything changes", async () => {
    world = [{ id: "watch-1", userId: "user-1", mode: "WATCH", referenceNumber: "ASMITA-2026-00001" }];
    mocks.session.mockResolvedValue(minor);
    const res = await convertWatch(req("/api/cases/watch-1/watch/convert", {}), context);
    expect(res.status).toBe(403);
    expect(mocks.convertWatchToCase).not.toHaveBeenCalled();
  });
});
