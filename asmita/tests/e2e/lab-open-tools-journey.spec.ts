// The WP155 walk (docs/lab/open-tools-spec.md, Part G WP155): Lab hub →
// Open tools → filter "Prevent" + "an AI app" → NCII Prompt Guard → its
// stack → back. One spec follows the whole journey through real links
// and real filters, so it proves the three surfaces the earlier WPs
// built meet: the hub cards reach the directory, the directory's
// combined filters find the tool the stack names, the tool page's
// closing band reaches its stack, and the browser's back button returns
// to the tool page.

import { expect, test } from "@playwright/test";
import { OPEN_TOOLS } from "@/lib/lab/open-tools/catalogue";
import { filterTools } from "@/lib/lab/open-tools/filters";
import { stacksUsingTool } from "@/lib/lab/open-tools/stacks";

const guard = OPEN_TOOLS.find((tool) => tool.slug === "ncii-prompt-guard")!;
const guardStacks = stacksUsingTool("ncii-prompt-guard");

test.describe("AI Lab open tools walk, WP155", () => {
  test("Lab hub → Open tools → Prevent + an AI app → NCII Prompt Guard → its stack → back", async ({
    page,
  }) => {
    // The dev server compiles a route on first request, and a cold compile
    // of a dynamic route can outlast any single wait in the e2e container
    // (WP152's lesson). Warm the two dynamic routes the walk ends on.
    test.setTimeout(180_000);
    await page.goto("/lab/open-tools/ncii-prompt-guard", { timeout: 120_000 });
    await expect(page.getByRole("heading", { name: "NCII Prompt Guard", exact: true })).toBeVisible();
    await page.goto("/lab/stacks/ai-app-guardrails", { timeout: 120_000 });
    await expect(
      page.getByRole("heading", { name: "Stop your AI image or video tool being used to undress people" }),
    ).toBeVisible();

    // 1. The Lab hub's section card reaches the directory.
    await page.goto("/lab");
    await page.getByRole("link", { name: "Open tools", exact: true }).click();
    await page.waitForURL("**/lab/open-tools", { timeout: 60_000 });
    // The filter UI arrives with hydration; before it the cards are
    // already there (asserted by WP151's no-JavaScript spec).
    await page.getByRole("button", { name: "All", exact: true }).waitFor();

    // 2. Filter "Prevent" + "an AI app": the AND of stage and audience.
    await page.getByRole("button", { name: "Prevent", exact: true }).click();
    await page.getByRole("button", { name: "an AI app" }).click();
    const both = filterTools(OPEN_TOOLS, { stage: "prevent", audience: "ai-app" });
    await expect(page.locator("article.ot-card")).toHaveCount(both.length);
    expect(both.map((tool) => tool.slug)).toContain("ncii-prompt-guard");
    await expect(page.locator(".ot-count")).toContainText(`${both.length} tools shown`);

    // 3. Open NCII Prompt Guard's page from the filtered directory.
    await page.locator('a[href="/lab/open-tools/ncii-prompt-guard"]').click();
    await page.waitForURL("**/lab/open-tools/ncii-prompt-guard", { timeout: 60_000 });
    await expect(page.getByRole("heading", { name: "NCII Prompt Guard", exact: true })).toBeVisible();

    // 4. Its stack: the closing band links the stacks that use it — the
    // AI app guardrail stack and the at-scale stack, whose step 5 names
    // the guard for platforms with AI features. The walk takes the AI
    // app one, which the "Prevent + an AI app" filters pointed at.
    expect(guardStacks.map((stack) => stack.slug)).toEqual(["ai-app-guardrails", "rules-and-review"]);
    await expect(page.getByRole("heading", { name: "See it in a stack" })).toBeVisible();
    await page.locator('a[href="/lab/stacks/ai-app-guardrails"]').first().click();
    await page.waitForURL("**/lab/stacks/ai-app-guardrails", { timeout: 60_000 });
    await expect(
      page.getByRole("heading", { name: "Stop your AI image or video tool being used to undress people" }),
    ).toBeVisible();
    // The stack names the tool in its steps, so the way back is visible.
    await expect(page.locator('a[href="/lab/open-tools/ncii-prompt-guard"]').first()).toBeVisible();

    // 5. Back: the browser's back button returns to the tool page.
    await page.goBack();
    await page.waitForURL("**/lab/open-tools/ncii-prompt-guard", { timeout: 60_000 });
    await expect(page.getByRole("heading", { name: "NCII Prompt Guard", exact: true })).toBeVisible();
    // And the guard's own summary is what the directory card showed.
    await expect(page.locator(".ot-tool-chips")).toContainText("MIT");
    expect(guard.stages).toEqual(["prevent"]);
    expect(guard.audiences).toContain("ai-app");
  });
});
