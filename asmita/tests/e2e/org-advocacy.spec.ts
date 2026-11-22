import { expect, test, type APIRequestContext } from "@playwright/test";
import { adminContext } from "./support/admin";
import { withAdmin } from "./support/database";

/*
 * Organization pages, WP58 (docs/org/spec.md): /policy and /research in both
 * languages, the platform scorecard's empty state before any publish, the
 * seeded-draft-then-publish journey that puts the table and the CSV link on
 * the public page, and the small-number rule hiding a platform's numbers.
 * The full run happens in a separate verify step with a fresh throwaway
 * database; everything here is synthetic data only.
 */

async function send(request: APIRequestContext, method: "post" | "put", path: string, data: unknown) {
  const { token } = (await (await request.get("/api/csrf")).json()) as { token: string };
  const headers = { "x-csrf-token": token };
  if (method === "post") return request.post(path, { data, headers });
  return request.put(path, { data, headers });
}

const HINDI = [{ name: "asmita_lang", value: "hi", url: "http://127.0.0.1:3001" }];

const seededSnapshot = (period: string) => ({
  period,
  minNotices: 10,
  deadlineHours: 2,
  platforms: [
    {
      platformName: "Example Chat",
      insufficient: false,
      noticesSent: 15,
      hashAdvisoriesSent: 3,
      urlNoticesSent: 12,
      shareActioned: 0.583,
      medianHoursToFirstResponse: 10,
      medianHoursToRemoval: 6,
      shareActionedWithinDeadline: 0.25,
      followUpsNeeded: 2,
    },
    {
      platformName: "Tiny Forum",
      insufficient: true,
      noticesSent: null,
      hashAdvisoriesSent: null,
      urlNoticesSent: null,
      shareActioned: null,
      medianHoursToFirstResponse: null,
      medianHoursToRemoval: null,
      shareActionedWithinDeadline: null,
      followUpsNeeded: null,
    },
  ],
});

test("/policy renders in English and Hindi", async ({ page }) => {
  await page.goto("/policy");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("What we push for");
  await expect(page.getByText("<TO_FILL: the owner's priority asks>")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Our priorities" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Papers and submissions" })).toBeVisible();
  await expect(page.getByText("No policy papers published yet.")).toBeVisible();

  await page.context().addCookies(HINDI);
  await page.goto("/policy");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("हम किस बात के लिए आवाज़ उठाते हैं");
  await expect(page.getByRole("heading", { name: "हमारी प्राथमिकताएँ" })).toBeVisible();
});

test("/research renders in English and Hindi", async ({ page }) => {
  await page.goto("/research");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Research and reporting");
  await expect(page.getByRole("heading", { name: "Our first reports are in progress" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Open tools and data" })).toBeVisible();

  await page.context().addCookies(HINDI);
  await page.goto("/research");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("शोध और रिपोर्ट");
});

test("/research/platform-scorecard shows the empty state with no published snapshot", async ({ page }) => {
  // Nothing published in the fresh database: the route shows the honest
  // empty state and the nav does not link to it.
  await page.goto("/research/platform-scorecard");
  await expect(page.getByRole("heading", { name: "The first scorecard is not out yet" })).toBeVisible();
  await expect(page.getByText(/Our first scorecard will be published after/)).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Platform scorecard" })).toHaveCount(0);
});

test("an admin publishes a seeded draft snapshot and the table and CSV link appear", async ({ browser, page }) => {
  // Seed a DRAFT snapshot for a past quarter, the way the maintenance cron
  // would leave it, then publish it through the real admin API.
  const snapshotId = await withAdmin(async (db) => {
    const result = await db.query(
      `INSERT INTO "ScorecardSnapshot" ("id", "period", "computedAt", "data", "status", "createdAt", "updatedAt")
       VALUES ($1, $2, now(), $3, 'DRAFT', now(), now()) RETURNING "id"`,
      ["scorecard-e2e-1", "2026-Q1", JSON.stringify(seededSnapshot("2026-Q1"))],
    );
    return result.rows[0].id as string;
  });

  const request = (await adminContext(browser)).request;
  const published = await send(request, "put", `/api/admin/org/scorecard/${snapshotId}`, { publish: true });
  expect(published.ok()).toBe(true);

  await page.goto("/research/platform-scorecard");
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("row", { name: /Example Chat/ })).toBeVisible();
  await expect(page.getByText("58%").first()).toBeVisible();
  const csvLink = page.getByRole("link", { name: "Download the data (CSV)" });
  await expect(csvLink).toBeVisible();

  const csv = await request.get("/research/platform-scorecard.csv");
  expect(csv.ok()).toBe(true);
  expect(await csv.text()).toContain("Example Chat,15,3,12,58.3,10,6,25.0,2");
});

test("a platform under the threshold shows 'Not enough notices to report'", async ({ page }) => {
  await page.goto("/research/platform-scorecard");
  const tinyRow = page.getByRole("row", { name: /Tiny Forum/ });
  await expect(tinyRow).toBeVisible();
  await expect(tinyRow).toContainText("Not enough notices to report");
  await expect(tinyRow).not.toContainText("58%");
});
