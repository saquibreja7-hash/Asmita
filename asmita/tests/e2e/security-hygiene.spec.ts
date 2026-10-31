import { expect, test } from "@playwright/test";
import { adminContext, signAdminToken } from "./support/admin";
import { withAdmin } from "./support/database";

// ADR 004, M10 + M14.

const csrfFailures = (route: string) =>
  withAdmin(async (db) =>
    (
      await db.query(`SELECT count(*)::int AS n FROM "SecurityEventLog" WHERE event = 'csrf_failed' AND route = $1`, [
        route,
      ])
    ).rows[0].n as number,
  );

test("a forged request is refused and recorded before the response returns", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "API journey, one browser is enough");
  const route = "/api/auth/request-otp";
  const before = await csrfFailures(route);

  // No CSRF token: the kind of request another site could forge.
  const forged = await request.post(route, { data: { email: "forged@example.invalid", ageOver18: true } });
  expect(forged.status()).toBe(403);

  // Read straight after the response: the event must already be stored.
  expect(await csrfFailures(route)).toBe(before + 1);
});

test("admin logout clears the session at every path it was ever set", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "One browser is enough");
  const context = await adminContext(browser);
  // A legacy session scoped to /admin, as older logins issued it.
  await context.addCookies([
    { name: "asmita_admin_session", value: await signAdminToken(), domain: "127.0.0.1", path: "/admin", httpOnly: true, sameSite: "Lax" },
  ]);
  const page = await context.newPage();
  await page.goto("/admin/cases");
  await expect(page.getByRole("heading", { name: "Cases" })).toBeVisible();

  const { token } = (await (await context.request.get("/api/csrf")).json()) as { token: string };
  const loggedOut = await context.request.post("/api/admin/auth/logout", { headers: { "x-csrf-token": token } });
  expect(loggedOut.ok()).toBe(true);

  expect((await context.cookies()).filter((c) => c.name === "asmita_admin_session")).toEqual([]);
  await page.goto("/admin/cases");
  await expect(page.getByText("Restricted workspace")).toBeVisible();
  await context.close();
});
