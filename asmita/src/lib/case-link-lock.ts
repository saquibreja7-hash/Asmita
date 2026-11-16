/**
 * Serialises writers that add a link (SubmittedUrl) to a case.
 *
 * There is no unique (caseId, urlHash): a case may hold several crawler links
 * for one address (one per authorisation, ADR 006). So the two paths that
 * check "is this address already on the case?" and then insert, a crawler
 * finding's final approval (crawl-findings.ts reviewCrawlFinding) and her own
 * report (case-ops.ts addUrlsToCase), each lock the Case row first inside
 * their transaction. Whichever locks first finishes its check and insert; the
 * other then sees that row, so one address never gets both a survivor link and
 * a live crawler link.
 *
 * Why FOR NO KEY UPDATE and not FOR UPDATE: it conflicts with itself (so the
 * two paths above serialise) and with the account-erasure path's FOR UPDATE,
 * but not with the FOR KEY SHARE that Postgres takes on Case for every insert
 * of a row referencing it (CrawlFinding ingest, SubmittedUrl).
 * FOR UPDATE would make those inserts (for example a finding ingest holding
 * its CrawlConsent FOR SHARE lock) wait on the approval for no reason, and
 * add lock edges between Case and CrawlConsent that could close a cycle.
 *
 * Lock order, so no cycle is introduced:
 *   approval:   Case (NO KEY UPDATE) -> CrawlConsent (FOR SHARE) -> CrawlFinding -> SubmittedUrl
 *   her report: Case (NO KEY UPDATE) -> SubmittedUrl
 *   withdrawal: CrawlConsent (update) -> SubmittedUrl -> CrawlFinding   (never locks Case)
 *   ingest:     CrawlConsent (FOR SHARE) -> CrawlFinding (KEY SHARE on Case only)
 *   erasure:    User (FOR UPDATE) -> Case (FOR UPDATE) -> children
 * Case is always taken first by the paths that take it, and the paths that do
 * not take it never wait on a Case lock, so no transaction waits for Case
 * while holding something an approval or report needs.
 *
 * The dispatch claim does not need this lock: it is a single conditional
 * UPDATE of one SubmittedUrl row (conditioned on the link still being a
 * crawler link with no claim), and her conversion of that link is a
 * conditional UPDATE of the same row, so Postgres's row lock already orders
 * them and the loser sees the winner's change (crawl-notice.ts).
 *
 * Memory store: single-threaded, no lock needed.
 * Not yet verified against a real Postgres (runbook go-live checklist).
 */
export type RawQueryClient = {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): PromiseLike<T>;
};

/** Locks the case row for this transaction; false if the case does not exist. */
export async function lockCaseForLinkWrite(tx: RawQueryClient, caseId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Case" WHERE "id" = ${caseId} FOR NO KEY UPDATE`;
  return rows.length > 0;
}
