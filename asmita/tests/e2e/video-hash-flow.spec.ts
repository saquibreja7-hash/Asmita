import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// WP18: fingerprinting a video in her browser (vPDQ). The synthetic WebM is
// committed under tests/fixtures/video/ (ffmpeg lavfi sources only, six
// visually distinct seconds), and every test below asserts the safety rule
// the whole feature stands on: the video itself never leaves her device, and
// no request body ever carries image or video data — only frame hashes.

// The spec pins these tests to chromium; the mobile project does not run them
// (checked per test, because hooks must destructure their first argument).
function onlyChromium(testInfo: { project: { name: string } }) {
  test.skip(testInfo.project.name !== "chromium", "vPDQ browser sampling is specified for chromium");
}

const FIXTURE_PATH = join(process.cwd(), "tests/fixtures/video/synthetic-6s.webm");

// The fixture is six seconds of six different synthetic sources, so one frame
// per second keeps all six (quality above 50, pairwise Hamming far above 10).
const EXPECTED_FRAMES = 6;

async function register(page: Page) {
  await page.goto("/register");
  await page.getByText("I am 18 years of age or older.").click();
  await page.getByText("I was 18 or older.").click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Email address").fill(`video-${Date.now()}@example.org`);
  const otpResponse = page.waitForResponse("**/api/auth/request-otp");
  await page.getByRole("button", { name: "Send verification code" }).click();
  const otp = (await (await otpResponse).json()) as { devOtp: string };
  await page.getByLabel("6-digit code").fill(otp.devOtp);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/submit$/, { timeout: 30_000 });
}

// The "Reading your video on this device: N%" and "Your video is not
// uploaded." lines only live while the file is being read, which can be well
// under a second — they are recorded from the DOM as they appear.
async function recordTransientVideoUi(page: Page) {
  await page.evaluate(() => {
    const progress: number[] = [];
    let notUploadedSeen = false;
    const scan = () => {
      const text = document.body.textContent ?? "";
      const match = text.match(/Reading your video on this device:\s*(\d+)%/);
      if (match) {
        const value = Number(match[1]);
        if (!progress.includes(value)) progress.push(value);
      }
      if (text.includes("Your video is not uploaded.")) notUploadedSeen = true;
    };
    scan();
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true, characterData: true });
    (window as unknown as { __videoUiSeen: () => { progress: number[]; notUploadedSeen: boolean } }).__videoUiSeen =
      () => ({ progress, notUploadedSeen });
  });
}

async function transientVideoUi(page: Page) {
  return page.evaluate(() =>
    (window as unknown as { __videoUiSeen: () => { progress: number[]; notUploadedSeen: boolean } }).__videoUiSeen(),
  );
}

test("registered adult can fingerprint a synthetic video and submit its frame hashes with a URL", async ({ page }, testInfo) => {
  onlyChromium(testInfo);
  test.setTimeout(180_000);
  const fixture = readFileSync(FIXTURE_PATH);
  // Every request body of the whole journey, so the media scan sees everything.
  const bodies: { url: string; body: Buffer }[] = [];
  page.on("request", (request) => {
    const body = request.postDataBuffer();
    if (body) bodies.push({ url: request.url(), body });
  });

  await register(page);
  await recordTransientVideoUi(page);

  // The hashes route is WP17 (the other lane). This branch carries the client
  // only, so the POST is intercepted, asserted against the WP17 contract and
  // answered with the contract's success shape — the exact body it sent is
  // what this test is about. When both lanes merge, the route itself enforces
  // the same schema server-side.
  let hashesBody: { hashes?: unknown[] } | null = null;
  await page.route(/\/api\/cases\/[^/]+\/hashes$/, async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    hashesBody = route.request().postDataJSON() as { hashes?: unknown[] };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: [{ ok: true, duplicate: false }] }),
    });
  });

  await page.getByLabel("Links where the content appears").fill("https://www.youtube.com/watch?v=asmita-video-synthetic");
  await page.locator('input[type="file"]').setInputFiles({
    name: "synthetic-6s.webm",
    mimeType: "video/webm",
    buffer: fixture,
  });

  await expect(page.getByText(/Video fingerprint ready · 6 frames/)).toBeVisible({ timeout: 60_000 });
  // While it read, the page said it was reading on this device, showed live
  // per-second progress, and said the video is not uploaded.
  const seen = await transientVideoUi(page);
  expect(seen.notUploadedSeen, "the page said the video is not uploaded").toBe(true);
  expect(seen.progress.length, "live per-second progress was shown").toBeGreaterThan(1);
  expect(Math.max(...seen.progress)).toBe(100);
  await expect(page.getByText(/Video fingerprint created on this device\./)).toBeVisible();

  await page.getByLabel(/I declare/).check();
  await page.getByRole("button", { name: "Continue to review" }).click();
  // The review lists the video as one fingerprint with its frame count.
  await expect(page.getByText(/Video 1/)).toBeVisible();
  await expect(page.getByText(/6 frames/)).toBeVisible();
  await page.getByRole("button", { name: "Create my case" }).click();

  // The submission carries exactly the WP17 video item.
  await expect.poll(() => hashesBody, { timeout: 60_000 }).toBeTruthy();
  const hashes = hashesBody!.hashes!;
  expect(hashes).toHaveLength(1);
  const item = hashes[0] as {
    kind?: string;
    frames?: { hash: string; quality: number; t: number }[];
    durationSec?: number;
    clientVersion?: string;
    hash?: string;
    quality?: number;
  };
  expect(item.kind).toBe("video");
  expect(item.durationSec).toBe(6);
  expect(item.clientVersion).toMatch(/^vpdq-ts-/);
  expect(item.frames).toHaveLength(EXPECTED_FRAMES);
  for (const [index, frameItem] of item.frames!.entries()) {
    expect(frameItem.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(frameItem.quality).toBeGreaterThanOrEqual(50);
    expect(frameItem.quality).toBeLessThanOrEqual(100);
    expect(frameItem.t).toBe(index);
  }
  // Strict shape: none of the image item's fields rides along.
  expect(item.hash).toBeUndefined();
  expect(item.quality).toBeUndefined();

  // The journey completed: the case was created with the URL and the video
  // fingerprint, and she lands on the case-saved page — signing comes later,
  // after the notice template's legal review (nothing here may set
  // reviewedByLegal; notice-integrity.spec.ts covers the sign step itself).
  await expect(page.getByRole("heading", { name: "You are done for now." })).toBeVisible({ timeout: 60_000 });

  // No request of the whole journey carried media: not the fixture's bytes,
  // not a data: URL, not a base64 blob.
  const magic = fixture.subarray(0, 32);
  for (const { url, body } of bodies) {
    expect(body.includes(magic), `media bytes in request body: ${url}`).toBe(false);
    const text = body.toString("latin1");
    expect(text.includes("data:video/"), `data: video URL in request body: ${url}`).toBe(false);
    expect(text.includes("data:image/"), `data: image URL in request body: ${url}`).toBe(false);
  }
});

test("a video the browser cannot read gets a kind message and nothing is sent", async ({ page }, testInfo) => {
  onlyChromium(testInfo);
  test.setTimeout(120_000);
  await register(page);
  let anyCaseRequest = false;
  page.on("request", (request) => {
    if (request.url().includes("/api/cases/")) anyCaseRequest = true;
  });

  await page.locator('input[type="file"]').setInputFiles({
    name: "not-really-a-video.webm",
    mimeType: "video/webm",
    buffer: Buffer.from("these are not video frames, only bytes for a test of the kind message"),
  });

  await expect(page.getByText(/We could not read this video\./)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Nothing was sent\./)).toBeVisible();
  await page.getByLabel(/I declare/).check();
  // No fingerprint came out of it, so there is nothing to submit.
  await expect(page.getByRole("button", { name: "Continue to review" })).toBeDisabled();
  expect(anyCaseRequest).toBe(false);
});
