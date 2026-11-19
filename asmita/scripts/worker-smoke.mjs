// Runs the production Worker bundle in the real Workers runtime (wrangler dev
// --local, workerd) against a local Postgres, and sends two signed Resend
// webhooks through it. The E2E suite runs the Node dev server, which hides
// Worker-only failures such as Prisma compiling WebAssembly at runtime or a
// connection reused across requests; this catches them.
//
//   npm run build:vinext && node scripts/prepare-production-wrangler.mjs
//   E2E_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/asmita_e2e node scripts/worker-smoke.mjs
//
// SMOKE_CRAWLER=1 adds the crawler routes on the Worker (Kysely) path: it
// switches ENABLE_CRAWLER on for this local Worker only, issues a throwaway
// service key into the e2e database, reads sources and the pool, and reports
// one finding for an unknown source (refused, nothing stored). Off by default
// until it has been run once in CI; it does not race a withdrawal.
import { spawn } from "node:child_process";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { VOICE_AGENT_PATH } from "../src/lib/helpline.ts";
import { CSP_REPORT_PATH } from "../src/lib/csp.ts";

const databaseUrl = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5433/asmita_e2e";
const target = new URL(databaseUrl);
if (!["localhost", "127.0.0.1"].includes(target.hostname) || !target.pathname.endsWith("_e2e") || target.search) {
  throw new Error(`E2E_DATABASE_URL must be a local *_e2e database (got ${target.hostname}${target.pathname})`);
}

const port = 8788;
const secretBytes = randomBytes(24);
const webhookSecret = `whsec_${secretBytes.toString("base64")}`;
const vars = {
  RESEND_WEBHOOK_SECRET: webhookSecret,
  CRON_SECRET: randomBytes(16).toString("hex"),
  JWT_SECRET: randomBytes(32).toString("hex"),
  CSRF_SECRET: randomBytes(16).toString("hex"),
  ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  // Set on purpose: the production build must keep the provenance check off.
  ENABLE_PROVENANCE_CHECK: "true",
  // Empty on purpose: the build copies .env.local into .dev.vars, and a
  // developer's real Sarvam keys there would make the "no key" checks call Sarvam.
  SARVAM_API_KEY: "",
  SARVAM_CHAT_KEY: "",
};
const smokeCrawler = process.env.SMOKE_CRAWLER === "1";
if (smokeCrawler) vars.ENABLE_CRAWLER = "true";

// Refuse to start if something already answers on the port: the checks
// would otherwise run against that process, not this build.
try {
  await fetch(`http://127.0.0.1:${port}/api/health`);
  throw new Error(`Port ${port} is already in use; stop the other process first`);
} catch (err) {
  if (err instanceof Error && err.message.startsWith("Port ")) throw err;
}

const worker = spawn(
  "npx",
  ["wrangler", "dev", "--config", "dist/server/wrangler.production.json", "--port", String(port), "--local",
    ...Object.entries(vars).flatMap(([k, v]) => ["--var", `${k}:${v}`])],
  {
    env: { ...process.env, CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: databaseUrl },
    shell: process.platform === "win32",
    // Own process group on POSIX, so the whole wrangler/workerd tree can be stopped.
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  },
);

function stopWorker() {
  try {
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(worker.pid), "/T", "/F"]);
    else process.kill(-worker.pid, "SIGTERM");
  } catch {}
}
let output = "";
worker.stdout.on("data", (d) => (output += d));
worker.stderr.on("data", (d) => (output += d));

async function waitForWorker() {
  for (let i = 0; i < 90; i += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`Worker did not start:\n${output.slice(-2000)}`);
}

async function sendWebhook() {
  const body = JSON.stringify({
    type: "email.delivered",
    created_at: new Date().toISOString(),
    data: { email_id: randomUUID(), tags: {} },
  });
  const id = `msg_${randomUUID()}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", secretBytes).update(`${id}.${timestamp}.${body}`).digest("base64");
  const response = await fetch(`http://127.0.0.1:${port}/api/webhooks/resend`, {
    method: "POST",
    body,
    headers: { "content-type": "application/json", "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${signature}` },
  });
  return { status: response.status, messageId: JSON.parse(body).data.email_id };
}

/** Crawler routes in workerd with a real key lookup (SMOKE_CRAWLER=1 only). */
async function crawlerSmoke() {
  const key = `cwk_${randomBytes(24).toString("hex")}`;
  const keyId = randomUUID();
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`INSERT INTO "CrawlServiceKey" ("id", "name", "keyHash") VALUES ($1, $2, $3)`, [
      keyId, "worker-smoke", createHash("sha256").update(key).digest("hex"),
    ]);
    const headers = { authorization: `Bearer ${key}`, "content-type": "application/json" };
    const base = `http://127.0.0.1:${port}/api/crawler`;
    const noKey = await fetch(`${base}/sources`);
    if (noKey.status !== 401) throw new Error(`/api/crawler/sources without a key returned ${noKey.status}, expected 401`);
    const sources = await fetch(`${base}/sources`, { headers });
    if (sources.status !== 200 || !Array.isArray((await sources.json()).sources)) throw new Error(`/api/crawler/sources returned ${sources.status}:
${output.slice(-3000)}`);
    const pool = await fetch(`${base}/pool`, { headers });
    if (pool.status !== 200 || !Array.isArray((await pool.json()).fingerprints)) throw new Error(`/api/crawler/pool returned ${pool.status}:
${output.slice(-3000)}`);
    const findings = await fetch(`${base}/findings`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        runId: "worker-smoke",
        findings: [{
          fingerprintId: "fp_worker_smoke", pageUrl: "https://forum.example.com/t/1", imageUrl: "https://cdn.example.net/i/1.jpg",
          distance: 3, quality: 80, observedAt: new Date().toISOString(), sourceId: randomUUID(),
        }],
      }),
    });
    const body = findings.status === 200 ? await findings.json() : null;
    if (body?.results?.[0]?.reason !== "unknown_source") throw new Error(`/api/crawler/findings returned ${findings.status} ${JSON.stringify(body)}:
${output.slice(-3000)}`);
  } finally {
    await client.query(`DELETE FROM "CrawlServiceKey" WHERE "id" = $1`, [keyId]).catch(() => {});
    await client.end();
  }
}

let exitCode = 1;
try {
  await waitForWorker();
  // Two requests: the second proves no connection is reused across requests.
  const sent = [await sendWebhook(), await sendWebhook()];
  const failed = sent.filter((s) => s.status !== 200);
  if (failed.length) throw new Error(`Webhook returned ${failed.map((f) => f.status)}:\n${output.slice(-3000)}`);

  const db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();
  const stored = await db.query(`SELECT count(*)::int AS n FROM "EmailDeliveryProof" WHERE "messageId" = ANY($1)`, [
    sent.map((s) => s.messageId),
  ]);
  await db.end();
  if (stored.rows[0].n !== 2) throw new Error(`Expected 2 stored delivery proofs, found ${stored.rows[0].n}`);

  // ADR 002 is not accepted, so the route that sends images to OpenAI stays
  // closed in production even with the flag set.
  const provenance = await fetch(`http://127.0.0.1:${port}/api/check-image`, { method: "POST" });
  if (provenance.status !== 404) throw new Error(`/api/check-image returned ${provenance.status}, expected 404`);
  // Links can be added before the email code once the eligibility questions
  // are answered; without them, /submit still sends people to /start.
  const eligible = await fetch(`http://127.0.0.1:${port}/submit`, { headers: { cookie: "asmita_eligible=1" }, redirect: "manual" });
  if (eligible.status !== 200) throw new Error(`/submit after eligibility returned ${eligible.status}, expected 200`);
  const unanswered = await fetch(`http://127.0.0.1:${port}/submit`, { redirect: "manual" });
  if (!(unanswered.status >= 300 && unanswered.status < 400 && unanswered.headers.get("location")?.endsWith("/start"))) {
    throw new Error(`/submit without eligibility returned ${unanswered.status} ${unanswered.headers.get("location")}, expected a redirect to /start`);
  }
  // Voice calls: /talk alone may use the microphone and reach Sarvam, and the
  // session route needs a CSRF token, counts against the Postgres rate limit
  // and, with no SARVAM_API_KEY secret, answers 503 without calling Sarvam.
  const home = await fetch(`http://127.0.0.1:${port}/`);
  const talk = await fetch(`http://127.0.0.1:${port}/talk`);
  if (home.headers.get("permissions-policy")?.includes("microphone=(self)") || home.headers.get("content-security-policy")?.includes("sarvam.ai")) {
    throw new Error("The home page allows the microphone or Sarvam; only /talk should");
  }
  if (!talk.headers.get("permissions-policy")?.includes("microphone=(self)") || !talk.headers.get("content-security-policy")?.includes("wss://apps.sarvam.ai")) {
    throw new Error(`/talk is missing its voice headers: ${talk.headers.get("permissions-policy")} | ${talk.headers.get("content-security-policy")}`);
  }
  // WP46: CSP violation reporting, the report-only Trusted Types policy, the
  // extended Permissions-Policy and the cross-origin opener/resource headers.
  const health = await fetch(`http://127.0.0.1:${port}/api/health`);
  const checkedHeaders = [
    ["/", home.headers],
    ["/talk", talk.headers],
    ["/api/health", health.headers],
  ];
  for (const [label, headers] of checkedHeaders) {
    if (headers.get("cross-origin-opener-policy") !== "same-origin" || headers.get("cross-origin-resource-policy") !== "same-origin") {
      throw new Error(`${label} is missing the same-origin opener/resource policy headers`);
    }
    const csp = headers.get("content-security-policy") ?? "";
    if (!csp.includes("'report-sample'") || !csp.includes(`report-uri ${CSP_REPORT_PATH}`) || !csp.includes("report-to csp-endpoint")) {
      throw new Error(`${label} has no CSP reporting directives: ${csp}`);
    }
    if (csp.includes("'strict-dynamic'") || csp.includes("require-trusted-types-for")) {
      throw new Error(`${label} enforces something it must not: ${csp}`);
    }
  }
  const homePermissions = home.headers.get("permissions-policy") ?? "";
  const talkPermissions = talk.headers.get("permissions-policy") ?? "";
  for (const denied of ["payment=()", "usb=()", "serial=()", "bluetooth=()", "accelerometer=()", "gyroscope=()", "magnetometer=()", "display-capture=()", "browsing-topics=()"]) {
    if (!homePermissions.includes(denied) || !talkPermissions.includes(denied)) {
      throw new Error(`A permissions-policy is missing ${denied}: ${homePermissions} | ${talkPermissions}`);
    }
  }
  if (!homePermissions.includes("microphone=()") || !talkPermissions.includes("microphone=(self)")) {
    throw new Error(`The microphone rules changed: ${homePermissions} | ${talkPermissions}`);
  }
  if (!home.headers.get("reporting-endpoints")?.includes(CSP_REPORT_PATH)) {
    throw new Error(`The Reporting-Endpoints header is missing: ${home.headers.get("reporting-endpoints")}`);
  }
  if (!home.headers.get("content-security-policy-report-only")?.includes("require-trusted-types-for 'script'")) {
    throw new Error(`The Trusted Types report-only header is missing: ${home.headers.get("content-security-policy-report-only")}`);
  }
  // The report endpoint itself: browsers POST without cookies or CSRF.
  const cspReport = await fetch(`http://127.0.0.1:${port}${CSP_REPORT_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/csp-report" },
    body: JSON.stringify({
      "csp-report": {
        "document-uri": "https://asmita.test/review-sign?x=1",
        "blocked-uri": "https://blocked.example/a.js?y=2",
        "effective-directive": "script-src-elem",
      },
    }),
  });
  if (cspReport.status !== 204) throw new Error(`A legacy CSP report returned ${cspReport.status}, expected 204`);
  const reportBatch = await fetch(`http://127.0.0.1:${port}${CSP_REPORT_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/reports+json" },
    body: JSON.stringify([
      { type: "deprecation-report", body: {} },
      { type: "csp-violation", url: "https://asmita.test/talk", body: { blockedURL: "https://blocked.example/b.js", effectiveDirective: "script-src-elem" } },
    ]),
  });
  if (reportBatch.status !== 204) throw new Error(`A reports+json CSP report returned ${reportBatch.status}, expected 204`);
  const notAReport = await fetch(`http://127.0.0.1:${port}${CSP_REPORT_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (notAReport.status !== 415) throw new Error(`A non-report POST returned ${notAReport.status}, expected 415`);
  // Pages carry a per-request script nonce, and vinext puts it on its scripts.
  const homeNonce = home.headers.get("content-security-policy")?.match(/'nonce-([^']+)'/)?.[1];
  const homeHtml = await home.text();
  if (!homeNonce || !homeHtml.includes(`nonce="${homeNonce}"`)) {
    throw new Error(`The home page has no script nonce: ${home.headers.get("content-security-policy")}`);
  }
  const sessionUrl = `http://127.0.0.1:${port}/api/voice/${VOICE_AGENT_PATH}?interaction_type=call&version=7`;
  const noCsrf = await fetch(sessionUrl);
  if (noCsrf.status !== 403) throw new Error(`Voice session without CSRF returned ${noCsrf.status}, expected 403`);
  const csrf = await fetch(`http://127.0.0.1:${port}/api/csrf`);
  const cookie = csrf.headers.get("set-cookie")?.split(";")[0] ?? "";
  const { token } = await csrf.json();
  const session = await fetch(sessionUrl, { headers: { cookie, "x-csrf-token": token } });
  if (session.status !== 503) throw new Error(`Voice session without a key returned ${session.status}, expected 503:\n${output.slice(-3000)}`);
  // Home page chat: with no SARVAM_CHAT_KEY secret the route answers 503
  // after its CSRF and rate-limit checks, without calling Sarvam.
  const chat = await fetch(`http://127.0.0.1:${port}/api/chat`, {
    method: "POST",
    headers: { cookie, "x-csrf-token": token, "content-type": "application/json" },
    body: JSON.stringify({ locale: "en", messages: [{ role: "user", content: "hello" }] }),
  });
  if (chat.status !== 503) throw new Error(`Chat without a key returned ${chat.status}, expected 503:
${output.slice(-3000)}`);
  const buckets = new pg.Client({ connectionString: databaseUrl });
  await buckets.connect();
  const globalKey = createHash("sha256").update("voice-session-global").digest("hex");
  const counted = await buckets.query(`SELECT count(*)::int AS n FROM "RateLimitBucket" WHERE "key" = $1`, [globalKey]);
  await buckets.end();
  if (counted.rows[0].n !== 1) throw new Error("The voice daily cap was not counted in Postgres");

  if (smokeCrawler) await crawlerSmoke();

  console.log("Worker smoke passed: Prisma runs in workerd, each request gets its own connection, the provenance check is off, and voice headers, session limits, the chat route, the CSP reporting endpoint and the WP46 security headers work.");
  exitCode = 0;
} catch (err) {
  console.error(err);
} finally {
  stopWorker();
  setTimeout(() => process.exit(exitCode), 1000);
}
