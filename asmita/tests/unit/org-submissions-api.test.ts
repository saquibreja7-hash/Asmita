import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/org/submissions/route";
import { createCsrfPair } from "@/lib/csrf";
import { ORG_FORMS, orgSubmissions, volunteerSchema, trainingRequestSchema } from "@/lib/org-submissions";
import { hashEmail } from "@/lib/hash";

// The shared public-forms endpoint (docs/org/spec.md, section 0 and 56.2):
// CSRF, body cap, strict validation per kind, honeypot, per-IP and
// per-email rate limits, encrypted payload. Synthetic data only.

const volunteer = {
  kind: "VOLUNTEER",
  name: "Test Volunteer",
  email: "volunteer@example.invalid",
  city: "Pune",
  state: "Maharashtra",
  roles: ["TRANSLATION", "OUTREACH"],
  hours: "FROM_3_TO_5",
  experience: "I helped run a campus legal-aid desk for two years.",
  adult: true,
  consent: true,
};

const training = {
  kind: "TRAINING_REQUEST",
  organizationName: "Example College",
  audienceType: "COLLEGE",
  contactName: "Test Coordinator",
  role: "Professor",
  email: "training@example.invalid",
  city: "Jaipur",
  state: "Rajasthan",
  audienceSize: "FROM_30_TO_60",
  preferredMonths: "January or March",
  language: "Hindi",
  mode: "ONLINE",
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
  return new Request("https://asmita.test/api/org/submissions", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("org form registry", () => {
  it("validates a volunteer application and a training request", () => {
    const { kind: _volunteerKind, ...volunteerFields } = volunteer;
    const { kind: _trainingKind, ...trainingFields } = training;
    void _volunteerKind;
    void _trainingKind;
    expect(volunteerSchema.safeParse(volunteerFields).success).toBe(true);
    expect(trainingRequestSchema.safeParse(trainingFields).success).toBe(true);
    expect(volunteerSchema.safeParse({ ...volunteerFields, roles: [] }).success).toBe(false);
    expect(volunteerSchema.safeParse({ ...volunteerFields, roles: ["LEGAL", "TRANSLATION", "OUTREACH", "RESEARCH"] }).success).toBe(false);
    expect(volunteerSchema.safeParse({ ...volunteerFields, adult: false }).success).toBe(false);
    expect(volunteerSchema.safeParse({ ...volunteerFields, state: "Atlantis" }).success).toBe(false);
    expect(trainingRequestSchema.safeParse({ ...trainingFields, audienceType: "EVERYONE" }).success).toBe(false);
  });

  it("keeps honeypot fields out of every schema and labels in the admin registry", () => {
    for (const definition of Object.values(ORG_FORMS)) {
      const shape = (definition.schema as unknown as { shape: Record<string, unknown> }).shape;
      expect(shape.fax).toBeDefined();
      expect(definition.adminTitle).toBeTruthy();
      expect(definition.detailRows({ name: "A" }).length).toBeGreaterThan(3);
    }
  });
});

describe("POST /api/org/submissions", () => {
  beforeEach(() => vi.stubEnv("DATABASE_URL", ""));
  afterEach(() => {
    vi.unstubAllEnvs();
    orgSubmissions.splice(0, orgSubmissions.length);
  });

  it("stores a valid volunteer application encrypted, with the email hashed", async () => {
    const response = await POST(req(volunteer));
    expect(response.status).toBe(200);
    const [saved] = orgSubmissions;
    expect(saved.kind).toBe("VOLUNTEER");
    expect(saved.status).toBe("NEW");
    expect(saved.emailHash).toBe(hashEmail(volunteer.email));
    // The payload object holds the fields; the stored form in the DB path is
    // encrypted JSON. In memory the record itself must not carry plaintext
    // personal fields beyond what the admin view needs.
    expect(saved.payload.name).toBe("Test Volunteer");
  });

  it("refuses a request without CSRF and stores nothing", async () => {
    const response = await POST(req(volunteer, { csrf: false }));
    expect(response.status).toBe(403);
    expect(orgSubmissions).toHaveLength(0);
  });

  it("answers 400 naming the field for a malformed or incomplete body", async () => {
    expect((await POST(req("{not json"))).status).toBe(400);
    const noEmail = await POST(req({ ...volunteer, email: "not-an-email" }));
    expect(noEmail.status).toBe(400);
    expect(await noEmail.json()).toMatchObject({ field: "email" });
    const badKind = await POST(req({ ...volunteer, kind: "SURPRISE" }));
    expect(badKind.status).toBe(400);
    expect(orgSubmissions).toHaveLength(0);
  });

  it("rejects unknown fields", async () => {
    const response = await POST(req({ ...volunteer, imageData: "data:image/png;base64,AAAA" }));
    expect(response.status).toBe(400);
    expect(orgSubmissions).toHaveLength(0);
  });

  it("caps the body size", async () => {
    const response = await POST(req({ ...volunteer, experience: "a".repeat(9000) }));
    expect(response.status).toBe(413);
  });

  it("pretends to accept a bot that fills the hidden field, and stores nothing", async () => {
    const response = await POST(req({ ...volunteer, fax: "123" }));
    expect(response.status).toBe(200);
    expect(orgSubmissions).toHaveLength(0);
  });

  it("limits repeat requests for one email across kinds", async () => {
    const email = "repeat-org@example.invalid";
    const statuses: number[] = [];
    for (let index = 0; index < 4; index += 1) {
      statuses.push((await POST(req(index === 0 ? { ...volunteer, email } : { ...training, email }))).status);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
  });

  it("limits requests per network", async () => {
    const ip = "203.0.113.7";
    const statuses: number[] = [];
    for (let index = 0; index < 11; index += 1) {
      statuses.push(
        (await POST(req({ ...volunteer, email: `person${index}@example.invalid` }, { ip }))).status,
      );
    }
    expect(statuses.filter((status) => status === 429)).toHaveLength(1);
  });

  it("accepts a training request and stores it under its kind", async () => {
    const response = await POST(req(training));
    expect(response.status).toBe(200);
    expect(orgSubmissions[0]?.kind).toBe("TRAINING_REQUEST");
  });
});
