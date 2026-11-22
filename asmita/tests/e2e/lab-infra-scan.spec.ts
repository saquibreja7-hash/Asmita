// WP114 (research-tools-spec.md): the infrastructure scanner's admin
// "scan now" action and weekly cron route. No real site is ever fetched:
// the scanned service points at an invented .test host (which cannot
// resolve) and at this dev server's own loopback address, which the
// scanner refuses by design — so the journey exercises the route, the scan
// rows, the audit entry and the refusal, without touching the network.
// Runs like every database journey: the usual local Postgres 17
// (E2E_DATABASE_URL, a database ending in _e2e); playwright.config.ts sets
// ENABLE_LAB=true and a CRON_SECRET for the shared dev server.

import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { adminContext, baseURL } from "./support/admin";
import { withAdmin } from "./support/database";

// One unique name per run: the journey finds its service by it, and the
// afterEach cleanup below deletes exactly the rows created here.
const serviceName = `E2E infra service ${randomUUID().slice(0, 8)}`;

test.describe("AI Lab, WP114 infrastructure scan", () => {
  // The Lab specs share one database, and lab-tracker.spec.ts — which sorts
  // after this file — asserts the honest empty state of a fresh database:
  // no Lab row may outlive this file. The console has no delete API by
  // design, so the journey's rows are removed here directly, the same way
  // global-setup resets the database between runs.
  test.afterEach(async () => {
    await withAdmin(async (db) => {
      const services = `SELECT id FROM "LabService" WHERE name = $1`;
      await db.query(`DELETE FROM "LabInfraFinding" WHERE "serviceId" IN (${services})`, [serviceName]);
      await db.query(`DELETE FROM "LabInfraScan" WHERE "serviceId" IN (${services})`, [serviceName]);
      await db.query(
        `DELETE FROM "LabServiceLink" WHERE "serviceAId" IN (${services}) OR "serviceBId" IN (${services})`,
        [serviceName],
      );
      await db.query(`DELETE FROM "LabService" WHERE name = $1`, [serviceName]);
    });
  });

  test("an admin scans a service; unreachable and loopback URLs record errors, never fetch", async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Database journeys run once");
    test.setTimeout(120_000);

    const serviceUrl = `https://e2e-infra-${randomUUID().slice(0, 8)}.example.test/`;

    const console_ = await adminContext(browser, "e2e-admin");
    const admin = await console_.newPage();

    // Add the service through the console, like the other lab journeys.
    await admin.goto("/admin/lab/services");
    await admin.getByLabel("Name").fill(serviceName);
    await admin.getByLabel("Kind").selectOption("WEBSITE");
    await admin
      .getByLabel("Addresses (one per line)")
      .fill([serviceUrl, "http://127.0.0.1:3001/never-fetched"].join("\n"));
    await admin.getByRole("button", { name: "Add service" }).click();
    await expect(admin.getByText("Service added. The daily liveness check will watch its addresses.")).toBeVisible();

    // Find the service by its unique name, mint a CSRF pair and trigger
    // the scan the way the registry page's "Scan now" button does.
    const services = (await (await admin.request.get("/api/lab/services")).json()) as {
      services: { id: string; name: string }[];
    };
    const created = services.services.find((service) => service.name === serviceName);
    if (!created) throw new Error("the service this journey added is missing from /api/lab/services");
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

    // The weekly cron route answers only with the CRON_SECRET bearer. The
    // e2e harness configures one (playwright.config.ts), like the other
    // cron journeys (health-check.spec.ts, url-retention.spec.ts): with the
    // bearer a run must start, and it still fetches nothing — the invented
    // host cannot resolve and the loopback is refused. The request without
    // the bearer is the second test below.
    const cron = await admin.request.get("/api/lab/cron/infra-scan", {
      headers: { authorization: "Bearer e2e-test-only-cron-secret-32-chars-long" },
    });
    expect(cron.status()).toBe(200);
    const cronRun = (await cron.json()) as { ran: boolean; servicesScanned: number; urlsFetched: number };
    expect(cronRun.ran).toBe(true);
    expect(cronRun.servicesScanned).toBe(1);
    expect(cronRun.urlsFetched).toBe(0);

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
