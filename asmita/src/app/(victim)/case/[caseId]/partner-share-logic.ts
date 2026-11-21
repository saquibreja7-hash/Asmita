/*
 * The decisions behind the partner-sharing tick box (WP31), kept apart from
 * the component so they can be unit tested without a browser.
 */

export type Draft = { subject: string; body: string; templateRef: string };
export type ShareState = { status: "none" | "agreed" | "withdrawn"; available: boolean; draft: Draft | null };

/**
 * "hidden" when there is nothing the tick could cover or withdraw from:
 * not loaded yet, or sharing is off and unavailable, has no agreement text
 * or the case has no eligible fingerprint. Once she has agreed the section
 * always shows, so withdrawal stays reachable even if every fingerprint
 * was later rejected.
 */
export function shareView(share: ShareState | null, eligibleCount: number): "hidden" | "on" | "off" {
  if (!share) return "hidden";
  if (share.status === "agreed") return "on";
  if (!share.available || !share.draft || eligibleCount === 0) return "hidden";
  return "off";
}

export function parseShare(data: { status?: ShareState["status"]; available?: boolean; draft?: Draft | null }): ShareState {
  return { status: data.status ?? "none", available: Boolean(data.available), draft: data.draft ?? null };
}

export type AgreeOutcome = "changed" | "alreadyAgreed" | "unavailable" | "generic";

export function agreeOutcome(error: string | undefined): AgreeOutcome {
  if (error === "notice_changed_since_preview") return "changed";
  if (error === "already_agreed") return "alreadyAgreed";
  if (error === "template_missing" || error === "no_hashes" || error === "not_found") return "unavailable";
  return "generic";
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Ticking the box is the whole agreement: one request, no name, contact or
 * signature. The templateRef names the agreement text and fingerprints the
 * page loaded, so what is recorded is what she could read.
 */
export async function requestAgree(
  fetcher: Fetcher,
  caseId: string,
  templateRef: string,
): Promise<{ ok: true } | { ok: false; outcome: AgreeOutcome }> {
  const res = await fetcher(`/api/cases/${caseId}/partner-share`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agreed: true, templateRef }),
  });
  if (res.ok) return { ok: true };
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return { ok: false, outcome: agreeOutcome(data.error) };
}

/** Stopping succeeds, or is already stopped ("not_agreed"). */
export async function requestStop(fetcher: Fetcher, caseId: string): Promise<boolean> {
  const res = await fetcher(`/api/cases/${caseId}/partner-share`, { method: "DELETE" });
  if (res.ok) return true;
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error === "not_agreed";
}
