import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findUrl: vi.fn(), caseForUser: vi.fn() }));
vi.mock("@/lib/csrf", () => ({ verifyCsrfRequest: () => true }));
vi.mock("@/lib/auth/middleware", () => ({ requireSession: async () => ({ ok: true, session: { sub: "user-1" } }) }));
vi.mock("@/lib/case-ops", () => ({ getCaseForUser: mocks.caseForUser }));
vi.mock("@/lib/db", () => ({ db: { submittedUrl: { findFirst: mocks.findUrl } } }));

import { POST as signNotice } from "@/app/api/cases/[caseId]/sign-notice/route";
import { POST as signAdvisory } from "@/app/api/cases/[caseId]/sign-hash-advisory/route";

describe("notice contact validation", () => {
  const params = { params: Promise.resolve({ caseId: "case-1" }) };
  const request = (contact: string) => new Request("https://asmita.test/api/sign", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Example Person", signature: "Example Person", contact, templateRef: "template-1.digest" }),
  });
  beforeEach(() => {
    mocks.findUrl.mockReset().mockResolvedValue(null);
    mocks.caseForUser.mockReset().mockResolvedValue({ id: "case-1" });
    vi.stubEnv("ENABLE_HASH_UPLOAD", "true");
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
  });
  it("rejects a phone number for a URL notice", async () => {
    expect((await signNotice(request("+91 9000000000"), params)).status).toBe(400);
    expect(mocks.findUrl).not.toHaveBeenCalled();
    expect((await signNotice(request("person@example.invalid"), params)).status).toBe(404);
  });
  it("rejects a phone number for a fingerprint advisory", async () => {
    const advisoryRequest = (contact: string) => new Request("https://asmita.test/api/sign", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Example Person", signature: "Example Person", contact, platformIds: ["platform-1"], templateRef: "template-1.digest" }),
    });
    expect((await signAdvisory(advisoryRequest("+91 9000000000"), params)).status).toBe(400);
  });
});
