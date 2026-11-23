// NOT YET RUN. Written on a Windows machine with no Playwright and no
// Postgres, so this spec has never executed. It follows the conventions of
// lab.spec.ts and chat.spec.ts; playwright.config.ts sets ENABLE_LAB=true
// for the shared dev server and SARVAM_CHAT_KEY is empty, so every check
// below runs on code rules and the in-process WP117 classifier only —
// nothing can reach Sarvam. Run it before relying on it, through
// e2e-some.sh:
//   npx playwright test tests/e2e/lab-message-check.spec.ts --project=chromium
//
// WP93 + WP117 (docs/lab/beta-spec.md, docs/research/research-tools-spec.md
// Track D): the message check journey. Both engines run — the WP93 pattern
// rules and the WP117 classifier — and the page shows one plain sentence
// per detected element, followed by stage-chosen advice. All pasted text is
// invented; the links are reserved .test domains, and the test asserts the
// site never fetches one of them. The element-sentence assertions were
// pinned against the real pipeline output for these exact fixtures (the
// committed model flags the threat in every script and leaves the harmless
// chat completely clean).

import { expect, test } from "@playwright/test";

const THREAT =
  "I have your nudes. Send 50000 rupees in bitcoin within 24 hours or I send everything to your family. " +
  "The proof is at https://proof.example.test/x — WhatsApp me on +1 555 0103456.";

const HARMLESS = "shaadi ki video bhej do na, dekhne ka mann hai.";

test.describe("message check (/lab/message-check)", () => {
  test("a visitor checks a threatening message: elements, advice and credits, with nothing fetched", async ({ page }) => {
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

    // Results are announced (role=status) and open with the honest heading.
    // The first check compiles the route and loads the classifier model on the
    // dev server, which can take longer than the default wait.
    await expect(page.getByRole("status")).toHaveText(/What we noticed/i, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "What we noticed" })).toBeVisible();
    await expect(page.getByText(/matches patterns we often see in sextortion/i)).toBeVisible();

    // One sentence per element: the classifier's labels first (WP117)…
    await expect(page.getByText("A threat to share or send out a video or photos.")).toBeVisible();
    await expect(page.getByText("The threat names your family or your contacts.")).toBeVisible();
    await expect(page.getByText("A demand for money.")).toBeVisible();
    await expect(page.getByText("A deadline.")).toBeVisible();
    // …then the rule sentences for elements the model does not label:
    // the claim of images, crypto, and the foreign number (WP93).
    await expect(page.getByText(/claims to have intimate images of you/i)).toBeVisible();
    await expect(page.getByText(/paid in crypto or gift cards/i)).toBeVisible();
    await expect(page.getByText(/pushes you to a foreign number/i)).toBeVisible();
    // A rule whose element a label already covers is not shown twice: the
    // money and deadline rule sentences stay hidden.
    await expect(page.getByText(/The message demands money/i)).toBeHidden();
    await expect(page.getByText(/sets a deadline or countdown/i)).toBeHidden();

    // Stage-chosen advice follows, non-blaming first — never a score or a
    // percentage anywhere.
    await expect(page.getByRole("heading", { name: "What you can do now" })).toBeVisible();
    await expect(page.getByText("This is not your fault.")).toBeVisible();
    await expect(page.getByText(/Do not pay, and do not send money/i)).toBeVisible();
    await expect(page.getByText(/Report it at 1930 or on cybercrime\.gov\.in\./i)).toBeVisible();

    // The required honest limit line, always, in both languages.
    await expect(
      page.getByText("This check can be wrong. It looks for patterns seen in known blackmail cases."),
    ).toBeVisible();

    // No AI summary exists without the key: the summary block does not render.
    await expect(page.getByText("In plain words", { exact: true })).toBeHidden();

    // The links and numbers in the message were data, never destinations:
    // nothing was fetched from them, and nothing reached Sarvam.
    expect(requestedHosts).not.toContain("proof.example.test");
    expect(requestedHosts.filter((host) => host.endsWith("sarvam.ai"))).toEqual([]);
  });

  test("an invented harmless family chat stays clean: no element, no advice, no alarm", async ({ page }) => {
    await page.goto("/lab/message-check");
    await page.getByLabel("The message you received").fill(HARMLESS);
    await page.getByRole("button", { name: "Check the message" }).click();

    await expect(page.getByRole("heading", { name: "What we noticed" })).toBeVisible();
    await expect(page.getByText("No common pattern matched.")).toBeVisible();
    await expect(page.getByText(/does not mean the message is safe/i)).toBeVisible();
    // No element sentence, no advice block, no "matches patterns" alarm.
    await expect(page.getByText(/matches patterns we often see in sextortion/i)).toBeHidden();
    await expect(page.getByText("A demand for money.")).toBeHidden();
    await expect(page.getByRole("heading", { name: "What you can do now" })).toBeHidden();
    // The honest limit line still qualifies the check.
    await expect(
      page.getByText("This check can be wrong. It looks for patterns seen in known blackmail cases."),
    ).toBeVisible();
  });

  test("a stated age under 18 goes to the under-18 path and the tool does not run", async ({ page }) => {
    await page.goto("/lab/message-check");
    await page.getByLabel("The message you received").fill("I am 15 and he is threatening me with my photos");
    await page.getByRole("button", { name: "Check the message" }).click();

    // The minor title renders twice by design: a screen-reader-only
    // role="status" announcement and the visible, focused heading
    // (MessageCheckForm's A5 pattern) — so the assertion names the heading.
    await expect(page.getByRole("heading", { name: "This needs the under-18 support path" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to under-18 support" })).toHaveAttribute("href", "/minor-support");
    // The analysis never ran.
    await expect(page.getByRole("heading", { name: "What we noticed" })).toBeHidden();
  });

  test("the page and the results work in Hindi too", async ({ page }) => {
    await page.context().addCookies([{ name: "asmita_lang", value: "hi", url: "http://127.0.0.1:3001" }]);
    await page.goto("/lab/message-check");
    await expect(page.getByRole("heading", { name: "सेक्सटॉर्शन क्लासिफ़ायर", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "अभी क्या करें" })).toBeVisible();

    await page.getByLabel("आपको मिला संदेश").fill(THREAT);
    await page.getByRole("button", { name: "संदेश की जाँच करें" }).click();
    await expect(page.getByRole("heading", { name: "हमने जो देखा" })).toBeVisible();
    // The classifier's element sentences in Hindi, and the non-blaming line.
    await expect(page.getByText("पैसों की माँग।")).toBeVisible();
    await expect(page.getByText("एक समय-सीमा।")).toBeVisible();
    await expect(page.getByText("यह आपकी गलती नहीं है।")).toBeVisible();
    await expect(
      page.getByText("यह जाँच गलत हो सकती है। यह ज्ञात ब्लैकमेल के मामलों में देखे गए पैटर्न ढूँढती है।"),
    ).toBeVisible();
  });

  test("the 'How this check works' section credits the research honestly", async ({ page }) => {
    await page.goto("/lab/message-check");
    const how = page.getByRole("region", { name: "How this check works" });
    await expect(how.getByRole("heading", { name: "How this check works" })).toBeVisible();
    // The documented Indian patterns, in plain words.
    await expect(how.getByText(/how sextortion actually happens in India/i)).toBeVisible();
    // Synthetic training data and the honest test-set numbers.
    await expect(how.getByText(/trained on synthetic example messages written by Asmita/i)).toBeVisible();
    await expect(how.getByText(/336 invented examples/i)).toBeVisible();
    // The bias finding, cited and linked (Sap et al., ACL 2019).
    await expect(how.getByText(/can misjudge some dialects, scripts and ways of writing/i)).toBeVisible();
    const citation = how.getByRole("link", { name: /The Risk of Racial Bias in Hate Speech Detection/ });
    await expect(citation).toHaveAttribute("href", "https://aclanthology.org/P19-1163/");
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

    // A valid check returns both engines' results as ids only — rule ids,
    // taxonomy labels, the combination rule's flag and advice ids — never a
    // score, and links in the text are never fetched.
    const response = await send({ text: `${THREAT} Also see www.proof.example.test/y` });
    expect(response.status()).toBe(200);
    const body = (await response.json()) as {
      matches: string[];
      labels: string[];
      flagged: boolean;
      advice: string[];
      summary: string | null;
    };
    expect(body.matches.length).toBeGreaterThan(3);
    expect(body.labels).toContain("DEMAND_MONEY");
    expect(body.labels).toContain("DEADLINE");
    expect(body.flagged).toBe(true);
    expect(body.advice[0]).toBe("notYourFault");
    expect(body.summary).toBeNull();
    // No score, probability or percentage ever leaves the isolate, and the
    // pasted text is not echoed back.
    expect(JSON.stringify(body)).not.toMatch(/score|percent|probability/i);
    expect(JSON.stringify(body)).not.toContain("proof.example.test");

    // A harmless message stays clean at the API level too.
    const clean = (await (await send({ text: HARMLESS })).json()) as {
      matches: string[];
      labels: string[];
      flagged: boolean;
      advice: string[];
    };
    expect(clean.flagged).toBe(false);
    expect(clean.labels).toEqual([]);
    expect(clean.matches).toEqual([]);
    expect(clean.advice).toEqual([]);
  });
});
