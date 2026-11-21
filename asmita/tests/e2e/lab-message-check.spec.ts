// NOT YET RUN. Written on a Windows machine with no Playwright and no
// Postgres, so this spec has never executed. It follows the conventions of
// lab.spec.ts and chat.spec.ts; playwright.config.ts sets ENABLE_LAB=true
// for the shared dev server and SARVAM_CHAT_KEY is empty, so every check
// below runs on code rules only and nothing can reach Sarvam. Run it before
// relying on it, through e2e-some.sh:
//   npx playwright test tests/e2e/lab-message-check.spec.ts --project=chromium
//
// WP93 (docs/lab/beta-spec.md): the message check journey. All pasted text
// is invented; the links are reserved .test domains, and the test asserts
// the site never fetches one of them.

import { expect, test } from "@playwright/test";

const THREAT =
  "I have your nudes. Send 50000 rupees in bitcoin within 24 hours or I send everything to your family. " +
  "The proof is at https://proof.example.test/x — WhatsApp me on +1 555 0103456.";

test.describe("message check (/lab/message-check)", () => {
  test("a visitor checks a threatening message and the patterns are explained, with nothing fetched", async ({ page }) => {
    const requestedHosts: string[] = [];
    page.on("request", (request) => requestedHosts.push(new URL(request.url()).hostname));

    await page.goto("/lab/message-check");

    // The beta label and its honest limits sentence are visible, and the
    // under-18 pointer carries the site's /minor-support pattern.
    await expect(page.getByText("Beta · Experimental")).toBeVisible();
    await expect(page.getByText(/cannot tell you who sent the message/i)).toBeVisible();
    const under18 = page.getByRole("link", { name: "Go to the under-18 support page" });
    await expect(under18).toHaveAttribute("href", "/minor-support");

    // The fixed help is on the page before any check runs.
    const next = page.getByRole("region", { name: "What to do now" });
    await expect(next.getByRole("heading", { name: "What to do now" })).toBeVisible();
    await expect(next.getByRole("link", { name: "1930" })).toHaveAttribute("href", "tel:1930");
    await expect(next.getByRole("link", { name: "181" })).toHaveAttribute("href", "tel:181");
    await expect(next.getByRole("link", { name: "112" })).toHaveAttribute("href", "tel:112");

    // Paste an invented threatening message and check it.
    await page.getByLabel("The message you received").fill(THREAT);
    await page.getByRole("button", { name: "Check the message" }).click();

    // Results are announced (role=status) and explained in plain words.
    await expect(page.getByRole("status")).toHaveText(/What we noticed/i);
    await expect(page.getByRole("heading", { name: "What we noticed" })).toBeVisible();
    await expect(page.getByText(/matches patterns we often see in sextortion/i)).toBeVisible();
    await expect(page.getByText(/The message demands money/i)).toBeVisible();
    await expect(page.getByText(/threatens to send images or information to your family/i)).toBeVisible();
    await expect(page.getByText(/claims to have intimate images of you/i)).toBeVisible();

    // No AI summary exists without the key, and the honest note says so by
    // its absence: the summary block simply does not render.
    await expect(page.getByText("In plain words")).toBeHidden();

    // The links and numbers in the message were data, never destinations:
    // nothing was fetched from them, and nothing reached Sarvam.
    expect(requestedHosts).not.toContain("proof.example.test");
    expect(requestedHosts.filter((host) => host.endsWith("sarvam.ai"))).toEqual([]);
  });

  test("a stated age under 18 goes to the under-18 path and the tool does not run", async ({ page }) => {
    await page.goto("/lab/message-check");
    await page.getByLabel("The message you received").fill("I am 15 and he is threatening me with my photos");
    await page.getByRole("button", { name: "Check the message" }).click();

    await expect(page.getByText("This needs the under-18 support path")).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to under-18 support" })).toHaveAttribute("href", "/minor-support");
    // The analysis never ran.
    await expect(page.getByRole("heading", { name: "What we noticed" })).toBeHidden();
  });

  test("the page and the results work in Hindi too", async ({ page }) => {
    await page.context().addCookies([{ name: "asmita_lang", value: "hi", url: "http://127.0.0.1:3001" }]);
    await page.goto("/lab/message-check");
    await expect(page.getByRole("heading", { name: "धमकी भरे संदेश की जाँच करें" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "अभी क्या करें" })).toBeVisible();

    await page.getByLabel("आपको मिला संदेश").fill(THREAT);
    await page.getByRole("button", { name: "संदेश की जाँच करें" }).click();
    await expect(page.getByRole("heading", { name: "हमने जो देखा" })).toBeVisible();
    await expect(page.getByText(/संदेश में पैसे की माँग की गई है/i)).toBeVisible();
  });

  test("the route keeps its hygiene at the API level", async ({ request }) => {
    // No CSRF pair: refused.
    expect((await request.post("/api/lab/message-check", { data: { text: "hello" } })).status()).toBe(403);

    const { token } = (await (await request.get("/api/csrf")).json()) as { token: string };
    const send = (data: unknown) =>
      request.post("/api/lab/message-check", {
        headers: { "x-csrf-token": token },
        data: data as Record<string, unknown>,
      });

    // Over the 4,000-character cap, and an unknown key: invalid payloads.
    expect((await send({ text: "a".repeat(4001) })).status()).toBe(400);
    expect((await send({ text: "hello", sneaky: true })).status()).toBe(400);
    // An oversized envelope is refused before it is parsed.
    expect((await send("x".repeat(20 * 1024))).status()).toBe(413);

    // A valid check returns the code results, and links in the text are
    // never fetched: the only hosts the API talks to are its own.
    const response = await send({ text: `${THREAT} Also see www.proof.example.test/y` });
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { matches: string[]; summary: string | null };
    expect(body.matches.length).toBeGreaterThan(3);
    expect(body.summary).toBeNull();
    expect(JSON.stringify(body)).not.toContain("proof.example.test");
  });
});
