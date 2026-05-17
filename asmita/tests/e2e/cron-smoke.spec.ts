/**
 * Production cron smoke test.
 *
 * This spec hits the deployed Vercel cron endpoints with the production
 * CRON_SECRET to verify they answer correctly. It is intentionally skipped
 * when ASMITA_PROD_URL or ASMITA_CRON_SECRET env vars are absent, so the
 * default CI run on PRs does NOT execute it (those run against the local
 * dev server via playwright.config.ts).
 *
 * To run manually after the env vars are set on Vercel:
 *
 *   $env:ASMITA_PROD_URL = "https://your-deployment.vercel.app"
 *   $env:ASMITA_CRON_SECRET = "<copy from Vercel env vars>"
 *   npx playwright test tests/e2e/cron-smoke.spec.ts --project chromium
 *
 * If your sweep results in real escalation firing (because real notices have
 * been sent and crossed a window), run this against a Preview deployment
 * pointing at a non-production database — not Production.
 */
import { expect, test } from "@playwright/test";

const PROD_URL = process.env.ASMITA_PROD_URL;
const CRON_SECRET = process.env.ASMITA_CRON_SECRET;

const runCondition = Boolean(PROD_URL && CRON_SECRET);

test.skip(!runCondition, "Set ASMITA_PROD_URL and ASMITA_CRON_SECRET to run production cron smoke tests");

test.describe("production cron endpoints", () => {
  test("sweep-due-jobs returns 401 without secret", async ({ request }) => {
    const res = await request.get(`${PROD_URL}/api/cron/sweep-due-jobs`);
    expect(res.status()).toBe(401);
  });

  test("sweep-due-jobs returns 200 with secret and a well-formed summary", async ({ request }) => {
    const res = await request.get(`${PROD_URL}/api/cron/sweep-due-jobs`, {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      startedAt: expect.any(String),
      finishedAt: expect.any(String),
      escalations: {
        swept: expect.any(Number),
        fired: expect.any(Array),
        skipped: expect.any(Array),
        errors: expect.any(Array),
      },
      deletions: {
        hardDeletedUserIds: expect.any(Array),
      },
    });
  });

  test("maintenance returns 401 without secret", async ({ request }) => {
    const res = await request.get(`${PROD_URL}/api/cron/maintenance`);
    expect(res.status()).toBe(401);
  });

  test("maintenance returns 200 with secret and a deliverability snapshot", async ({ request }) => {
    const res = await request.get(`${PROD_URL}/api/cron/maintenance`, {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      startedAt: expect.any(String),
      finishedAt: expect.any(String),
      reverification: { dueCount: expect.any(Number), items: expect.any(Array) },
      deliverability: {
        total: expect.any(Number),
        delivered: expect.any(Number),
        bounced: expect.any(Number),
        complained: expect.any(Number),
        bounceRate: expect.any(Number),
        complaintRate: expect.any(Number),
        healthy: expect.any(Boolean),
      },
    });
  });
});
