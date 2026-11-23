// NOT YET RUN. Written on a Windows machine with no Playwright and no
// Postgres, so this spec has never executed. It follows the conventions of
// lab-stamp.spec.ts and lab-message-check.spec.ts; playwright.config.ts
// sets ENABLE_LAB=true for the shared dev server, so every check below runs
// against the live page with the committed image set. Run it before
// relying on it, through e2e-some.sh:
//   npx playwright test tests/e2e/lab-spot-the-fake.spec.ts --project=chromium
//
// WP95 (docs/lab/beta-spec.md): the "Spot the fake" quiz journey — ten
// rounds, one answer each, a reveal with the tell, and a score at the
// end. Everything stays in the browser: the only request the quiz makes is
// the static manifest GET /lab/spot-the-fake/quiz.json.

import { expect, test } from "@playwright/test";

test.describe("spot-the-fake (/lab/spot-the-fake)", () => {
  test("the page is honest about what the game can and cannot do", async ({ page }) => {
    await page.goto("/lab/spot-the-fake");

    // The beta label, the plain limits sentence and the under-18 pointer
    // with the site's /minor-support pattern.
    await expect(page.getByText("Beta · Experimental")).toBeVisible();
    await expect(page.getByText(/cannot tell you whether a real image is AI-made/i)).toBeVisible();
    const under18 = page.getByRole("link", { name: "Go to the under-18 support page" });
    await expect(under18).toHaveAttribute("href", "/minor-support");

    // The privacy line: answers stay in the browser, nothing stored.
    await expect(page.getByText(/your answers stay in this browser tab/i)).toBeVisible();

    // The six tells lesson is on the page below the quiz.
    await expect(page.getByRole("heading", { name: "The six tells to look for" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What this game teaches" })).toBeVisible();

    // The bridge to the tools that act on real images.
    await expect(page.getByRole("link", { name: "Open the image checker" })).toHaveAttribute("href", "/check-image");
    await expect(page.getByRole("link", { name: "Get help" })).toHaveAttribute("href", "/get-help");

    // Back to the Lab.
    await expect(page.getByRole("link", { name: "Back to the AI Lab" })).toHaveAttribute("href", "/lab");
  });

  test("plays all ten rounds, sees a tell after every answer, and a score at the end", async ({ page }) => {
    await page.goto("/lab/spot-the-fake");

    // The manifest loaded: the start button appears.
    const start = page.getByRole("button", { name: "Start the quiz" });
    // A cold dev server compiles the page on first visit: give it the budget
    // the other Lab journeys use.
    await expect(start).toBeVisible({ timeout: 30_000 });
    await start.click();

    for (let round = 1; round <= 10; round++) {
      // Round label and the picture being judged.
      await expect(page.getByText(`Round ${round} of 10`)).toBeVisible();
      const image = page.locator('img[src^="/lab/spot-the-fake/"]');
      await expect(image).toBeVisible();
      await expect(image).toHaveAttribute("alt", /.+/);

      // Answer "Real" every round: with the committed set that is right
      // four times and wrong six, which exercises both reveal verdicts.
      await page.getByRole("button", { name: "Real" }).click();

      // The reveal is announced (role="status") and carries the answer and
      // the tell sentence from the manifest.
      const reveal = page.getByRole("status");
      await expect(reveal).toContainText(/Correct\.|Not quite\./);
      await expect(reveal).toContainText(/The answer: (Real|AI-made)\./);

      // The picture stays up with the reveal so the tell can be checked
      // against it, and the answer buttons are gone.
      await expect(image).toBeVisible();
      await expect(page.getByRole("button", { name: "Real" })).toHaveCount(0);

      const forward = round < 10
        ? page.getByRole("button", { name: "Next round" })
        : page.getByRole("button", { name: "See your score" });
      await forward.click();
    }

    // The score: a plain count, the honest "practice, not proof" message,
    // and a way to play again that really restarts.
    await expect(page.getByRole("heading", { name: "Your score" })).toBeVisible();
    await expect(page.getByText(/You got \d+ of 10 right\./)).toBeVisible();
    await expect(page.getByText(/even people who study images for a living are often wrong/i)).toBeVisible();

    await page.getByRole("button", { name: "Play again" }).click();
    await expect(page.getByText("Round 1 of 10")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your score" })).toHaveCount(0);
  });

  test("the quiz works in Hindi too", async ({ page }) => {
    await page.context().addCookies([{ name: "asmita_lang", value: "hi", url: "http://127.0.0.1:3001" }]);
    await page.goto("/lab/spot-the-fake");

    await expect(page.getByRole("heading", { name: "झूठी तस्वीर पहचानिए" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "देखने लायक़ छह निशान" })).toBeVisible();

    // One round in Hindi: the reveal sentence comes from the manifest's
    // Hindi tell, and the label reads "जवाब: …".
    await page.getByRole("button", { name: "क्विज़ शुरू कीजिए" }).click();
    await expect(page.getByText("राउंड 1, कुल 10 में से")).toBeVisible();
    await page.getByRole("button", { name: "AI से बनी" }).click();
    await expect(page.getByRole("status")).toContainText(/जवाब: (असली|AI से बनी)।/);

    await page.getByRole("button", { name: "अगला राउंड" }).click();
    await expect(page.getByText("राउंड 2, कुल 10 में से")).toBeVisible();
  });
});
