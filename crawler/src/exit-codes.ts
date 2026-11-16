/**
 * Process exit codes. A run exits 0 only when nothing needs an operator's
 * attention. A source failing (site down, robots.txt unreachable, timeouts)
 * is not a run failure: it is counted in the summary only.
 *
 * When several problems happen in one run, the first matching row wins
 * (the order below is the precedence).
 */
export const EXIT = {
  /** Clean run, or the crawler is switched off on the server (503). */
  OK: 0,
  /** Invalid configuration or an unexpected failure. */
  FAILURE: 1,
  /** The Asmita API rejected the service key (401/403), at load or mid-run. */
  UNAUTHORIZED: 2,
  /**
   * A contract bug: the server refused a request as malformed (400), or
   * rejected a finding as `page_not_in_source` (a crawler scope bug).
   */
  CONTRACT_ERROR: 4,
  /** Findings could not be delivered before exit. */
  FINDINGS_UNDELIVERED: 3,
  /** The pool could not be re-synced within 60 minutes; the run stopped early. */
  POOL_STALE: 5,
  /** Bad command line. */
  USAGE: 64,
} as const;

export type RunProblems = {
  unauthorized: boolean;
  /** Findings dropped because the server called the request malformed. */
  contractErrors: number;
  /** Findings rejected as page_not_in_source. */
  scopeErrors: number;
  findingsUnsent: number;
  poolStale: boolean;
  /** The server switched the crawler off (503). */
  disabled: boolean;
};

export function exitCodeFor(p: RunProblems): number {
  if (p.unauthorized) return EXIT.UNAUTHORIZED;
  if (p.contractErrors > 0 || p.scopeErrors > 0) return EXIT.CONTRACT_ERROR;
  // Switched off on purpose: undelivered findings are expected, not a fault.
  if (p.findingsUnsent > 0 && !p.disabled) return EXIT.FINDINGS_UNDELIVERED;
  if (p.poolStale) return EXIT.POOL_STALE;
  return EXIT.OK;
}
