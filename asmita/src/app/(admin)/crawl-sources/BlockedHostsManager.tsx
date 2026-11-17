"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";
import type { CrawlBlockedHostView } from "@/lib/crawl-blocked-hosts";
import { checkDomain } from "./source-validation";
import { Field } from "./SourcesManager";

// The "Never crawl" tab of the crawler sites page (full-crawler spec WP2):
// the admin-managed CrawlBlockedHost table. Hosts are shown as plain text,
// never as links. Every change is audited server-side.

const BLOCKED_ERRORS: Record<string, string> = {
  invalid_domain: "That is not a valid public host name.",
  private_domain: "That looks like a private or reserved name. Only public host names can be blocked.",
  blocked_host_exists: "That host is already on the never-crawl list.",
  blocked_host_not_found: "That entry no longer exists. Reload the page.",
  invalid_payload: "The server did not accept those values. Check them and try again.",
  csrf_failed: "The page session expired. Reload and try again.",
  permission_denied: "Only a SUPER_ADMIN can manage the never-crawl list.",
  crawler_disabled: "The crawler is switched off (ENABLE_CRAWLER), so the never-crawl list cannot be changed. Nothing was saved.",
};

export function BlockedHostsManager({ blockedHosts, crawlerEnabled = true }: { blockedHosts: CrawlBlockedHostView[]; crawlerEnabled?: boolean }) {
  const router = useRouter();
  const [host, setHost] = useState("");
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hostCheck = checkDomain(host);
  const reasonMissing = reason.trim() === "";

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    setError(null);
    setNotice(null);
    if (!hostCheck.ok) return setError(hostCheck.message);
    if (reasonMissing) return setError("Give a reason: why must this host never be crawled?");
    setBusy(true);
    try {
      const response = await csrfFetch("/api/admin/crawl-blocked-hosts", {
        method: "POST",
        body: JSON.stringify({ host: hostCheck.domain, reason: reason.trim() }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(BLOCKED_ERRORS[data?.error ?? ""] ?? `Not saved (${data?.error ?? `status ${response.status}`}).`);
        return;
      }
      setNotice(`${hostCheck.domain} added: it will never be crawled automatically.`);
      setHost("");
      setReason("");
      setTouched(false);
      router.refresh();
    } catch {
      setError("Not saved: the request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(entry: CrawlBlockedHostView) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const response = await csrfFetch("/api/admin/crawl-blocked-hosts", { method: "DELETE", body: JSON.stringify({ id: entry.id }) });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(BLOCKED_ERRORS[data?.error ?? ""] ?? `Not removed (${data?.error ?? `status ${response.status}`}).`);
        return;
      }
      setNotice(`${entry.host} removed from the never-crawl list.`);
      router.refresh();
    } catch {
      setError("Not removed: the request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div aria-live="polite">
        {notice && (
          <p className="text-sm text-[var(--brand)]" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="text-sm text-[var(--danger)]" role="alert">
            {error}
          </p>
        )}
      </div>

      <p className="muted max-w-2xl text-sm">
        Hosts here are never added as crawl sites automatically — not from a survivor&apos;s reported link, not from an approved
        finding, not from a link the crawler discovers. The built-in never-crawl list (social platforms, search engines, app
        stores, webmail, banks and payment sites, government, news wires, Asmita&apos;s own domains) always applies as well; this
        table adds to it. A host here blocks its subdomains too, and a SUPER_ADMIN can still add any host by hand. Every change
        is recorded.
      </p>

      <div className="overflow-hidden a-card">
        <table className="a-table w-full min-w-[720px] text-left text-sm">
          <caption className="sr-only">Hosts that must never be crawled</caption>
          <thead>
            <tr>
              <th className="eyebrow" scope="col">Host</th>
              <th className="eyebrow" scope="col">Reason</th>
              <th className="eyebrow" scope="col">Added by</th>
              <th className="eyebrow" scope="col">Added</th>
              <th className="eyebrow" scope="col"> </th>
            </tr>
          </thead>
          <tbody>
            {blockedHosts.map((entry) => (
              <tr key={entry.id}>
                <td className="font-mono">{entry.host}</td>
                <td>{entry.reason}</td>
                <td className="font-mono">{entry.addedBy}</td>
                <td className="a-nowrap tabular-nums">{entry.createdAt.slice(0, 16).replace("T", " ")}</td>
                <td className="a-nowrap">
                  <button
                    aria-label={`Remove ${entry.host} from the never-crawl list`}
                    className="btn btn-secondary px-3 py-1 text-xs"
                    disabled={busy || !crawlerEnabled}
                    onClick={() => remove(entry)}
                    type="button"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {blockedHosts.length === 0 && <p className="muted p-6 text-center text-sm">No hosts blocked beyond the built-in list.</p>}
      </div>

      <form className="a-card grid max-w-xl gap-4 p-4" noValidate onSubmit={add}>
        <h2>Never crawl a host</h2>
        <Field
          error={touched && !hostCheck.ok ? hostCheck.message : null}
          hint="The host name only, for example forum.example.org. A leading www. is dropped; subdomains are blocked too."
          id="blocked-host"
          label="Host"
        >
          <input
            aria-describedby="blocked-host-hint"
            autoComplete="off"
            className="field"
            id="blocked-host"
            maxLength={253}
            onChange={(event) => setHost(event.target.value)}
            value={host}
          />
        </Field>
        <Field
          error={touched && reasonMissing ? "Give a reason: why must this host never be crawled?" : null}
          hint="Recorded with the change, so the next admin knows why."
          id="blocked-reason"
          label="Reason"
        >
          <input
            aria-describedby="blocked-reason-hint"
            className="field"
            id="blocked-reason"
            maxLength={200}
            onChange={(event) => setReason(event.target.value)}
            value={reason}
          />
        </Field>
        <div>
          <button className="btn btn-primary" disabled={busy || !crawlerEnabled || (touched && (!hostCheck.ok || reasonMissing))} type="submit">
            {busy ? "Saving…" : "Never crawl this host"}
          </button>
        </div>
      </form>
    </div>
  );
}
