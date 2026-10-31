// Issues a one-time admin enrolment code (ADR 004, M11), for the first admin
// when no SUPER_ADMIN can sign in yet. After that, use POST
// /api/admin/mfa/reset from a signed-in SUPER_ADMIN instead.
//
//   DATABASE_URL=<owner connection> node scripts/issue-admin-enrolment-code.mjs admin@example.org
//
// Optional PGSSLROOTCERT=<path to Supabase CA> verifies TLS fully. The email
// must also be in the Worker's ADMIN_EMAILS allowlist. The code is printed once
// and expires in 24 hours; hand it over out of band.
import { createHash, randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error("Usage: node scripts/issue-admin-enrolment-code.mjs <admin email>");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
let code = "";
for (let i = 0; i < 12; i += 1) code += String(randomInt(10));
const expiresAt = new Date(Date.now() + 24 * 60 * 60_000);

const url = new URL(process.env.DATABASE_URL);
const ssl = process.env.PGSSLROOTCERT
  ? { ca: readFileSync(process.env.PGSSLROOTCERT, "utf8"), servername: url.hostname }
  : undefined;
if (ssl) url.searchParams.delete("sslmode");

const client = new pg.Client({ connectionString: url.toString(), ssl });
await client.connect();
try {
  await client.query(
    `INSERT INTO "AdminEnrolmentCode" ("emailHash", "codeHash", "expiresAt", "createdBy")
     VALUES ($1, $2, $3, 'bootstrap-script')
     ON CONFLICT ("emailHash") DO UPDATE
       SET "codeHash" = EXCLUDED."codeHash", "expiresAt" = EXCLUDED."expiresAt",
           "createdBy" = EXCLUDED."createdBy", "createdAt" = now()`,
    [sha256(email), sha256(code), expiresAt],
  );
} finally {
  await client.end();
}

console.log(`Enrolment code for ${email}: ${code}`);
console.log(`Expires ${expiresAt.toISOString()}. Sign in at /admin/login with the email code and this code.`);
