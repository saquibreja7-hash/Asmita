// WP111 (research-tools spec, item 3): the "Connect with HMA" quick start
// on the admin partner page. A partner is onboarded through the real
// application flow, an admin issues a key through the real console route —
// and the quick start must render with its three copyable steps while the
// page never contains the key that was just issued (the block names the
// once-shown key as a placeholder, exactly because a real key can never be
// shown again). Synthetic data only; the domain is an invented example.test.

import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { adminContext } from "./support/admin";
import { withAdmin } from "./support/database";

async function post(request: APIRequestContext, path: string, data: unknown, method: "post" | "delete" = "post") {
  const { token } = (await (await request.get("/api/csrf")).json()) as { token: string };
  return request[method](path, { data, headers: { "x-csrf-token": token } });
}

async function onboardedPartnerId(request: APIRequestContext, browser: Browser) {
  const domain = `hma-${randomUUID().slice(0, 8)}.example.test`;
  const application = await post(request, "/api/partners", {
    organisationName: "Example HMA Platform",
    platformName: "Example HMA Platform",
    website: `https://${domain}`,
    platformType: "HOSTING",
    userBase: "UNDER_100K",
    contactName: "Example Contact",
    contactRole: "Trust & Safety",
    contactEmail: `contact@${domain}`,
    interests: ["FINGERPRINT_ALERTS"],
    authorised: true,
  });
  expect(application.ok()).toBe(true);
  const [applicationId] = await withAdmin(async (db) =>
    (await db.query('SELECT id FROM "PlatformPartnerApplication" WHERE "websiteDomain" = $1', [domain])).rows.map((r) => r.id as string),
  );
  expect(applicationId).toBeDefined();
  const admin = (await adminContext(browser, "integrity-admin")).request;
  const approved = await post(admin, `/api/admin/partners/applications/${applicationId}`, { action: "approve" });
  expect(approved.ok()).toBe(true);
  const { partnerId } = (await approved.json()) as { partnerId: string };
  const issued = await post(admin, `/api/admin/partners/${partnerId}/keys`, { label: "e2e hma quick start key", scopes: ["feed", "outcomes"] });
  expect(issued.ok()).toBe(true);
  return { partnerId, key: ((await issued.json()) as { key: string }).key };
}

test.describe("partner HMA quick start (WP111)", () => {
  test("the Connect-with-HMA block shows the three steps and never the issued key", async ({ browser, request }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Database journeys run once");
    test.setTimeout(120_000);

    const { partnerId, key } = await onboardedPartnerId(request, browser);

    const page: Page = await (await adminContext(browser, "integrity-admin")).newPage();
    await page.goto(`/admin/partners/${partnerId}`);

    // The block is there and collapsed by default.
    const block = page.locator("details", { hasText: "Connect with HMA (Hasher-Matcher-Actioner)" });
    await expect(block).toBeVisible();
    await expect(block).not.toHaveAttribute("open", "");
    await expect(page.getByText("Meta's open-source Hasher-Matcher-Actioner")).toBeHidden();

    // Expand it: the three steps with their copyable code blocks.
    await page.getByText("Connect with HMA (Hasher-Matcher-Actioner)").click();
    await expect(page.getByText("Meta's open-source Hasher-Matcher-Actioner")).toBeVisible();
    await expect(page.getByText("1. Add the Asmita exchange to your HMA image")).toBeVisible();
    await expect(page.getByText("2. List the exchange in your OMM config")).toBeVisible();
    await expect(page.getByText("3. Create the exchange with this partner's key")).toBeVisible();
    await expect(page.locator("pre", { hasText: "FROM ghcr.io/meta/threatexchange/hma:1.2.2" })).toBeVisible();
    await expect(page.locator("pre", { hasText: "AsmitaSignalExchangeAPI" })).toBeVisible();
    await expect(page.locator("pre", { hasText: '"bank": "ASMITA_NCII"' })).toBeVisible();
    await expect(page.getByText("<the key you were shown>")).toBeVisible();

    // The copy buttons are real buttons, one per step.
    await expect(page.getByRole("button", { name: /^Copy the code for step/ })).toHaveCount(3);

    // A key was issued for this partner moments ago, through the real
    // route; it was shown once there and it can never appear here: not in
    // the quick start, not anywhere on the page.
    expect(key).toMatch(/^ppk_[0-9a-f]{48}$/);
    const html = await page.content();
    expect(html).not.toContain(key);
    expect(html).not.toMatch(/ppk_[0-9a-f]{10}/);
  });
});
