// Runs the production Worker bundle in the real Workers runtime (wrangler dev
// --local, workerd) against a local Postgres, and sends two signed Resend
// webhooks through it. The E2E suite runs the Node dev server, which hides
// Worker-only failures such as Prisma compiling WebAssembly at runtime or a
// connection reused across requests; this catches them.
//
//   npm run build:vinext && node scripts/prepare-production-wrangler.mjs
//   E2E_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/asmita_e2e node scripts/worker-smoke.mjs
import { spawn } from "node:child_process";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";

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
  console.log("Worker smoke passed: Prisma runs in workerd and each request gets its own connection.");
  exitCode = 0;
} catch (err) {
  console.error(err);
} finally {
  stopWorker();
  setTimeout(() => process.exit(exitCode), 1000);
}
