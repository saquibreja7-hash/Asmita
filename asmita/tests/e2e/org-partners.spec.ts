import { expect, test, type APIRequestContext } from "@playwright/test";
import { adminContext } from "./support/admin";

/*
 * Organization pages, WP57 (docs/org/spec.md): the /partners hub and all four
 * partner type pages in both languages, an NGO inquiry through the shared
 * forms pipeline, and an admin marking a partner public so it appears on
 * /partners. The full run happens in a separate verify step with a fresh
 * database; everything here uses synthetic data only.
 */

async function send(request: APIRequestContext, method: "post" | "put", path: string, data: unknown) {
  const { token } = (await (await request.get("/api/csrf")).json()) as { token: string };
  const headers = { "x-csrf-token": token };
  if (method === "post") return request.post(path, { data, headers });
  return request.put(path, { data, headers });
}

const TYPE_PAGES = [
  { slug: "ngos", en: "Partner: NGOs and helplines", hi: "साझेदारी: NGO और हेल्पलाइनें" },
  { slug: "legal", en: "Partner: legal help", hi: "साझेदारी: क़ानूनी सहायता" },
  { slug: "law-enforcement", en: "Partner: police and cyber cells", hi: "साझेदारी: पुलिस और साइबर सेल" },
  { slug: "academic", en: "Partner: universities and researchers", hi: "साझेदारी: विश्वविद्यालय और शोधकर्ता" },
];

test("/partners renders in English and Hindi", async ({ page }) => {
  await page.goto("/partners");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Partner with Meri Asmita");
  await expect(page.getByRole("link", { name: "NGOs and helplines" }).first()).toBeVisible();
  await expect(page.getByText("We're building our first partnerships. Be one of them.")).toBeVisible();

  await page.context().addCookies([{ name: "asmita_lang", value: "hi", url: "http://127.0.0.1:3001" }]);
  await page.goto("/partners");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("मेरी अस्मिता के साथ साझेदारी कीजिए");
});

test("each partner type page renders in English and Hindi", async ({ page }) => {
  for (const typePage of TYPE_PAGES) {
    await page.goto(`/partners/${typePage.slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(typePage.en);
    await expect(page.getByRole("heading", { name: "What we offer" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send inquiry" })).toBeVisible();
  }

  await page.context().addCookies([{ name: "asmita_lang", value: "hi", url: "http://127.0.0.1:3001" }]);
  for (const typePage of TYPE_PAGES) {
    await page.goto(`/partners/${typePage.slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(typePage.hi);
  }
});

test("an NGO inquiry submits and shows the success state", async ({ page }) => {
  await page.goto("/partners/ngos");
  await page.getByLabel("Organization name", { exact: true }).fill("Sahyog Trust (e2e)");
  await page.getByLabel("Type", { exact: true }).selectOption({ label: "Helpline" });
  await page.getByLabel("City", { exact: true }).fill("Pune");
  await page.getByLabel("State or union territory", { exact: true }).selectOption("Maharashtra");
  await page.getByText("Pan-India", { exact: true }).click();
  await page.getByText("Running a helpline").click();
  await page.getByLabel("Contact person", { exact: true }).fill("Test Contact");
  await page.getByLabel("Their role", { exact: true }).fill("Coordinator");
  await page.getByLabel("Email", { exact: true }).fill("ngo-e2e@example.invalid");
  await page.getByLabel("What do you have in mind?", { exact: true }).fill("We run a helpline and want to build a referral path.");
  await page.getByRole("button", { name: "Send inquiry" }).click();
  await expect(page.getByText("Thank you. We have your inquiry.")).toBeVisible({ timeout: 20_000 });
});

test("an admin marks a partner public and it appears on /partners", async ({ browser, page }) => {
  const request = await (await adminContext(browser)).request;
  const created = await send(request, "post", "/api/admin/org/partners", {
    name: "Sahyog Trust (e2e)",
    type: "NGO",
    blurbEn: "A helpline for survivors in Maharashtra.",
  });
  expect(created.ok()).toBe(true);
  const { partner } = (await created.json()) as { partner: { id: string } };
  const shown = await send(request, "put", `/api/admin/org/partners/${partner.id}`, { isPublic: true });
  expect(shown.ok()).toBe(true);

  await page.goto("/partners");
  await expect(page.getByRole("heading", { name: "Sahyog Trust (e2e)" })).toBeVisible();
  await expect(page.getByText("A helpline for survivors in Maharashtra.")).toBeVisible();
});
