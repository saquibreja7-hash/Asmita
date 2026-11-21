// NOT YET RUN. Written on a Windows machine with no Playwright installed, so
// this spec has never executed. It follows the conventions of lab.spec.ts and
// lab-infra-scan.spec.ts and needs the usual local Postgres 17
// (E2E_DATABASE_URL, a database ending in _e2e); playwright.config.ts sets
// ENABLE_LAB=true for the shared dev server. Run it before relying on it:
//   npx playwright test tests/e2e/lab-registry.spec.ts --project=chromium
//
// WP115 (research-tools-spec.md): the registry console journey — the
// service table, one service's page with its empty infrastructure state and
// the scan-now action, the provider directory with its verified-contact
// rule, and one bulk report drafted for two services. No real site is ever
// fetched: the scanned service points at an invented .test host that cannot
// resolve, so the scan records failures only. The public tracker is checked
// for k-anonymity masking and for carrying no service name in its rendered
// HTML.

import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { adminContext } from "./support/admin";
import { isLabResearchCreditUrl } from "@/lib/lab/research-credits";

test.describe("AI Lab, WP115 service registry", () => {
  test("an admin walks the registry, the providers directory and a bulk draft", async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Database journeys run once");
    test.setTimeout(150_000);

    const suffix = randomUUID().slice(0, 8);
    const serviceHosts = [`https://e2e-registry-a-${suffix}.example.test/`, `https://e2e-registry-b-${suffix}.example.test/`];

    const console_ = await adminContext(browser, "e2e-admin");
    const admin = await console_.newPage();

    // Two services to list in the bulk report, added through the console.
    await admin.goto("/admin/lab/services");
    for (const [index, url] of serviceHosts.entries()) {
      await admin.getByLabel("Name").fill(`E2E registry service ${suffix} ${index}`);
      await admin.getByLabel("Kind").selectOption("WEBSITE");
      await admin.getByLabel("Addresses (one per line)").fill(url);
      await admin.getByRole("button", { name: "Add service" }).click();
      await expect(admin.getByText("Service added. The daily liveness check will watch its addresses.")).toBeVisible();
    }

    // The registry table lists them, with the research disclosure below.
    await admin.goto("/admin/lab/registry");
    await expect(admin.getByRole("heading", { name: "Service registry" })).toBeVisible();
    await expect(admin.getByText("E2E registry service " + suffix + " 0")).toBeVisible();
    await expect(admin.getByText("E2E registry service " + suffix + " 1")).toBeVisible();
    await admin.getByText("Research behind this").click();
    await expect(admin.getByText("Analyzing the AI Nudification Application Ecosystem")).toBeVisible();

    // The filters narrow the table by status.
    await admin.getByLabel("Status").selectOption("UNKNOWN");
    await admin.getByRole("button", { name: "Apply filters" }).click();
    await expect(admin.getByText("E2E registry service " + suffix + " 0")).toBeVisible();
    await admin.getByRole("link", { name: "Clear" }).click();
    await expect(admin.getByText("E2E registry service " + suffix + " 0")).toBeVisible();

    // One service's page: addresses, the honest no-findings state, the
    // scan-now action (the invented host cannot resolve, so the scan records
    // errors and fetches nothing), and the other sections.
    await admin.getByRole("link", { name: "E2E registry service " + suffix + " 0" }).click();
    await expect(admin.getByRole("heading", { name: "E2E registry service " + suffix + " 0" })).toBeVisible();
    await expect(admin.getByRole("heading", { name: "Addresses and liveness" })).toBeVisible();
    await expect(admin.getByRole("heading", { name: "Infrastructure" })).toBeVisible();
    await expect(admin.getByRole("heading", { name: "Related services" })).toBeVisible();
    await expect(admin.getByRole("heading", { name: "Chokepoints" })).toBeVisible();
    await expect(admin.getByRole("heading", { name: "Reports" })).toBeVisible();
    await admin.getByRole("button", { name: "Scan now" }).click();
    await expect(admin.getByText(/Scanned 1 address\(es\)/)).toBeVisible({ timeout: 60_000 });

    // The provider directory: create an invented provider, verify it (which
    // records who and when). The seeded directory rows are all unverified,
    // so every selector is scoped to this provider's own row.
    await admin.goto("/admin/lab/providers");
    await expect(admin.getByRole("heading", { name: "Provider directory" })).toBeVisible();
    await admin.getByLabel("Name").fill(`E2E Provider ${suffix}`);
    await admin.getByLabel("Kind").selectOption("HOST");
    await admin.getByLabel("Website").fill(`https://e2e-provider-${suffix}.example.test`);
    await admin.getByLabel("Abuse email (an analyst verifies it)").fill(`abuse@e2e-provider-${suffix}.example.test`);
    await admin.getByRole("button", { name: "Add provider" }).click();
    await expect(admin.getByText("Provider added. It stays unverified until an analyst confirms it.")).toBeVisible();
    const providerRow = admin.locator("tr", { hasText: `E2E Provider ${suffix}` }).filter({
      has: admin.getByRole("button", { name: "Mark verified" }),
    });
    await expect(providerRow.getByText("unverified")).toBeVisible();
    await providerRow.getByRole("button", { name: "Mark verified" }).click();
    await expect(providerRow.getByText(/verified \d{4}-\d{2}-\d{2}/)).toBeVisible();

    // Both services depend on it through a chokepoint, so one report can
    // list them both. The chokepoint is added through its own console page.
    const services = (await (await admin.request.get("/api/lab/services")).json()) as {
      services: { id: string; name: string }[];
    };
    const mine = services.services.filter((service) => service.name.includes(suffix));
    expect(mine.length).toBe(2);
    const mint = await admin.request.get("/api/csrf");
    const { token } = (await mint.json()) as { token: string };
    for (const service of mine) {
      const response = await admin.request.post("/api/lab/chokepoints", {
        headers: { "x-csrf-token": token },
        data: {
          serviceId: service.id,
          kind: "HOST",
          provider: `E2E Provider ${suffix}`,
          abuseContact: `abuse@e2e-provider-${suffix}.example.test`,
          evidenceNotes: "added by the e2e journey",
        },
      });
      expect(response.status()).toBe(201);
    }

    // The bulk draft: select both services, the verified contact is already
    // filled in, and one report lists them both.
    await admin.goto("/admin/lab/providers");
    await admin.getByText(`Draft one report to E2E Provider ${suffix} for several of these services`).click();
    for (const service of mine) {
      await admin.locator("label", { hasText: service.name }).locator("input").check();
    }
    await admin.getByRole("button", { name: /Draft report for 2 services/ }).click();
    await expect(
      admin.getByText("One report drafted, listing every selected service. Review and send it on the reports page."),
    ).toBeVisible();

    // The draft appears on the reports page as one row covering both.
    await admin.goto("/admin/lab/reports");
    await expect(admin.getByText("2 services").first()).toBeVisible();
    await expect(admin.getByText(`E2E Provider ${suffix}`).first()).toBeVisible();

    // Mutations without the CSRF pair are refused.
    const noCsrf = await admin.request.post("/api/lab/reports/bulk", {
      data: { providerId: "any", serviceIds: [mine[0]!.id, mine[1]!.id] },
    });
    expect(noCsrf.status()).toBe(403);
    const noCsrfPromote = await admin.request.post(`/api/lab/infra-findings/${mine[0]!.id}/promote`, { data: {} });
    expect(noCsrfPromote.status()).toBe(403);

    // A visitor without an admin session never sees the registry.
    const visitor = await browser.newPage();
    await visitor.goto("/admin/lab/registry");
    await expect(visitor.getByRole("heading", { name: "Service registry" })).toHaveCount(0);

    // The public tracker: k-anonymity masking and no service name in the
    // rendered HTML, whatever the console recorded.
    const publicPage = await browser.newPage();
    await publicPage.goto("/lab/tracker");
    const html = await publicPage.content();
    expect(html).not.toContain(`E2E registry service ${suffix}`);
    expect(html).not.toContain(`e2e-registry-a-${suffix}.example.test`);
    expect(html).not.toContain(`E2E Provider ${suffix}`);
    // The dependency section explains the k ≥ 5 rule, and the only external
    // links are the research citations.
    await expect(publicPage.getByRole("heading", { name: "What the services depend on" })).toBeVisible();
    const hrefs = await publicPage.locator("main a").evaluateAll((links) =>
      links.map((link) => (link as HTMLAnchorElement).getAttribute("href") ?? ""),
    );
    for (const href of hrefs) {
      expect(href.startsWith("/") || isLabResearchCreditUrl(href), `unexpected external link: ${href}`).toBe(true);
    }
  });
});
