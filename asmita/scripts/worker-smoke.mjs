// Runs the production Worker bundle in the real Workers runtime (wrangler dev
// --local, workerd) against a local Postgres, and sends two signed Resend
// webhooks through it. The E2E suite runs the Node dev server, which hides
// Worker-only failures such as Prisma compiling WebAssembly at runtime or a
// connection reused across requests; this catches them.
//
//   npm run build:vinext && node scripts/prepare-production-wrangler.mjs
//   E2E_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/asmita_e2e node scripts/worker-smoke.mjs
import { spawn } from "node:child_process";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { VOICE_AGENT_PATH } from "../src/lib/helpline.ts";

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
};

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
  // Voice calls: /talk alone may use the microphone and reach Sarvam, and the
  // session route needs a CSRF token, counts against the Postgres rate limit
  // and, with no SARVAM_API_KEY secret, answers 503 without calling Sarvam.
  const home = await fetch(`http://127.0.0.1:${port}/`);
  const talk = await fetch(`http://127.0.0.1:${port}/talk`);
  if (home.headers.get("permissions-policy")?.includes("microphone=(self)") || home.headers.get("content-security-policy")?.includes("sarvam.ai")) {
    throw new Error("The home page allows the microphone or Sarvam; only /talk should");
  }
  if (!talk.headers.get("permissions-policy")?.includes("microphone=(self)") || !talk.headers.get("content-security-policy")?.includes("wss://*.sarvam.ai")) {
    throw new Error(`/talk is missing its voice headers: ${talk.headers.get("permissions-policy")} | ${talk.headers.get("content-security-policy")}`);
  }
  const sessionUrl = `http://127.0.0.1:${port}/api/voice/${VOICE_AGENT_PATH}?interaction_type=call&version=4`;
  const noCsrf = await fetch(sessionUrl);
  if (noCsrf.status !== 403) throw new Error(`Voice session without CSRF returned ${noCsrf.status}, expected 403`);
  const csrf = await fetch(`http://127.0.0.1:${port}/api/csrf`);
  const cookie = csrf.headers.get("set-cookie")?.split(";")[0] ?? "";
  const { token } = await csrf.json();
  const session = await fetch(sessionUrl, { headers: { cookie, "x-csrf-token": token } });
  if (session.status !== 503) throw new Error(`Voice session without a key returned ${session.status}, expected 503:\n${output.slice(-3000)}`);
  const buckets = new pg.Client({ connectionString: databaseUrl });
  await buckets.connect();
  const globalKey = createHash("sha256").update("voice-session-global").digest("hex");
  const counted = await buckets.query(`SELECT count(*)::int AS n FROM "RateLimitBucket" WHERE "key" = $1`, [globalKey]);
  await buckets.end();
  if (counted.rows[0].n !== 1) throw new Error("The voice daily cap was not counted in Postgres");

  console.log("Worker smoke passed: Prisma runs in workerd, each request gets its own connection, the provenance check is off, and voice headers and session limits work.");
  exitCode = 0;
} catch (err) {
  console.error(err);
} finally {
  stopWorker();
  setTimeout(() => process.exit(exitCode), 1000);
}
