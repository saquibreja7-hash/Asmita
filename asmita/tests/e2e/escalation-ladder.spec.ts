import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { withAdmin } from "./support/database";

// docs/product/escalation-ladder.md: a form-only link starts its ladder when
// the survivor says she filed the platform form, and her own next steps open
// as the platform's time runs out.

async function register(page: Page) {
  await page.goto("/register");
  await page.getByText("I am 18 years of age or older.").click();
  await page.getByText("I was 18 or older.").click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Email address").fill(`ladder-${Date.now()}@example.org`);
  const otpResponse = page.waitForResponse("**/api/auth/request-otp");
  await page.getByRole("button", { name: "Send verification code" }).click();
  const { devOtp } = (await (await otpResponse).json()) as { devOtp: string };
  await page.getByLabel("6-digit code").fill(devOtp);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/submit$/, { timeout: 30_000 });
}

test("a form-only link gets a ladder once the survivor files the platform's form", async ({ page }) => {
  test.setTimeout(150_000);
  await register(page);
  const link = `https://www.instagram.com/p/asmita-synthetic-${randomUUID()}`;
  await page.getByLabel("Links where the content appears").fill(link);
  await page.getByLabel(/I declare/).check();
  await page.getByRole("button", { name: "Continue to review" }).click();

  // Instagram takes reports only through its own form. Keeping the link in a
  // case is her choice: without it there is nothing to continue with.
  await expect(page.getByRole("heading", { name: /Open the platform.s reporting form/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Asmita" })).toHaveCount(0);
  await page.getByText("Keep track of these links in my Asmita case").click();
  await page.getByRole("button", { name: "Continue with Asmita" }).click();
  const createResponse = page.waitForResponse((r) => r.url().endsWith("/api/cases/create"));
  await page.getByRole("button", { name: "Create my case" }).click();
  const { caseId } = (await (await createResponse).json()) as { caseId: string };

  // With no notice to sign, she lands on the form handoff for her case.
  await expect(page).toHaveURL(new RegExp(`/handoff/${caseId}$`), { timeout: 30_000 });
  await expect(page.getByText(/mark it as filed on your case page/)).toBeVisible();
  await page.goto(`/case/${caseId}`);
  // No ladder until she says she filed the form.
  await expect(page.getByText("What happens next")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Open Instagram.*form/ })).toHaveAttribute("href", /^https:\/\/help\.meta\.com\//);

  // Asks first, then starts the clock.
  await page.getByRole("button", { name: "I have filed the form" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "I have filed the form" }).click();
  const filed = page.waitForResponse((r) => r.url().endsWith("/platform-filed"));
  await page.getByRole("button", { name: "Yes, I filed it" }).click();
  expect((await filed).ok()).toBe(true);
  await expect(page.getByText("What happens next")).toBeVisible();
  await expect(page.getByText(/You filed Instagram.*form/)).toBeVisible();
  await expect(page.getByText(/deadline to remove it/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Open cybercrime.gov.in" })).toHaveCount(0);

  // A week on, with nothing removed, both of her own steps are open.
  await withAdmin((db) =>
    db.query(`UPDATE "SubmittedUrl" SET "platformFiledAt" = now() - interval '8 days' WHERE "caseId" = $1`, [caseId]),
  );
  await page.reload();
  await expect(page.getByRole("link", { name: "Open cybercrime.gov.in" })).toHaveAttribute("href", "https://cybercrime.gov.in/");
  await expect(page.getByRole("link", { name: "Open gac.gov.in" })).toHaveAttribute("href", "https://gac.gov.in/");
  // Prepared wording is legal text: hidden until a human legal review turns it on.
  await expect(page.getByText("Wording you can copy")).toHaveCount(0);
  // The link itself never appears in the ladder.
  await expect(page.locator("main")).not.toContainText(link);

  // Marking it removed ends the ladder.
  await page.getByRole("button", { name: /^Mark as removed: Instagram/ }).click();
  await page.getByRole("button", { name: /^Yes, it is removed: Instagram/ }).click();
  await expect(page.getByText("What happens next")).toHaveCount(0);
});

test("without opting in, a form-only link stays out of Asmita", async ({ page }) => {
  test.setTimeout(90_000);
  await register(page);
  await page.getByLabel("Links where the content appears").fill(`https://www.instagram.com/p/asmita-synthetic-${randomUUID()}`);
  await page.getByLabel(/I declare/).check();
  let created = false;
  page.on("request", (r) => { if (r.url().endsWith("/api/cases/create")) created = true; });
  await page.getByRole("button", { name: "Continue to review" }).click();
  await expect(page.getByRole("heading", { name: /Open the platform.s reporting form/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Continue/ })).toHaveCount(0);
  expect(created).toBe(false);
});
