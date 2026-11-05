import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { withAdmin } from "./support/database";

test("the scheduled sweep removes old URL copies but keeps a recent URL and case history", async ({ request }) => {
  const userId = randomUUID();
  const caseId = randomUUID();
  const oldId = randomUUID();
  const recentId = randomUUID();
  await withAdmin(async (db) => {
    await db.query('INSERT INTO "User" (id, "emailHash", "emailEncrypted", "ageOver18") VALUES ($1, $2, $3, true)', [userId, userId, "synthetic"]);
    await db.query('INSERT INTO "Case" (id, "referenceNumber", "userId", "updatedAt") VALUES ($1, $2, $3, now())', [caseId, caseId, userId]);
    for (const [id, age] of [[oldId, 31], [recentId, 1]] as const) {
      await db.query('INSERT INTO "SubmittedUrl" (id, "caseId", "urlEncrypted", "urlHash", domain, "signedNoticePdf", "submittedAt") VALUES ($1, $2, $3, $4, $5, $6, now() - $7::int * interval \'1 day\')', [id, caseId, "encrypted-synthetic", "synthetic-digest", "example.invalid", "synthetic-pdf", age]);
      await db.query('INSERT INTO "UrlPortalToken" (id, "urlId", token, "accessCodeHash") VALUES ($1, $2, $3, $4)', [randomUUID(), id, randomUUID(), "synthetic"]);
    }
  });
  const response = await request.get("/api/cron/purge-expired-urls", { headers: { authorization: "Bearer e2e-test-only-cron-secret-32-chars-long" } });
  expect(response.status()).toBe(200);
  await withAdmin(async (db) => {
    const rows = await db.query('SELECT id, "urlEncrypted", "urlHash", "signedNoticePdf" FROM "SubmittedUrl" WHERE id = ANY($1)', [[oldId, recentId]]);
    expect(rows.rows.find((row) => row.id === oldId)).toMatchObject({ urlEncrypted: "", urlHash: "", signedNoticePdf: null });
    expect(rows.rows.find((row) => row.id === recentId)).toMatchObject({ urlEncrypted: "encrypted-synthetic", urlHash: "synthetic-digest", signedNoticePdf: "synthetic-pdf" });
    const tokens = await db.query('SELECT "urlId" FROM "UrlPortalToken" WHERE "urlId" = ANY($1)', [[oldId, recentId]]);
    expect(tokens.rows).toEqual([{ urlId: recentId }]);
    const cases = await db.query('SELECT id FROM "Case" WHERE id = $1', [caseId]);
    expect(cases.rowCount).toBe(1);
  });
});
