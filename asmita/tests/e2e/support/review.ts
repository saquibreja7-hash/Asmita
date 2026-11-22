import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";

// Shared seeding for the review-console specs (review-console-spec.md
// WP141/WP142): one survivor case whose links are all flagged for human
// review, filed through the survivor's own flow so every row is honest.
// Every link is invented; nothing here touches real data.

export const FLAG_COUNT = 6; // > 5 unique domains is what flags the submission

/** One survivor case whose links are all flagged for human review. */
export async function seedFlaggedCase(page: Page): Promise<{ caseId: string; referenceNumber: string; links: string[] }> {
  await page.goto("/register");
  await page.getByText("I am 18 years of age or older.").click();
  await page.getByText("I was 18 or older.").click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Email address").fill(`review-${Date.now()}-${randomUUID().slice(0, 6)}@filing.example.com`);
  const otpResponse = page.waitForResponse("**/api/auth/request-otp");
  await page.getByRole("button", { name: "Send verification code" }).click();
  const { devOtp } = (await (await otpResponse).json()) as { devOtp: string };
  await page.getByLabel("6-digit code").fill(devOtp);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/submit$/, { timeout: 30_000 });

  // The first link is on a seeded platform (approvable); the rest are
  // invented hosts. Six unique domains trip the abuse check, so every link
  // waits in the flagged queue — the honest way a full queue arises.
  const links = [
    `https://youtube.com/watch?v=asmita-${randomUUID()}`,
    ...Array.from({ length: FLAG_COUNT - 1 }, (_, index) => `https://site-${index}.example.test/post/${randomUUID()}`),
  ];
  await page.getByLabel("Links where the content appears").fill(links.join("\n"));
  await expect(page.locator("#url-checks")).toBeVisible();
  await page.getByText(/I declare that I am the person depicted/).click();
  await page.getByRole("button", { name: "Continue to review" }).click();
  // The invented hosts are unknown platforms, so the review step is the
  // investigation variant; the seeded-platform link is still included.
  await expect(page.getByRole("heading", { name: "Request help with an unknown platform" })).toBeVisible();
  const created = page.waitForResponse((response) => response.url().endsWith("/api/cases/create"));
  await page.getByRole("button", { name: "Submit request for investigation" }).click();
  const body = (await (await created).json()) as { caseId: string; referenceNumber: string };
  await expect(page).toHaveURL(/\/case\/|\/confirmation|\/handoff\//, { timeout: 30_000 }).catch(() => undefined);
  return { ...body, links };
}
