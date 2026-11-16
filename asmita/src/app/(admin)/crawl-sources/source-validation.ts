// Client-side checks that mirror src/lib/crawl-sources.ts, which cannot be
// imported into the browser (it reaches the database). The server stays the
// authority; tests compare this with the server's own validator so the two
// cannot drift silently.

export const PAGE_BUDGET_MAX = 10_000;
export const DELAY_MIN_MS = 500;
export const DELAY_MAX_MS = 60_000;

const PRIVATE_SUFFIXES = [
  "localhost", "local", "internal", "intranet", "lan", "home", "corp", "private", "test", "example", "invalid", "onion", "arpa",
];
const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

export function checkDomain(raw: string): { ok: true; domain: string } | { ok: false; message: string } {
  const domain = raw.trim().toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  const bad = { ok: false as const, message: "Enter a public website name such as example-news.org, with no http:// or path." };
  if (!domain || domain.length > 253 || /[^a-z0-9.-]/.test(domain)) return bad;
  const labels = domain.split(".");
  if (labels.length < 2 || !labels.every((label) => LABEL.test(label))) return bad;
  const tld = labels.at(-1)!;
  if (!/^[a-z]{2,63}$/.test(tld)) return bad;
  if (PRIVATE_SUFFIXES.includes(tld)) return { ok: false, message: "That looks like a private or reserved name. Only public sites can be crawled." };
  return { ok: true, domain };
}

export function checkBudget(value: string): { ok: true; value: number } | { ok: false; message: string } {
  const n = Number(value);
  if (!value.trim() || !Number.isInteger(n) || n < 1 || n > PAGE_BUDGET_MAX) {
    return { ok: false, message: `Page budget must be a whole number from 1 to ${PAGE_BUDGET_MAX}.` };
  }
  return { ok: true, value: n };
}

export function checkDelay(value: string): { ok: true; value: number } | { ok: false; message: string } {
  const n = Number(value);
  if (!value.trim() || !Number.isInteger(n) || n < DELAY_MIN_MS || n > DELAY_MAX_MS) {
    return { ok: false, message: `Delay must be a whole number of milliseconds from ${DELAY_MIN_MS} to ${DELAY_MAX_MS}.` };
  }
  return { ok: true, value: n };
}

export const SOURCE_ERRORS: Record<string, string> = {
  invalid_domain: "That is not a valid public website name.",
  private_domain: "That looks like a private or reserved name. Only public sites can be crawled.",
  source_exists: "That site is already in the list.",
  source_not_found: "That site no longer exists. Reload the page.",
  invalid_payload: "The server did not accept those values. Check them and try again.",
  csrf_failed: "The page session expired. Reload and try again.",
  permission_denied: "Only a SUPER_ADMIN can manage crawler sites.",
};
