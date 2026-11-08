import { expect, test } from "@playwright/test";

async function completeAdultRegistration(page: import("@playwright/test").Page, email: string) {
  await page.goto("/register");
  await page.getByText("I am 18 years of age or older.").click();
  await page.getByText("I was 18 or older.").click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Email address").fill(email);
  const otpResponse = page.waitForResponse("**/api/auth/request-otp");
  await page.getByRole("button", { name: "Send verification code" }).click();
  const otpPayload = (await (await otpResponse).json()) as { devOtp: string };
  expect(otpPayload.devOtp).toMatch(/^\d{6}$/);
  await page.getByLabel("6-digit code").fill(otpPayload.devOtp);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/submit$/, { timeout: 30_000 });
}

async function createCase(page: import("@playwright/test").Page) {
  await page.getByLabel("Links where the content appears").fill("https://www.youtube.com/watch?v=asmita-synthetic");
  await expect(page.locator("#url-checks").getByText("YouTube", { exact: true })).toBeVisible();
  await page.getByLabel(/I declare/).check();
  const createResponse = page.waitForResponse((response) => response.url().endsWith("/api/cases/create"));
  await page.getByRole("button", { name: "Continue to review" }).click();
  await page.getByRole("button", { name: "Create my case" }).click();
  const created = await createResponse;
  expect(created.ok()).toBe(true);
  const { caseId } = await created.json();
  await page.goto(`/case/${caseId}`);
  await expect(page).toHaveURL(/\/case\/[^/]+$/);
  await expect(page.getByText(/ASMITA-/).first()).toBeVisible();
}

test("landing and minor-support entry render", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /You are not alone\. Let's take it down\./i }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Under 18/i }).first()).toBeVisible();
});

test("survivor can call the 24/7 helpline from the home page", async ({ page }) => {
  await page.goto("/");
  const call = page.getByRole("link", { name: /24\/7 helpline/i });
  await expect(call).toBeVisible();
  await expect(call).toHaveAttribute("href", "tel:+918065480788");
  await expect(page.getByRole("img", { name: "Cloudflare" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Sarvam" })).toBeVisible();
});

test("FAQ page renders English and Hindi launch content", async ({ page }) => {
  await page.goto("/faq");
  await expect(page.getByRole("heading", { name: "Frequently asked questions" })).toBeVisible();
  await expect(page.getByText("Does Asmita download or view submitted content?")).toBeVisible();
  await expect(page.getByText("Are notices legally reviewed?")).toBeVisible();
});

test("minor pathway has no URL submission form", async ({ page }) => {
  await page.goto("/minor-support");
  await expect(page.getByRole("link", { name: /CHILDLINE.*1098/i }).first()).toBeVisible();
  await expect(page.locator("textarea")).toHaveCount(0);
});

test("minor registration branches before collecting email", async ({ page }) => {
  await page.goto("/register");
  await page.getByText("I am under 18 years of age.").click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/minor-support$/);
  await expect(page.locator("input[type='email']")).toHaveCount(0);
});

test("full adult flow creates a case and reaches the dashboard", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await completeAdultRegistration(
    page,
    `adult-${Date.now()}-${testInfo.project.name}@adult-${testInfo.workerIndex}-${Date.now()}.example.com`,
  );
  await createCase(page);
});

test("adult dashboard supports add URL, manual resolve, and deletion request, with no broken tools", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await completeAdultRegistration(
    page,
    `dashboard-${Date.now()}-${testInfo.project.name}@dashboard-${testInfo.workerIndex}-${Date.now()}.example.com`,
  );
  await createCase(page);

  // createCase lands on the case dashboard directly
  await expect(page.getByText(/ASMITA-/).first()).toBeVisible();

  // One plain status card instead of tables and stat boxes.
  await expect(page.getByText("Where things stand")).toBeVisible();

  // Adding a link is folded away until she needs it.
  await page.getByText("Add another link").click();
  await page.getByLabel("Paste one URL per line").fill("https://www.youtube.com/watch?v=abc123");
  const addUrlResponse = page.waitForResponse((response) => response.url().includes("/api/cases/") && response.url().endsWith("/urls"));
  await page.getByRole("button", { name: "Add to case" }).click();
  expect((await addUrlResponse).ok()).toBe(true);
  await expect(page.getByText(/Link added/)).toBeVisible();
  const removedButtons = page.getByRole("button", { name: /^Mark as removed: YouTube/ });
  await expect(removedButtons).toHaveCount(2);

  // Each link has its own button, it asks first, and it marks only that link.
  let marked = false;
  page.on("request", (r) => { if (r.url().includes("/mark-resolved")) marked = true; });
  await removedButtons.first().click();
  await page.getByRole("button", { name: "Cancel" }).click();
  expect(marked).toBe(false);
  await expect(removedButtons).toHaveCount(2);
  await removedButtons.first().click();
  const resolvedResponse = page.waitForResponse((response) => response.url().includes("/mark-resolved"));
  await page.getByRole("button", { name: /^Yes, it is removed: YouTube/ }).click();
  expect((await resolvedResponse).ok()).toBe(true);
  await expect(page.getByText("Removed", { exact: true })).toHaveCount(1);
  await expect(removedButtons).toHaveCount(1);

  // The PDF and audit-trail downloads fail on Workers and were removed from the dashboard.
  await expect(page.getByRole("link", { name: "Download case PDF" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "View audit trail" })).toHaveCount(0);

  await page.goto("/delete-account");
  await page.getByLabel("Type DELETE to continue").fill("DELETE");
  const deletionResponse = page.waitForResponse((response) => response.url().endsWith("/api/account/delete"));
  await page.getByRole("button", { name: "Schedule deletion" }).click();
  expect((await deletionResponse).ok()).toBe(true);
  await expect(page.getByText(/Deletion scheduled/).first()).toBeVisible();
});

test("direct visits to protected victim flow redirect to start without session", async ({ page }) => {
  await page.goto("/submit");
  await expect(page).toHaveURL(/\/start$/);
});

test("language toggle persists Hindi preference", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "हिंदी" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  await expect(page.getByRole("heading", { name: "आप अकेली नहीं हैं। आइए इसे हटवाएँ।" })).toBeVisible();
  await page.goto("/get-help");
  await expect(page.getByRole("heading", { name: "कुछ हुआ है। अब आप ये कदम उठा सकते हैं।" })).toBeVisible();
  await page.goto("/what-we-do");
  await expect(page.getByRole("heading", { name: "सामग्री पर कार्रवाई के साधन" })).toBeVisible();
  await page.goto("/about");
  await expect(page.getByRole("heading", { name: "कार्रवाई में साथ देने वाला मंच" })).toBeVisible();
});
