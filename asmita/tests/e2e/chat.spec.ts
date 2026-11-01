import { expect, test } from "@playwright/test";

// The E2E server has no SARVAM_CHAT_KEY, so a message that passes the limits
// and the link guard ends with 503 and nothing reaches Sarvam.

test("survivor writes in the hero, reads the notice, and nothing is sent until they continue", async ({ page }) => {
  const chatRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/chat" || url.hostname.endsWith("sarvam.ai")) chatRequests.push(request.url());
  });

  await page.goto("/");
  await expect(page.getByRole("img", { name: "Cloudflare" })).toBeVisible();
  const ask = page.getByRole("textbox", { name: "Your message" });

  // A link never leaves the browser.
  await ask.fill("it is at instagram.com/p/abc");
  await page.getByRole("button", { name: "Ask" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Please do not send links here");
  expect(chatRequests).toEqual([]);

  await ask.fill("Someone is threatening to post my photos");
  await page.getByRole("button", { name: "Ask" }).click();
  const chat = page.getByRole("dialog", { name: "Chat with Asmita Saathi" });
  await expect(chat.getByText("You will chat with an AI assistant, not a person.", { exact: false })).toBeVisible();
  await expect(chat.getByText(/Do not send images or links/)).toBeVisible();
  await expect(chat.getByRole("link", { name: "1098" })).toHaveAttribute("href", "tel:1098");
  await expect(chat.getByRole("link", { name: "112" })).toHaveAttribute("href", "tel:112");
  expect(chatRequests).toEqual([]);

  // The close button is reachable and closes the chat without sending anything.
  await chat.getByRole("button", { name: "Close chat" }).click();
  await expect(chat).toBeHidden();
  expect(chatRequests).toEqual([]);

  await page.getByRole("button", { name: "Ask" }).click();
  const reply = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/chat");
  await chat.getByRole("button", { name: "Continue and start the chat" }).click();
  expect([429, 503]).toContain((await reply).status());
  await expect(chat.getByText("Someone is threatening to post my photos")).toBeVisible();
  await expect(chat.getByRole("alert")).toContainText(/call the helpline/);
  await expect(chat.getByRole("link", { name: "+91 80654 80788" })).toHaveAttribute("href", "tel:+918065480788");
});

test("the chat route refuses links and images, routes under-18s, and caps messages site-wide", async ({ request }) => {
  const send = (content: string, token?: string) =>
    request.post("/api/chat", {
      headers: token ? { "x-csrf-token": token } : {},
      data: { locale: "en", messages: [{ role: "user", content }] },
    });
  expect((await send("hello")).status()).toBe(403);

  const { token } = (await (await request.get("/api/csrf")).json()) as { token: string };
  expect((await send(`data:image/png;base64,${"A".repeat(300)}`, token)).status()).toBe(400);

  // The daily cap is 3 in the E2E server and other tests may have spent some
  // of it, so a 429 must arrive within 4 messages. Until then, a link and a
  // stated age under 18 each get a fixed reply without reaching the model.
  const statuses: number[] = [];
  for (let i = 0; i < 4 && !statuses.includes(429); i += 1) {
    const underAge = i % 2 === 1;
    const response = await send(underAge ? "I am 17 so please help, my photos were posted" : "see www.example.com/post", token);
    statuses.push(response.status());
    if (response.status() === 200) {
      const { reply } = (await response.json()) as { reply: string };
      expect(reply).toContain(underAge ? "CHILDLINE 1098" : "meriasmita.org/start");
    }
  }
  expect(statuses.at(-1)).toBe(429);
  expect(statuses.slice(0, -1).every((status) => status === 200)).toBe(true);
});
