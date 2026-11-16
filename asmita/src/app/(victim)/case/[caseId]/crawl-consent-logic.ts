/*
 * The decisions behind the crawl opt-in, kept apart from the component so
 * they can be unit tested without a browser.
 */

export type Draft = { subject: string; body: string; templateRef: string };
export type ConsentState = { status: "none" | "signed" | "withdrawn"; available: boolean; draft: Draft | null };

/** "hidden" when signing is unavailable and she has not signed (never show a broken control). */
export function consentView(consent: ConsentState | null): "hidden" | "on" | "off" {
  if (!consent) return "hidden";
  if (consent.status === "signed") return "on";
  return consent.available && consent.draft ? "off" : "hidden";
}

export function parseConsent(data: { status?: ConsentState["status"]; available?: boolean; draft?: Draft | null }): ConsentState {
  return { status: data.status ?? "none", available: Boolean(data.available), draft: data.draft ?? null };
}

export type SignOutcome = "changed" | "alreadySigned" | "nameScript" | "unavailable" | "generic";

export function signOutcome(error: string | undefined): SignOutcome {
  if (error === "notice_changed_since_preview") return "changed";
  if (error === "already_signed") return "alreadySigned";
  if (error === "name_script_unsupported") return "nameScript";
  if (error === "crawler_disabled" || error === "template_missing" || error === "no_hashes" || error === "not_found") return "unavailable";
  return "generic";
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export async function requestSign(
  fetcher: Fetcher,
  caseId: string,
  body: { templateRef: string; name: string; contact: string; signature: string },
): Promise<{ ok: true } | { ok: false; outcome: SignOutcome }> {
  const res = await fetcher(`/api/cases/${caseId}/crawl-consent`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) return { ok: true };
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return { ok: false, outcome: signOutcome(data.error) };
}

/** Stopping succeeds, or is already stopped ("not_signed"). */
export async function requestStop(fetcher: Fetcher, caseId: string): Promise<boolean> {
  const res = await fetcher(`/api/cases/${caseId}/crawl-consent`, { method: "DELETE" });
  if (res.ok) return true;
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error === "not_signed";
}

/**
 * Whether a link was found by Asmita's search. The case API's DisplayUrl may
 * not carry `source` yet; the cast lives only here and goes when the typed
 * field lands.
 */
export function isCrawlerFound(url: object): boolean {
  return (url as { source?: string }).source === "CRAWLER";
}

export function splitUrls<T extends object>(urls: T[]): { own: T[]; found: T[] } {
  return { own: urls.filter((u) => !isCrawlerFound(u)), found: urls.filter(isCrawlerFound) };
}
