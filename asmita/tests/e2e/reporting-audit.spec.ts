import { expect, test } from "@playwright/test";

async function reachSubmit(page: import("@playwright/test").Page) {
  await page.goto("/eligibility");
  await page.getByRole("button", { name: "18 or over" }).click();
  await page.getByRole("button", { name: "18 or over" }).click();
  await page.getByRole("button", { name: "Me", exact: true }).click();
  await page.getByRole("button", { name: "Me nude, semi-nude, or in a sexual act" }).click();
  await expect(page).toHaveURL(/\/submit$/);
}

test("form-only link reaches the handoff without an account or case", async ({ page }) => {
  const caseRequests: string[] = [];
  page.on("request", (r) => { if (r.url().includes("/api/cases/create")) caseRequests.push(r.url()); });
  await reachSubmit(page);
  await page.getByLabel("Links where the content appears").fill("https://instagram.com/p/synthetic-test");
  await page.getByLabel(/I declare/).check();
  await page.getByRole("button", { name: "Continue to review" }).click();
  await expect(page.getByRole("heading", { name: "Open the platform’s reporting form" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Instagram/ })).toHaveAttribute("href", /^https:\/\//);
  await expect(page.getByRole("link", { name: /Open StopNCII/ })).toHaveAttribute("href", "https://stopncii.org/");
  await expect(page.getByRole("textbox", { name: /notice/i })).toHaveCount(0);
  expect(caseRequests).toEqual([]);
  expect(await page.evaluate(() => sessionStorage.getItem("asmita_submit_draft"))).toBeNull();
});

test("mixed reports offer form handoff before sign in and retain other links", async ({ page }) => {
  await reachSubmit(page);
  await page.getByLabel("Links where the content appears").fill("https://instagram.com/p/synthetic-test\nhttps://example.invalid/synthetic-test");
  await page.getByLabel(/I declare/).check();
  await page.getByRole("button", { name: "Continue to review" }).click();
  await page.getByRole("button", { name: "Continue with remaining reports" }).click();
  await expect(page).toHaveURL(/\/register$/);
  const draft = await page.evaluate(() => JSON.parse(sessionStorage.getItem("asmita_submit_draft")!));
  expect(draft.urls).toEqual(["https://example.invalid/synthetic-test"]);
});
