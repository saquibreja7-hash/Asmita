import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { appRole, withAdmin } from "./support/database";

async function deniedAs(role: string, statement: string) {
  return withAdmin(async (db) => {
    await db.query("BEGIN");
    try {
      await db.query(`SET LOCAL ROLE ${role}`);
      await db.query(statement);
      return false;
    } catch {
      return true;
    } finally {
      await db.query("ROLLBACK");
    }
  });
}

// ADR 004, M1 + M2: the app runs as a least-privilege role, and nothing a
// survivor submits is reachable through Supabase's Data API roles.
test("survivor report works as the app role and stays out of reach of the Data API", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "One database journey is enough");
  test.setTimeout(120_000);

  await page.goto("/register");
  await page.getByText("I am 18 years of age or older.").click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Email address").fill(`hardening-${randomUUID()}@example.invalid`);
  const otpResponse = page.waitForResponse("**/api/auth/request-otp");
  await page.getByRole("button", { name: "Send verification code" }).click();
  const { devOtp } = (await (await otpResponse).json()) as { devOtp: string };
  await page.getByLabel("6-digit code").fill(devOtp);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/submit$/, { timeout: 30_000 });

  await page.getByLabel("Links where the content appears").fill(`https://www.instagram.com/p/asmita-synthetic-${randomUUID()}/`);
  await page.getByLabel(/I declare/).check();
  await page.getByRole("button", { name: "Continue to review" }).click();
  await expect(page).toHaveURL(/\/review-sign$/);
  const createResponse = page.waitForResponse((response) => response.url().endsWith("/api/cases/create"));
  await page.getByRole("button", { name: "Create case and preview notice" }).click();
  const created = await createResponse;
  expect(created.ok()).toBe(true);
  const { caseId } = (await created.json()) as { caseId: string };

  // This survivor's case really landed in Postgres, written by the
  // least-privilege role. (Other journeys run in parallel, so look it up by id.)
  const stored = await withAdmin((db) => db.query('SELECT 1 FROM "Case" WHERE id = $1', [caseId]));
  expect(stored.rowCount).toBe(1);

  // Every table, including any added later, has row-level security on.
  const tables = await withAdmin(async (db) =>
    (
      await db.query<{ name: string; rls: boolean }>(`
        SELECT c.relname AS name, c.relrowsecurity AS rls
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'`)
    ).rows,
  );
  const withoutRls = tables.filter((t) => !t.rls && t.name !== "_prisma_migrations").map((t) => t.name);
  expect(withoutRls, "tables without row-level security").toEqual([]);

  // Someone holding the Supabase publishable key gets nothing, from any table.
  for (const { name: table } of tables) {
    expect(await deniedAs("anon", `SELECT 1 FROM "${table}" LIMIT 1`), `anon reads ${table}`).toBe(true);
    expect(await deniedAs("authenticated", `SELECT 1 FROM "${table}" LIMIT 1`), `authenticated reads ${table}`).toBe(true);
  }
  expect(await deniedAs("anon", `UPDATE "Platform" SET "name" = "name"`), "anon edits grievance contacts").toBe(true);
  expect(await deniedAs("anon", `UPDATE "NoticeTemplate" SET "reviewedByLegal" = true`), "anon flips the legal gate").toBe(true);

  // Even the app itself cannot rewrite or erase the audit trail.
  expect(await deniedAs(appRole, `UPDATE "audit_log" SET "sequence" = "sequence"`), "app rewrites audit_log").toBe(true);
  expect(await deniedAs(appRole, `DELETE FROM "audit_log"`), "app deletes audit_log").toBe(true);
  expect(await deniedAs(appRole, `TRUNCATE "audit_log"`), "app truncates audit_log").toBe(true);
});
