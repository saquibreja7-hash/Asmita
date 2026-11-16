/*
 * The decisions behind the crawl opt-in, kept apart from the component so
 * they can be unit tested without a browser.
 */

import type { DisplayUrl } from "@/lib/case-ops";

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

type Sourced = Pick<DisplayUrl, "source">;

/** Whether a link was found by Asmita's search (DisplayUrl.source; absent means hers). */
export function isCrawlerFound(url: Sourced): boolean {
  return url.source === "CRAWLER";
}

export function splitUrls<T extends Sourced>(urls: T[]): { own: T[]; found: T[] } {
  return { own: urls.filter((u) => !isCrawlerFound(u)), found: urls.filter(isCrawlerFound) };
}

/**
 * Whether the case page shows her the links Asmita found (by website name
 * only). CRAWLER_SHOW_FINDINGS_TO_SURVIVOR is a server-side switch, on unless
 * set to "false": showing them is the approved plan, and whether to is an
 * open owner decision (ADR 006).
 */
export function showFindingsToSurvivor(env: Record<string, string | undefined> = process.env) {
  return env.CRAWLER_SHOW_FINDINGS_TO_SURVIVOR !== "false";
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
