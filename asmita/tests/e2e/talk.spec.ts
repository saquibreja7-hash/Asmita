import { expect, test } from "@playwright/test";
import { VOICE_AGENT_PATH } from "../../src/lib/helpline";

// The E2E server has no SARVAM_API_KEY, so a session that gets past the
// rate limits ends with 503 and nothing ever reaches Sarvam.

test("survivor sees the notice before any voice call, and nothing reaches Sarvam first", async ({ page }) => {
  const sarvamTraffic: string[] = [];
  const voiceStarts: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).hostname.endsWith("sarvam.ai")) sarvamTraffic.push(request.url());
    if (new URL(request.url()).pathname.startsWith("/api/voice/")) voiceStarts.push(request.url());
  });
  page.on("websocket", (socket) => {
    if (new URL(socket.url()).hostname.endsWith("sarvam.ai")) sarvamTraffic.push(socket.url());
  });

  const home = await page.goto("/");
  expect(home?.headers()["permissions-policy"]).toContain("microphone=()");
  expect(home?.headers()["content-security-policy"]).not.toContain("sarvam.ai");

  await page.getByRole("link", { name: "Talk to us from your browser" }).click();
  await expect(page).toHaveURL(/\/talk$/);
  await expect(page.getByRole("heading", { name: "Before you start" })).toBeVisible();
  await expect(page.getByText("You will talk to an AI assistant, not a person.", { exact: false })).toBeVisible();
  await expect(page.getByText(/Do not share images/)).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "112" })).toHaveAttribute("href", "tel:112");
  await expect(page.getByRole("main").getByRole("link", { name: "+91 80654 80788" })).toHaveAttribute("href", "tel:+918065480788");
  expect(voiceStarts).toEqual([]);

  const talk = await page.request.get("/talk");
  expect(talk.headers()["permissions-policy"]).toContain("microphone=(self)");
  expect(talk.headers()["content-security-policy"]).toContain("connect-src 'self' wss://apps.sarvam.ai");

  const sessionStart = page.waitForResponse((response) => response.url().includes("/api/voice/"));
  await page.getByRole("button", { name: "Continue and start the call" }).click();
  expect([429, 503]).toContain((await sessionStart).status());
  await expect(page.getByRole("main").getByRole("alert")).toContainText(/call the helpline/);
  await expect(page.getByRole("main").getByRole("link", { name: "+91 80654 80788" })).toBeVisible();
  expect(sarvamTraffic).toEqual([]);
});

test("the voice notice reads in Hindi with the numbers still tappable", async ({ page, context }) => {
  await context.addCookies([{ name: "asmita_lang", value: "hi", url: "http://127.0.0.1:3001" }]);
  await page.goto("/talk");
  await expect(page.getByRole("heading", { name: "शुरू करने से पहले" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "1098" })).toHaveAttribute("href", "tel:1098");
  await expect(page.getByRole("main").getByRole("link", { name: "112" })).toHaveAttribute("href", "tel:112");
  await expect(page.getByRole("main").getByRole("link", { name: "+91 80654 80788" })).toHaveAttribute("href", "tel:+918065480788");
});

test("voice session starts are capped site-wide", async ({ request }) => {
  const sessionUrl = `/api/voice/${VOICE_AGENT_PATH}?interaction_type=call&version=6`;
  expect((await request.get(sessionUrl)).status()).toBe(403);

  const { token } = (await (await request.get("/api/csrf")).json()) as { token: string };
  // The daily cap is 3 in the E2E server, and other tests may already have
  // spent some of it, so a 429 must arrive within 4 tries.
  const statuses: number[] = [];
  for (let i = 0; i < 4 && !statuses.includes(429); i += 1) {
    statuses.push((await request.get(sessionUrl, { headers: { "x-csrf-token": token } })).status());
  }
  expect(statuses.at(-1)).toBe(429);
  expect(statuses.slice(0, -1).every((status) => status === 503)).toBe(true);
});
