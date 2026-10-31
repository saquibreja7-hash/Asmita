import { createHash, randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { generateTotp } from "@/lib/auth/admin-mfa";
import { adminContext } from "./support/admin";
import { withAdmin } from "./support/database";

// ADR 004 Phase 2: M11 (one-time enrolment codes), M12 + M13 (shared,
// database-backed rate limits and the OTP budget).

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

async function post(request: APIRequestContext, path: string, data: unknown) {
  const { token } = (await (await request.get("/api/csrf")).json()) as { token: string };
  return request.post(path, { data, headers: { "x-csrf-token": token } });
}

async function adminEmailCode(request: APIRequestContext, email: string) {
  const sent = await post(request, "/api/admin/auth/request-otp", { email });
  expect(sent.ok(), await sent.text()).toBe(true);
  return ((await sent.json()) as { devOtp: string }).devOtp;
}

test("a new admin enrols once with a one-time code, and sign-in guessing is cut off", async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "One browser is enough");
  test.setTimeout(120_000);
  const email = "e2e-new-admin@example.invalid";

  // A SUPER_ADMIN invites the admin and passes the code on out of band.
  const superAdmin = await adminContext(browser);
  const invited = await post(superAdmin.request, "/api/admin/mfa/reset", { email });
  expect(invited.ok(), await invited.text()).toBe(true);
  const { enrolmentCode } = (await invited.json()) as { enrolmentCode: string };
  expect(enrolmentCode).toMatch(/^\d{12}$/);
  await superAdmin.close();

  // The admin signs in with the email code plus the enrolment code.
  await page.goto("/admin/login");
  await page.getByLabel("Admin email").fill(email);
  const otpResponse = page.waitForResponse("**/api/admin/auth/request-otp");
  await page.getByRole("button", { name: "Send admin code" }).click();
  const { devOtp } = (await (await otpResponse).json()) as { devOtp: string };
  await page.getByLabel("Email code").fill(devOtp);
  await page.getByLabel("Authenticator code").fill(enrolmentCode);
  await page.getByRole("button", { name: "Open admin workspace" }).click();
  await expect(page).toHaveURL(/\/admin\/setup-mfa$/, { timeout: 30_000 });

  // The code is spent: the same code with a fresh email code is refused.
  const reused = await post(page.request, "/api/admin/auth/verify", {
    email, otp: await adminEmailCode(page.request, email), totp: enrolmentCode,
  });
  expect(reused.status()).toBe(401);

  // Enrol an authenticator and finish setup with a real code from it.
  const enrolResponse = page.waitForResponse("**/api/admin/mfa/enroll");
  await expect(page.getByRole("button", { name: "Generate my authenticator secret" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Generate my authenticator secret" }).click();
  const { secret } = (await (await enrolResponse).json()) as { secret: string };
  await page.getByLabel("6-digit authenticator code").fill(generateTotp(secret));
  await page.getByRole("button", { name: "Verify and finish setup" }).click();
  await expect(page.getByRole("heading", { name: "Cases" })).toBeVisible({ timeout: 30_000 });

  // Guessing at sign-in stops after 5 attempts in 15 minutes, across every
  // Worker isolate. Two attempts were used above.
  for (let attempt = 3; attempt <= 5; attempt += 1) {
    const guess = await post(page.request, "/api/admin/auth/verify", { email, otp: "000000", totp: "000000" });
    expect(guess.status(), `attempt ${attempt}`).toBe(401);
  }
  const blocked = await post(page.request, "/api/admin/auth/verify", { email, otp: "000000", totp: "000000" });
  expect(blocked.status()).toBe(429);
});

test("sign-in codes are limited per address and site-wide, counted in Postgres", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "API journey, one browser is enough");
  const email = `limits-${randomUUID()}@example.invalid`;

  for (let sent = 1; sent <= 10; sent += 1) {
    const response = await post(request, "/api/auth/request-otp", { email });
    expect(response.ok(), `request ${sent}: ${await response.text()}`).toBe(true);
  }
  const limited = await post(request, "/api/auth/request-otp", { email });
  expect(limited.status()).toBe(429);
  expect(await limited.json()).toEqual({ error: "rate_limited" });

  // The counters are shared rows, keyed by a hash: no address is stored.
  const buckets = await withAdmin(async (db) =>
    Object.fromEntries(
      (
        await db.query(`SELECT key, count FROM "RateLimitBucket" WHERE key = ANY($1)`, [
          [sha256(`otp:${sha256(email)}`), sha256("otp-global")],
        ])
      ).rows.map((r) => [r.key as string, r.count as number]),
    ),
  );
  expect(buckets[sha256(`otp:${sha256(email)}`)]).toBe(11);
  expect(buckets[sha256("otp-global")]).toBeGreaterThanOrEqual(10);
  const leaked = await withAdmin(
    async (db) => (await db.query(`SELECT count(*)::int AS n FROM "RateLimitBucket" WHERE key LIKE '%@%'`)).rows[0].n,
  );
  expect(leaked).toBe(0);
});
