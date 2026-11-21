// NOT YET RUN. Written on a Windows machine with no Postgres and no Docker,
// so this spec has never executed. It follows the conventions of
// crawler-journey.spec.ts and needs the usual local Postgres 17
// (E2E_DATABASE_URL, a database ending in _e2e); playwright.config.ts sets
// ENABLE_LAB=true for the shared dev server. Run it before relying on it:
//   npx playwright test tests/e2e/lab.spec.ts --project=chromium
//
// The Lab journey (docs/lab/charter.md): an admin maps a service and a
// chokepoint, drafts a report from the per-kind template and reviews it;
// the public /lab page shows the aggregate numbers and never the service's
// name or address. Placeholder data only — invented example.test hosts; the
// liveness check never runs here, so nothing is ever fetched.

import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { adminContext } from "./support/admin";

test.describe("AI Lab, E2", () => {
  test("an admin maps a service and chokepoint, drafts a report, and /lab shows aggregates only", async ({ browser, page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Database journeys run once");
    test.setTimeout(180_000);

    const serviceName = `E2E lab tool ${randomUUID().slice(0, 8)}`;
    const serviceUrl = `https://e2e-lab-${randomUUID().slice(0, 8)}.example.test`;

    // The console: add the service.
    const console_ = await adminContext(browser);
    const admin = await console_.newPage();
    await admin.goto("/admin/lab/services");
    await expect(admin.getByRole("heading", { name: "Services" })).toBeVisible();
    await admin.getByLabel("Name").fill(serviceName);
    await admin.getByLabel("Kind").selectOption("WEBSITE");
    await admin.getByLabel("Addresses (one per line)").fill(serviceUrl);
    await admin.getByRole("button", { name: "Add service" }).click();
    await expect(admin.getByText("Service added. The daily liveness check will watch its addresses.")).toBeVisible();
    await expect(admin.getByText(serviceName)).toBeVisible();

    // Add its hosting chokepoint, with the abuse contact an analyst copied.
    await admin.goto("/admin/lab/chokepoints");
    await admin.getByLabel("Service").selectOption({ label: serviceName });
    await admin.getByLabel("Kind").selectOption("HOST");
    await admin.getByLabel("Provider", { exact: true }).fill("Example Hosting E2E");
    await admin.getByLabel("Abuse contact (from the provider's own abuse page)").fill("abuse@example.test");
    await admin.getByLabel("Evidence notes").fill("Invented e2e evidence: front page offers an undress generator.");
    await admin.getByRole("button", { name: "Add chokepoint" }).click();
    await expect(admin.getByText("Chokepoint added. Draft a report for it from the Reports page.")).toBeVisible();

    // Draft the report from the per-kind template and review it.
    await admin.goto("/admin/lab/reports");
    await admin.getByLabel("Draft a report for").selectOption({ label: `${serviceName} · HOST · Example Hosting E2E` });
    await admin.getByRole("button", { name: "Draft report" }).click();
    await expect(admin.getByText("Drafted from the per-kind template. Review the text before sending.")).toBeVisible();
    await admin.getByRole("button", { name: "Review" }).first().click();
    const body = admin.getByLabel("Body");
    await expect(body).toHaveValue(new RegExp(serviceUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    await expect(body).toHaveValue(/We write from the Asmita AI Lab/);
    // Nothing is sent in this journey: the draft stays for the analyst.

    // The public page: linked from the footer, aggregates only.
    await page.goto("/lab");
    await expect(page.getByRole("heading", { name: "The experiments" })).toBeVisible();
    await expect(page.getByText("Services tracked")).toBeVisible();
    await expect(page.getByText("Aggregate numbers only. We never name or link a service on this page.")).toBeVisible();
    await expect(page.getByRole("link", { name: "AI Lab" })).toBeVisible();

    // The service's name and address never reach the public page.
    const html = await page.content();
    expect(html).not.toContain(serviceName);
    expect(html).not.toContain(serviceUrl);

    // And the console's own dashboard shows the tracked service.
    await admin.goto("/admin/lab");
    await expect(admin.getByText("The E2 metric: how many reported services went down within 30 days of the first report.")).toBeVisible();
  });
});
