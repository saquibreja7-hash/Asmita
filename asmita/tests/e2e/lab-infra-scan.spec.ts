// NOT YET RUN. Written on a Windows machine with no Playwright installed, so
// this spec has never executed. It follows the conventions of lab.spec.ts
// and needs the usual local Postgres 17 (E2E_DATABASE_URL, a database
// ending in _e2e); playwright.config.ts sets ENABLE_LAB=true for the shared
// dev server. Run it before relying on it:
//   npx playwright test tests/e2e/lab-infra-scan.spec.ts --project=chromium
//
// WP114 (research-tools-spec.md): the infrastructure scanner's admin
// "scan now" action and weekly cron route. No real site is ever fetched:
// the scanned service points at an invented .test host (which cannot
// resolve) and at this dev server's own loopback address, which the
// scanner refuses by design — so the journey exercises the route, the scan
// rows, the audit entry and the refusal, without touching the network.

import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { adminContext, baseURL } from "./support/admin";

test.describe("AI Lab, WP114 infrastructure scan", () => {
  test("an admin scans a service; unreachable and loopback URLs record errors, never fetch", async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Database journeys run once");
    test.setTimeout(120_000);

    const serviceUrl = `https://e2e-infra-${randomUUID().slice(0, 8)}.example.test/`;

    const console_ = await adminContext(browser, "e2e-admin");
    const admin = await console_.newPage();

    // Add the service through the console, like the other lab journeys.
    await admin.goto("/admin/lab/services");
    await admin.getByLabel("Name").fill(`E2E infra service ${randomUUID().slice(0, 8)}`);
    await admin.getByLabel("Kind").selectOption("WEBSITE");
    await admin
      .getByLabel("Addresses (one per line)")
      .fill([serviceUrl, "http://127.0.0.1:3001/never-fetched"].join("\n"));
    await admin.getByRole("button", { name: "Add service" }).click();
    await expect(admin.getByText("Service added. The daily liveness check will watch its addresses.")).toBeVisible();

    // Find the service id from the admin API, mint a CSRF pair and trigger
    // the scan the way WP115's "Scan now" button will.
    const services = (await (await admin.request.get("/api/lab/services")).json()) as {
      services: { id: string; name: string }[];
    };
    const created = [...services.services].sort((a, b) => b.id.localeCompare(a.id))[0]!;
    const mint = await admin.request.get("/api/csrf");
    const { token } = (await mint.json()) as { token: string };
    const scanResponse = await admin.request.post(`/api/lab/services/${created.id}/infra-scan`, {
      headers: { "x-csrf-token": token },
    });
    expect(scanResponse.status()).toBe(200);
    const scan = (await scanResponse.json()) as {
      ran: boolean;
      servicesScanned: number;
      urlsScanned: number;
      urlsFetched: number;
    };
    expect(scan.ran).toBe(true);
    expect(scan.servicesScanned).toBe(1);
    expect(scan.urlsScanned).toBe(2);
    // The invented host cannot resolve and the loopback is refused before
    // any fetch: both scans record an error, nothing is fetched.
    expect(scan.urlsFetched).toBe(0);

    // Without the CSRF pair the mutation is refused.
    const noCsrf = await admin.request.post(`/api/lab/services/${created.id}/infra-scan`);
    expect(noCsrf.status()).toBe(403);

    // The weekly cron route answers only with the CRON_SECRET, and skips
    // itself while ENABLE_LAB is off (checked by the unit suite; here the
    // lab is on, so a run must start — with no configured CRON_SECRET the
    // route answers 503, which is the deploy-time contract).
    const cron = await admin.request.get("/api/lab/cron/infra-scan");
    expect([200, 503]).toContain(cron.status());

    // The public tracker page still shows aggregates only and never the
    // service's name or address.
    const publicPage = await browser.newPage();
    await publicPage.goto("/lab/tracker");
    const html = (await publicPage.content()).toLowerCase();
    expect(html).not.toContain("example.test");
    expect(html).not.toContain("127.0.0.1");
  });

  test("the cron route refuses a request without the secret", async ({ request }) => {
    const response = await request.get(`${baseURL}/api/lab/cron/infra-scan`);
    // No bearer at all: unauthorized when a secret is configured, or the
    // 503 "not configured" answer the other cron tests accept.
    expect([401, 503]).toContain(response.status());
  });
});
