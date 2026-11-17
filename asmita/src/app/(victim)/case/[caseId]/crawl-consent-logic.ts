/*
 * The decisions behind the crawl opt-in, kept apart from the component so
 * they can be unit tested without a browser.
 */

import type { DisplayUrl } from "@/lib/case-ops";

export type Draft = { subject: string; body: string; templateRef: string };
export type ConsentState = { status: "none" | "signed" | "withdrawn"; available: boolean; draft: Draft | null };

/** "hidden" when switching on is unavailable and it is not on (never show a broken control). */
export function consentView(consent: ConsentState | null): "hidden" | "on" | "off" {
  if (!consent) return "hidden";
  if (consent.status === "signed") return "on";
  return consent.available && consent.draft ? "off" : "hidden";
}

export function parseConsent(data: { status?: ConsentState["status"]; available?: boolean; draft?: Draft | null }): ConsentState {
  return { status: data.status ?? "none", available: Boolean(data.available), draft: data.draft ?? null };
}

export type SignOutcome = "changed" | "alreadySigned" | "unavailable" | "generic";

export function signOutcome(error: string | undefined): SignOutcome {
  if (error === "notice_changed_since_preview") return "changed";
  if (error === "already_signed") return "alreadySigned";
  if (error === "crawler_disabled" || error === "template_missing" || error === "no_hashes" || error === "not_found") return "unavailable";
  return "generic";
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Ticking the box switches the search on: one request, no name or signature.
 * The templateRef names the authorisation text and fingerprints the page
 * loaded, so what is recorded is what she could read.
 */
export async function requestConsent(
  fetcher: Fetcher,
  caseId: string,
  templateRef: string,
): Promise<{ ok: true } | { ok: false; outcome: SignOutcome }> {
  const res = await fetcher(`/api/cases/${caseId}/crawl-consent`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agreed: true, templateRef }),
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

type Sourced = Pick<DisplayUrl, "source">;

/** Whether a link was found by Asmita's search (DisplayUrl.source; absent means hers). */
export function isCrawlerFound(url: Sourced): boolean {
  return url.source === "CRAWLER";
}

export function splitUrls<T extends Sourced>(urls: T[]): { own: T[]; found: T[] } {
  return { own: urls.filter((u) => !isCrawlerFound(u)), found: urls.filter(isCrawlerFound) };
}

export type FoundLinkView =
  /** She withdrew her authorisation before a notice went out: none will. */
  | { kind: "withdrawn" }
  /** Asmita's representative notice went out on this date. */
  | { kind: "sent"; sentAt: string; status: string }
  /** Any other state, shown with the ordinary status wording. */
  | { kind: "status"; status: string };

/**
 * What a found link's badge says. A crawler link never has a survivor
 * notice or an escalation ladder: "sent" comes from
 * representativeNoticeSentAt, and no follow-up is promised.
 */
export function foundLinkView(url: Pick<DisplayUrl, "status" | "crawlConsentWithdrawn" | "representativeNoticeSentAt">): FoundLinkView {
  if (url.representativeNoticeSentAt) return { kind: "sent", sentAt: url.representativeNoticeSentAt, status: url.status };
  if (url.crawlConsentWithdrawn && url.status !== "REMOVED") return { kind: "withdrawn" };
  return { kind: "status", status: url.status };
}
