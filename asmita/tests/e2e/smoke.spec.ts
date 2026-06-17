import { connect } from "node:net";
import { expect, test } from "@playwright/test";

// Registration persists users in Postgres; without a local DB those flows
// cannot complete. Probe once and skip DB-dependent tests instead of failing
// with a misleading timeout (same pattern as hash-flow.spec.ts).
function postgresReachable(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port: 5432, timeout: 1000 });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    const fail = () => {
      socket.destroy();
      resolve(false);
    };
    socket.once("error", fail);
    socket.once("timeout", fail);
  });
}

async function completeAdultRegistration(page: import("@playwright/test").Page, email: string) {
  await page.goto("/register");
  await page.getByText("I am 18 years of age or older.").click();
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
  await page.getByLabel("Links where the content appears").fill("https://www.instagram.com/p/abc");
  await expect(page.getByText(/Detected: Instagram/)).toBeVisible();
  await page.getByLabel(/I declare/).check();
  await page.getByRole("button", { name: "Continue to review" }).click();
  await expect(page).toHaveURL(/\/review-sign$/, { timeout: 15_000 });
  const urlResponse = page.waitForResponse((response) => response.url().includes("/api/cases/") && response.url().endsWith("/urls"));
  await page.getByRole("button", { name: "Create case and preview notice" }).click();
  expect((await urlResponse).ok()).toBe(true);

  // Flow branches: if notice preview succeeds, a sign step appears;
  // otherwise the app redirects straight to the case dashboard.
  const signForm = page.getByLabel("Full name");
  const casePage = page.waitForURL(/\/case\/[^/]+$/, { timeout: 30_000 }).catch(() => {});
  if (await signForm.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await signForm.fill("Test User");
    await page.getByLabel("Contact (email or phone)").fill("test@example.com");
    await page.getByPlaceholder("Type your full name").fill("Test User");
    await page.getByRole("button", { name: "Sign and submit" }).click();
  }
  await casePage;
  await expect(page).toHaveURL(/\/case\/[^/]+/, { timeout: 15_000 });
  await expect(page.getByText(/ASMITA-/)).toBeVisible();
}

test("landing and support bar render", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /You don.t have to face this/i }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /CHILDLINE 1098/ }).first()).toBeVisible();
});

test("FAQ page renders English and Hindi launch content", async ({ page }) => {
  await page.goto("/faq");
  await expect(page.getByRole("heading", { name: "Frequently asked questions" })).toBeVisible();
  await expect(page.getByText("Does Asmita download or view submitted content?")).toBeVisible();
  await expect(page.getByText("Are notices legally reviewed?")).toBeVisible();
});

test("minor pathway has no URL submission form", async ({ page }) => {
  await page.goto("/minor-support");
  await expect(page.getByRole("link", { name: /CHILDLINE 1098/ }).first()).toBeVisible();
  await expect(page.locator("textarea")).toHaveCount(0);
});

test("minor registration branches before collecting email", async ({ page }) => {
  await page.goto("/register");
  await page.getByText("I am under 18 years of age.").click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/minor-support$/);
  await expect(page.locator("input[type='email']")).toHaveCount(0);
});

test("full adult flow creates a case and reaches confirmation", async ({ page }, testInfo) => {
  test.skip(!(await postgresReachable()), "requires local Postgres (registration persists users)");
  test.setTimeout(120_000);
  await completeAdultRegistration(
    page,
    `adult-${Date.now()}-${testInfo.project.name}@adult-${testInfo.workerIndex}-${Date.now()}.example.com`,
  );
  await createCase(page);
});

test("adult dashboard supports add URL, manual resolve, PDF export, and deletion request", async ({ page }, testInfo) => {
  test.skip(!(await postgresReachable()), "requires local Postgres (registration persists users)");
  test.setTimeout(120_000);
  await completeAdultRegistration(
    page,
    `dashboard-${Date.now()}-${testInfo.project.name}@dashboard-${testInfo.workerIndex}-${Date.now()}.example.com`,
  );
  await createCase(page);

  // createCase lands on the case dashboard directly
  await expect(page.getByText(/ASMITA-/).first()).toBeVisible();

  await page.getByLabel("Paste one URL per line").fill("https://www.youtube.com/watch?v=abc123");
  const addUrlResponse = page.waitForResponse((response) => response.url().includes("/api/cases/") && response.url().endsWith("/urls"));
  await page.getByRole("button", { name: "Add to case" }).click();
  expect((await addUrlResponse).ok()).toBe(true);
  await expect(page.getByText(/Link added/)).toBeVisible();

  const resolvedResponse = page.waitForResponse((response) => response.url().includes("/mark-resolved"));
  await page.getByRole("button", { name: "Mark first link resolved" }).click();
  expect((await resolvedResponse).ok()).toBe(true);
  await expect(page.getByText(/manually resolved/i)).toBeVisible();

  const exportHref = await page.getByRole("link", { name: "Download case PDF" }).getAttribute("href");
  expect(exportHref).toBeTruthy();
  const pdfResponse = await page.request.get(exportHref!);
  expect(pdfResponse.ok()).toBe(true);
  expect(pdfResponse.headers()["content-type"]).toContain("application/pdf");

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
});
