import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { appRole, withAdmin } from "./support/database";

const surveyedTables = ["User", "Case", "SubmittedUrl", "Platform", "NoticeTemplate", "audit_log", "_prisma_migrations"];

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

  const casesBefore = await withAdmin(async (db) => (await db.query('SELECT count(*)::int AS n FROM "Case"')).rows[0].n);

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
  expect((await createResponse).ok()).toBe(true);

  // The case really landed in Postgres, written by the least-privilege role.
  const casesAfter = await withAdmin(async (db) => (await db.query('SELECT count(*)::int AS n FROM "Case"')).rows[0].n);
  expect(casesAfter).toBe(casesBefore + 1);

  // Someone holding the Supabase publishable key gets nothing.
  for (const table of surveyedTables) {
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
