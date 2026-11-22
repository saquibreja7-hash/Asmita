import { expect, test, type Page } from "@playwright/test";

/*
 * Safe access (survivor-security roadmap, Phase 1 item 2): Quick Exit must
 * blank the screen, sign the survivor out, and land on the public home page —
 * via the button and via double-Escape — and an idle dashboard must sign
 * itself out.
 */

async function completeAdultRegistration(page: Page, email: string) {
  await page.goto("/register");
  await page.getByRole("radio", { name: "I am 18 years of age or older." }).check();
  await page.getByRole("radio", { name: "I was 18 or older." }).check();
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

async function createCaseAndOpenDashboard(page: Page) {
  await page.getByLabel("Links where the content appears").fill("https://www.youtube.com/watch?v=quick-exit-synthetic");
  await expect(page.locator("#url-checks").getByText("YouTube", { exact: true })).toBeVisible();
  await page.getByLabel(/I declare/).check();
  const createResponse = page.waitForResponse((response) => response.url().endsWith("/api/cases/create"));
  await page.getByRole("button", { name: "Continue to review" }).click();
  await page.getByRole("button", { name: "Create my case" }).click();
  const created = await createResponse;
  expect(created.ok()).toBe(true);
  const { caseId } = (await created.json()) as { caseId: string };
  await page.goto(`/case/${caseId}`);
  await expect(page.getByText(/ASMITA-/).first()).toBeVisible();
  return caseId;
}

async function expectSignedOut(page: Page) {
  const cookies = await page.context().cookies();
  expect(cookies.find((cookie) => cookie.name === "asmita_session")).toBeUndefined();
}

test("the Quick exit button signs the survivor out and lands on the home page", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await completeAdultRegistration(page, `quickexit-btn-${Date.now()}-${testInfo.workerIndex}@example.com`);
  const caseId = await createCaseAndOpenDashboard(page);

  await page.getByRole("button", { name: "Quick exit" }).click();

  await expect(page).toHaveURL("/", { timeout: 15_000 });
  await expectSignedOut(page);

  // The signed-out case page bounces to /start: nothing is reachable again.
  await page.goto(`/case/${caseId}`);
  await expect(page).toHaveURL(/\/start/, { timeout: 15_000 });
});

test("double-Escape does the same thing from any victim page", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await completeAdultRegistration(page, `quickexit-esc-${Date.now()}-${testInfo.workerIndex}@example.com`);
  await createCaseAndOpenDashboard(page);
  // The shortcut is attached once the page has hydrated; pressing before
  // then would drop the first Escape on a slow runner.
  await expect(page.locator(".quick-exit[data-armed='true']")).toBeVisible({ timeout: 15_000 });

  // One Escape does nothing; the second inside the window exits.
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/case\//, { timeout: 2_000 });
  await page.keyboard.press("Escape");

  await expect(page).toHaveURL("/", { timeout: 15_000 });
  await expectSignedOut(page);
});

test("an idle dashboard signs the survivor out by itself", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await completeAdultRegistration(page, `quickexit-idle-${Date.now()}-${testInfo.workerIndex}@example.com`);
  await createCaseAndOpenDashboard(page);

  // NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_MS is 60s in this environment: the idle
  // exit lands on the public home page, signed out.
  await expect(page).toHaveURL("/", { timeout: 120_000 });
  await expectSignedOut(page);
});

test("quick exit wipes the tab: no draft survives and Back brings none of it back", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await completeAdultRegistration(page, `quickexit-wipe-${Date.now()}-${testInfo.workerIndex}@example.com`);
  // A typed link sits in the form; left alone it would travel to the review
  // step through sessionStorage (asmita_submit_draft).
  await page.getByLabel("Links where the content appears").fill("https://www.youtube.com/watch?v=quickexit-wipe-synthetic");
  await expect(page.locator("#url-checks").getByText("YouTube", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Quick exit" }).click();

  await expect(page).toHaveURL("/", { timeout: 15_000 });
  await expectSignedOut(page);

  // The tab holds neither the submit draft nor the eligibility answers.
  expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);

  // Going Back cannot bring the form or any case data back: the history
  // entry was replaced, a back/forward cache restore reloads (next test),
  // and the tab is empty either way.
  await page.goBack();
  await expect(page.getByLabel("Links where the content appears")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator("#url-checks")).toHaveCount(0, { timeout: 15_000 });
  await expect(page).not.toHaveURL(/\/(submit|case\/)/, { timeout: 15_000 });
});

test("a page restored from the back/forward cache reloads, so a restore after quick exit shows nothing", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await completeAdultRegistration(page, `quickexit-bfcache-${Date.now()}-${testInfo.workerIndex}@example.com`);
  await createCaseAndOpenDashboard(page);

  // An ordinary pageshow (persisted = false, the normal load) must not
  // reload the page — dropping that guard would reload every page forever.
  await page.evaluate(() => {
    (window as unknown as { __wp41Probe?: boolean }).__wp41Probe = true;
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false }));
  });
  await page.waitForTimeout(1_000);
  expect(await page.evaluate(() => (window as unknown as { __wp41Probe?: boolean }).__wp41Probe)).toBe(true);

  // A back/forward cache restore arrives as pageshow with persisted = true,
  // with the frozen page still holding everything it had when it was left —
  // even after Quick Exit signed the session out in between. The page must
  // reload, so only a fresh, signed-out load can ever show.
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });
  await page.waitForFunction(() => !(window as unknown as { __wp41Probe?: boolean }).__wp41Probe, undefined, {
    timeout: 15_000,
  });
  // The reload landed back on the still-signed-in dashboard, not on a frozen copy.
  await expect(page.getByText(/ASMITA-/).first()).toBeVisible();
});
