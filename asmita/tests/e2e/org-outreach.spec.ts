import { expect, test, type APIRequestContext } from "@playwright/test";
import { adminContext } from "./support/admin";

/*
 * Organization pages, WP56 (docs/org/spec.md): the get-involved hub in both
 * languages, the volunteer form, an admin publishing a news post and opening
 * a job through the real admin APIs, and the newsletter 'check your email'
 * state. The full run happens in a separate verify step with a fresh
 * database; everything here uses synthetic data only.
 */

async function send(request: APIRequestContext, method: "post" | "put" | "patch", path: string, data: unknown) {
  const { token } = (await (await request.get("/api/csrf")).json()) as { token: string };
  if (method === "post") return request.post(path, { data, headers: { "x-csrf-token": token } });
  if (method === "put") return request.put(path, { data, headers: { "x-csrf-token": token } });
  return request.patch(path, { data, headers: { "x-csrf-token": token } });
}

test("get-involved renders in English and Hindi", async ({ page }) => {
  await page.goto("/get-involved");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Help us end image-based abuse");
  await expect(page.getByRole("link", { name: "Volunteer" }).first()).toBeVisible();
  await expect(page.getByText("TO_FILL")).toHaveCount(0);
  await expect(page.getByRole("img", { name: "LinkedIn" })).toBeVisible();

  await page.context().addCookies([{ name: "asmita_lang", value: "hi", url: "http://127.0.0.1:3001" }]);
  await page.goto("/get-involved");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "तस्वीरों के ज़रिए होने वाले दुर्व्यवहार को ख़त्म करने में हमारी मदद कीजिए",
  );
});

test("a visitor submits the volunteer form and sees the success state", async ({ page }) => {
  await page.goto("/volunteer");
  await page.getByLabel("Your name").fill("Eli Test");
  await page.getByLabel("Email", { exact: true }).fill("eli@example.invalid");
  await page.getByLabel("City").fill("Pune");
  await page.getByLabel("State or union territory").selectOption("Maharashtra");
  await page.getByText("Hindi", { exact: true }).click();
  await page.getByText("Translation and language review").click();
  await page.getByLabel("Time you can give").selectOption({ label: "3 to 5 hours a week" });
  await page
    .getByLabel("Tell us a little about yourself")
    .fill("I translate legal explainers for a campus legal-aid group.");
  await page.getByText("I am 18 or older.").click();
  await page.getByText("You may contact me about my application.").click();
  await page.getByRole("button", { name: "Send application" }).click();
  await expect(page.getByText("Thank you. We have your application.")).toBeVisible({ timeout: 20_000 });
});

test("an admin publishes a news post and it appears on /news and /news/[slug]", async ({ browser, page }) => {
  const request = await (await adminContext(browser)).request;
  const created = await send(request, "post", "/api/admin/org/posts", {
    kind: "NEWS",
    titleEn: "Playwright news post",
    summaryEn: "A post created by the end-to-end suite.",
    bodyEn: "## What changed\n\nThe post appears in the list and on its own page.",
    authorDisplayName: "Meri Asmita",
  });
  expect(created.ok()).toBe(true);
  const post = (await created.json()) as { post: { id: string; slug: string } };
  const published = await send(request, "patch", `/api/admin/org/posts/${post.post.id}`, { action: "publish" });
  expect(published.ok()).toBe(true);

  await page.goto("/news");
  await expect(page.getByRole("link", { name: "Playwright news post" })).toBeVisible();
  await page.getByRole("link", { name: "Playwright news post" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Playwright news post");
  await expect(page.getByRole("heading", { level: 2, name: "What changed" })).toBeVisible();
});

test("an admin opens a job and it appears on /careers", async ({ browser, page }) => {
  const request = await (await adminContext(browser)).request;
  const created = await send(request, "post", "/api/admin/org/jobs", {
    title: "Outreach coordinator (e2e)",
    team: "Outreach",
    location: "Remote, India",
    type: "FULL_TIME",
    descriptionMd: "You will run volunteer onboarding.",
    applyEmail: "work@example.invalid",
  });
  expect(created.ok()).toBe(true);
  const job = (await created.json()) as { job: { id: string; slug: string } };
  const opened = await send(request, "put", `/api/admin/org/jobs/${job.job.id}`, { status: "OPEN" });
  expect(opened.ok()).toBe(true);

  await page.goto("/careers");
  await expect(page.getByRole("link", { name: "Outreach coordinator (e2e)" })).toBeVisible();
  await page.getByRole("link", { name: "Outreach coordinator (e2e)" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Outreach coordinator (e2e)");
  const mailto = page.getByRole("link", { name: "Apply by email" });
  await expect(mailto).toBeVisible();
  await expect(mailto).toHaveAttribute(
    "href",
    /^mailto:work@example.invalid\?subject=Application%20for%20Outreach%20coordinator%20\(e2e\)/,
  );
});

test("a newsletter signup from the footer shows the check-your-email state", async ({ page }) => {
  await page.goto("/get-involved");
  const footer = page.getByRole("contentinfo");
  await footer.getByLabel("First name").fill("Asha");
  await footer.getByLabel("Email for the newsletter").fill("reader@example.invalid");
  await footer.getByRole("button", { name: "Sign up" }).click();
  await expect(footer.getByText("Check your email to confirm.")).toBeVisible({ timeout: 20_000 });
});
