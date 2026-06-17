import { connect } from "node:net";
import { expect, test } from "@playwright/test";

// Registration writes to Postgres; without a local DB the full browser flow
// cannot complete (this is true of the whole smoke suite). Probe once and
// skip DB-dependent tests instead of failing with a misleading timeout.
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

// Phase 2 hash flow, feature-gate behavior. The e2e server runs with
// ENABLE_HASH_UPLOAD unset (=false), matching production until the rollout
// gates pass — so the entire hash surface must be invisible:
// no API routes, no victim UI section.
//
// A flag-ON end-to-end pass (submit → admin review → dispatch) requires a
// second web server with ENABLE_HASH_UPLOAD=true and a seeded
// reviewed-by-legal template; tracked as a pre-launch QA step.

async function completeAdultRegistration(
  page: import("@playwright/test").Page,
  email: string,
) {
  await page.goto("/register");
  await page.getByText("I am 18 years of age or older.").click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Email address").fill(email);
  const otpResponse = page.waitForResponse("**/api/auth/request-otp");
  await page.getByRole("button", { name: "Send verification code" }).click();
  const otpPayload = (await (await otpResponse).json()) as { devOtp: string };
  await page.getByLabel("6-digit code").fill(otpPayload.devOtp);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/submit$/, { timeout: 30_000 });
}

async function createCase(page: import("@playwright/test").Page) {
  await page.getByLabel("Links where the content appears").fill("https://www.instagram.com/p/abc");
  await expect(page.getByText(/Detected: Instagram/)).toBeVisible();
  await page.getByLabel(/I declare/).check();
  const urlResponse = page.waitForResponse(
    (response) => response.url().includes("/api/cases/") && response.url().endsWith("/urls"),
  );
  await page.getByRole("button", { name: "Create case" }).click();
  expect((await urlResponse).ok()).toBe(true);
  await expect(page).toHaveURL(/\/case\/.+\/confirmation$/, { timeout: 15_000 });
}

test("hash API routes are invisible while ENABLE_HASH_UPLOAD is off", async ({ request }) => {
  const submit = await request.post("/api/cases/00000000-0000-0000-0000-000000000000/hashes", {
    data: { hashes: [{ hash: "a".repeat(64), quality: 90 }], declaration: true },
  });
  expect(submit.status()).toBe(404);

  const list = await request.get("/api/cases/00000000-0000-0000-0000-000000000000/hashes");
  expect(list.status()).toBe(404);

  const queue = await request.get("/api/admin/hashes");
  expect(queue.status()).toBe(404);

  const dispatch = await request.post("/api/admin/hashes/dispatch", {
    data: {
      caseId: "00000000-0000-0000-0000-000000000000",
      platformIds: ["00000000-0000-0000-0000-000000000000"],
    },
  });
  expect(dispatch.status()).toBe(404);
});

test("victim case page shows no fingerprint section while flag is off", async ({ page }) => {
  test.skip(!(await postgresReachable()), "requires local Postgres (registration persists users)");
  // First navigation compiles several routes in the Next dev server.
  test.setTimeout(120_000);
  await completeAdultRegistration(page, `hash-flag-off-${Date.now()}@example.org`);
  await createCase(page);
  await page.getByRole("link", { name: "Open dashboard" }).click();
  await expect(page).toHaveURL(/\/case\/[^/]+$/);
  await expect(page.getByText(/ASMITA-/).first()).toBeVisible();
  await expect(page.getByText("Digital fingerprints")).toHaveCount(0);
  await expect(page.getByText(/photos never leave your device/i)).toHaveCount(0);
});
