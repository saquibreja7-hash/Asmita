import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/partners/route";
import { createCsrfPair } from "@/lib/csrf";
import { listPartnerApplications, partnerApplications } from "@/lib/platform-partners";
import { normaliseDomain } from "@/lib/platform-partners-shared";

// Synthetic data only: example domains and invalid addresses.
const valid = {
  organisationName: "Example Media Pvt Ltd",
  platformName: "ExampleTube",
  website: "https://www.Example-Tube.example/upload",
  platformType: "VIDEO",
  userBase: "LAKH_10L",
  contactName: "Test Officer",
  contactRole: "Grievance Officer",
  contactEmail: "grievance@example.invalid",
  contactPhone: "+91 00000 00000",
  interests: ["FINGERPRINT_ALERTS", "TAKEDOWN_CHANNEL", "TAKEDOWN_CHANNEL"],
  message: "We would like to join.",
  authorised: true,
};

let ipCounter = 0;
function req(body: unknown, options: { csrf?: boolean; ip?: string } = {}) {
  const csrf = createCsrfPair();
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "cf-connecting-ip": options.ip ?? `198.51.100.${(ipCounter += 1)}`,
  };
  if (options.csrf !== false) {
    headers.cookie = `asmita_csrf=${csrf.nonce}`;
    headers["x-csrf-token"] = csrf.token;
  }
  return new Request("https://asmita.test/api/partners", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("platform partner sign-up", () => {
  beforeEach(() => vi.stubEnv("DATABASE_URL", ""));
  afterEach(() => {
    vi.unstubAllEnvs();
    partnerApplications.splice(0, partnerApplications.length);
  });

  it("stores a valid request with the domain normalised and interests de-duplicated", async () => {
    const response = await POST(req(valid));
    expect(response.status).toBe(200);
    const [saved] = await listPartnerApplications();
    expect(saved).toMatchObject({
      websiteDomain: "example-tube.example",
      platformType: "VIDEO",
      status: "NEW",
      interests: ["FINGERPRINT_ALERTS", "TAKEDOWN_CHANNEL"],
    });
  });

  it("refuses a request without the CSRF token", async () => {
    const response = await POST(req(valid, { csrf: false }));
    expect(response.status).toBe(403);
    expect(partnerApplications).toHaveLength(0);
  });

  it("answers 400 to a malformed or incomplete body, naming the field", async () => {
    expect((await POST(req("{not json"))).status).toBe(400);
    const noInterests = await POST(req({ ...valid, interests: [] }));
    expect(noInterests.status).toBe(400);
    expect(await noInterests.json()).toMatchObject({ field: "interests" });
    const notAuthorised = await POST(req({ ...valid, authorised: false }));
    expect(await notAuthorised.json()).toMatchObject({ field: "authorised" });
    const badDomain = await POST(req({ ...valid, website: "not a domain" }));
    expect(await badDomain.json()).toMatchObject({ field: "website" });
    expect(partnerApplications).toHaveLength(0);
  });

  it("rejects unknown fields", async () => {
    const response = await POST(req({ ...valid, imageData: "data:image/png;base64,AAAA" }));
    expect(response.status).toBe(400);
    expect(partnerApplications).toHaveLength(0);
  });

  it("refuses links in the message, which could be addresses of intimate content", async () => {
    const response = await POST(req({ ...valid, message: "See https://example.invalid/post/demo" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "links_not_allowed" });
    expect(partnerApplications).toHaveLength(0);
  });

  it("caps the body size", async () => {
    const response = await POST(req({ ...valid, message: "a".repeat(9000) }));
    expect(response.status).toBe(413);
  });

  it("pretends to accept a bot that fills the hidden field, and stores nothing", async () => {
    const response = await POST(req({ ...valid, fax: "123" }));
    expect(response.status).toBe(200);
    expect(partnerApplications).toHaveLength(0);
  });

  it("limits repeat requests for one domain", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      statuses.push((await POST(req({ ...valid, website: "repeat-limit.example" }))).status);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
  });
});

describe("normaliseDomain", () => {
  it("reduces addresses to a bare domain and rejects junk", () => {
    expect(normaliseDomain("HTTPS://WWW.Example.in/path?q=1")).toBe("example.in");
    expect(normaliseDomain("sub.example.co.in:8443")).toBe("sub.example.co.in");
    expect(normaliseDomain("localhost")).toBeNull();
    expect(normaliseDomain("not a domain")).toBeNull();
  });
});
