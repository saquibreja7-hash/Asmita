// Seed + drive the Asmita dev server for the HMA end-to-end test
// (integrations/hma/e2e). Runs on the host against the compose stack's
// published port. Everything goes through the app's real HTTP routes —
// the same journey asmita/tests/e2e/partner-signals.spec.ts drives in a
// browser, minus the browser:
//
//   node seed.mjs apply                    submit the platform partner application
//   node seed.mjs finish <applicationId>   admin approves it, issues the partner
//                                          key, two survivors each register, file a
//                                          case and submit a synthetic fingerprint,
//                                          an analyst approves each fingerprint, each
//                                          survivor ticks the partner-sharing
//                                          agreement -> two consented fingerprints.
//                                          Writes e2e-state.json (gitignored).
//   node seed.mjs withdraw                  the second survivor withdraws her
//                                          agreement (the deletion the test asserts).
//
// Synthetic everything: invented emails on example.invalid, a made-up
// platform domain, deterministic fake PDQ hashes. No real person, image,
// site or key ever appears.

import { createHash, createHmac, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { argv, env, exit } from "node:process";

const BASE = env.ASMITA_BASE_URL ?? "http://127.0.0.1:3000";
const JWT_SECRET = env.JWT_SECRET ?? "hma-e2e-test-only-jwt-secret-32ch";
const ADMIN_EMAIL = env.ADMIN_EMAIL ?? "hma-e2e-admin@example.invalid";
const STATE_PATH = new URL("./e2e-state.json", import.meta.url).pathname;

const loadState = () => {
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf8"));
  } catch {
    return {};
  }
};
const saveState = (state) => writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));

// A tiny cookie jar: names only, values opaque, one domain, throwaway data.
function makeSession() {
  const jar = new Map();
  const cookieHeader = () => [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
  const absorb = (response) => {
    for (const raw of response.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  };
  return {
    jar,
    cookieHeader,
    absorb,
    async fetch(path, options = {}) {
      const response = await fetch(`${BASE}${path}`, {
        ...options,
        headers: { cookie: cookieHeader(), ...(options.headers ?? {}) },
      });
      absorb(response);
      return response;
    },
  };
}

async function call(session, path, { method = "GET", body } = {}) {
  const csrfResponse = await session.fetch("/api/csrf");
  const { token } = await csrfResponse.json();
  const response = await session.fetch(path, {
    method,
    headers: { "x-csrf-token": token, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(data)}`);
  }
  return data;
}

// A signed admin session, as the app's own sign-in would issue it (the same
// shape asmita/tests/e2e/support/admin.ts mints for the Playwright suite:
// the enrolment gate is satisfied by run-e2e.sh's SQL against the
// throwaway database, exactly like global-setup.ts does there).
function adminToken() {
  const b64url = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url({ alg: "HS256", typ: "JWT" });
  const payload = b64url({
    role: "ADMIN",
    adminRole: "SUPER_ADMIN",
    ageOver18: true,
    emailHash: createHash("sha256").update(ADMIN_EMAIL).digest("hex"),
    namespace: "admin",
    mfaComplete: true,
    sub: "hma-e2e-admin",
    iss: "asmita",
    aud: "asmita-web",
    iat: now,
    exp: now + 8 * 3600,
  });
  const signature = createHmac("sha256", JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function adminSession() {
  const session = makeSession();
  session.jar.set("asmita_admin_session", adminToken());
  return session;
}

// Deterministic synthetic 64-hex PDQ-like hashes; no real image exists.
const fakeHash = (seed) => createHash("sha256").update(`asmita-hma-e2e:${seed}`).digest("hex");

async function register(session, label) {
  const email = `${label}-${randomUUID()}@example.invalid`;
  const requested = await call(session, "/api/auth/request-otp", { method: "POST", body: { email } });
  if (!requested.devOtp) throw new Error("no devOtp in the OTP response (is RESEND_API_KEY set?)");
  await call(session, "/api/auth/verify-otp", {
    method: "POST",
    body: { email, otp: requested.devOtp, ageOver18: true, purpose: "file" },
  });
  return email;
}

async function caseWithFingerprint(label) {
  const session = makeSession();
  await register(session, label);
  const created = await call(session, "/api/cases/create", {
    method: "POST",
    body: { urls: [`https://wa.me/asmita-hma-e2e-${randomUUID()}`], declaration: true },
  });
  const hash = fakeHash(label);
  const uploaded = await call(session, `/api/cases/${created.caseId}/hashes`, {
    method: "POST",
    body: { hashes: [{ hash, quality: 80 }], declaration: true },
  });
  const submission = uploaded.results.find((result) => result.ok)?.submission;
  if (!submission) throw new Error(`fingerprint upload failed for ${label}`);
  return { session, caseId: created.caseId, fingerprintId: submission.id, hash };
}

async function consentToShare(session, caseId) {
  const state = await call(session, `/api/cases/${caseId}/partner-share`);
  if (state.status === "agreed") return;
  const draft = state.draft;
  if (!draft) throw new Error(`no partner-share draft for case ${caseId}: ${JSON.stringify(state)}`);
  await call(session, `/api/cases/${caseId}/partner-share`, {
    method: "POST",
    body: { agreed: true, templateRef: draft.templateRef },
  });
}

async function main() {
  const command = argv[2];
  const state = loadState();

  if (command === "apply") {
    const session = makeSession();
    const website = `https://platform-${randomUUID().slice(0, 8)}.example.test`;
    await call(session, "/api/partners", {
      method: "POST",
      body: {
        organisationName: "Asmita HMA E2E Platform",
        platformName: "Asmita HMA E2E Platform",
        website,
        platformType: "SOCIAL",
        userBase: "UNKNOWN",
        contactName: "E2E Contact",
        contactRole: "Engineer",
        contactEmail: `contact-${randomUUID()}@example.invalid`,
        interests: ["FINGERPRINT_ALERTS"],
        authorised: true,
      },
    });
    saveState({ ...state, partnerWebsite: website });
    console.log(`partner application submitted (${website})`);
    return;
  }

  if (command === "finish") {
    const applicationId = argv[3];
    if (!applicationId) throw new Error("usage: seed.mjs finish <applicationId>");
    const admin = adminSession();
    const approved = await call(admin, `/api/admin/partners/applications/${applicationId}`, {
      method: "POST",
      body: { action: "approve" },
    });
    const issued = await call(admin, `/api/admin/partners/${approved.partnerId}/keys`, {
      method: "POST",
      body: { label: "hma-e2e", scopes: ["feed", "outcomes"] },
    });

    const keep = await caseWithFingerprint("keep");
    const withdraw = await caseWithFingerprint("withdraw");
    for (const journey of [keep, withdraw]) {
      await call(admin, `/api/admin/hashes/${journey.fingerprintId}/approve`, { method: "POST", body: {} });
    }
    await consentToShare(keep.session, keep.caseId);
    await consentToShare(withdraw.session, withdraw.caseId);

    saveState({
      ...state,
      partnerId: approved.partnerId,
      partnerKey: issued.key,
      keep: {
        caseId: keep.caseId,
        fingerprintId: keep.fingerprintId,
        hash: keep.hash,
        sessionCookie: keep.session.cookieHeader(),
      },
      withdraw: {
        caseId: withdraw.caseId,
        fingerprintId: withdraw.fingerprintId,
        hash: withdraw.hash,
        sessionCookie: withdraw.session.cookieHeader(),
      },
    });
    console.log(`seeded: partner ${approved.partnerId}, fingerprint keep ${keep.hash.slice(0, 8)}…, withdraw ${withdraw.hash.slice(0, 8)}…`);
    console.log(`signals feed now holds both consented fingerprints; e2e-state.json written`);
    return;
  }

  if (command === "withdraw") {
    const { withdraw } = state;
    if (!withdraw) throw new Error("run `seed.mjs finish` first");
    const session = makeSession();
    for (const pair of withdraw.sessionCookie.split(";")) {
      const [name, ...rest] = pair.trim().split("=");
      if (name) session.jar.set(name, rest.join("="));
    }
    await call(session, `/api/cases/${withdraw.caseId}/partner-share`, { method: "DELETE" });
    console.log(`consent withdrawn on case ${withdraw.caseId}`);
    return;
  }

  console.error("usage: seed.mjs apply | finish <applicationId> | withdraw");
  exit(64);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  exit(1);
});
