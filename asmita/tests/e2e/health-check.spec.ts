import { expect, test } from "@playwright/test";

// The keepalive workflow's view of the site: the health check reaches the
// real database, and only its own secret unlocks the detail. The cron
// secret, which can trigger notice sweeps, gets nothing extra here.
test("health check reports the database only to the health-check secret", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "API journey, one browser is enough");

  const anonymous = await request.get("/api/health");
  expect(anonymous.ok()).toBe(true);
  expect(await anonymous.json()).toEqual({ ok: true });

  const withCronSecret = await request.get("/api/health", {
    headers: { authorization: "Bearer e2e-test-only-cron-secret-32-chars-long" },
  });
  expect(await withCronSecret.json()).toEqual({ ok: true });

  const keepalive = await request.get("/api/health", {
    headers: { authorization: "Bearer e2e-test-only-health-secret-32-chars" },
  });
  expect(await keepalive.json()).toEqual({ ok: true, service: "asmita", db: "ok" });
});
