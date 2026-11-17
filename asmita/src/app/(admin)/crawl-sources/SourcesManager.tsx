"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";
import type { CrawlSourceView, ImportHostResult } from "@/lib/crawl-sources";
import {
  checkBudget,
  checkDelay,
  checkDomain,
  DELAY_MAX_MS,
  DELAY_MIN_MS,
  PAGE_BUDGET_MAX,
  SOURCE_ERRORS,
} from "./source-validation";

const IMPORT_MAX_HOSTS = 1000;

/** One sentence per import result status (WP2). */
export const IMPORT_STATUS_LABELS: Record<ImportHostResult["status"], string> = {
  created: "Added",
  exists: "Already listed",
  blocked: "Never crawl",
  invalid: "Invalid",
};

async function send(method: "POST" | "PATCH", body: unknown): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const response = await csrfFetch("/api/admin/crawl-sources", { method, body: JSON.stringify(body) });
    if (response.ok) return { ok: true };
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, message: SOURCE_ERRORS[data?.error ?? ""] ?? `Not saved (${data?.error ?? `status ${response.status}`}).` };
  } catch {
    return { ok: false, message: "Not saved: the request failed." };
  }
}

export function originLabel(origin: CrawlSourceView["origin"]): string {
  if (origin === "REPORTED") return "Reported";
  if (origin === "DISCOVERED") return "Discovered";
  return "Admin";
}

/** Why a discovered site is paused or stored disabled (WP5), for the admin page. */
export function discoveryStateLabel(source: Pick<CrawlSourceView, "enabled" | "pausedUntil" | "pauseReason" | "disabledReason">): string | null {
  if (source.pausedUntil && source.pauseReason) {
    const until = source.pausedUntil.slice(0, 10);
    return `Paused until ${until} — no match with its budget spent 3 days running`;
  }
  if (!source.enabled && source.disabledReason === "max_hops") return "Off — beyond the discovery-hop limit";
  if (!source.enabled && source.disabledReason === "daily_cap") return "Off — the daily new-site cap was reached";
  return null;
}

export function SourcesManager({ sources, crawlerEnabled = true }: { sources: CrawlSourceView[]; crawlerEnabled?: boolean }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState<CrawlSourceView | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [domain, setDomain] = useState("");
  const [budget, setBudget] = useState("200");
  const [delay, setDelay] = useState("2000");
  const [touched, setTouched] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Editing one host's page budget and delay (PATCH).
  const [editing, setEditing] = useState<string | null>(null);
  const [editBudget, setEditBudget] = useState("");
  const [editDelay, setEditDelay] = useState("");
  const editBudgetCheck = checkBudget(editBudget);
  const editDelayCheck = checkDelay(editDelay);

  // Origin filter (WP2): all sources, or one origin.
  const [originFilter, setOriginFilter] = useState<"ALL" | CrawlSourceView["origin"]>("ALL");
  const visibleSources = originFilter === "ALL" ? sources : sources.filter((source) => source.origin === originFilter);

  // Bulk import (WP2): paste a list, get one result per entry.
  const [importText, setImportText] = useState("");
  const [importBudget, setImportBudget] = useState("");
  const [importDelay, setImportDelay] = useState("");
  const [importEnabled, setImportEnabled] = useState(false);
  const [importTouched, setImportTouched] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResults, setImportResults] = useState<ImportHostResult[] | null>(null);
  const importBudgetCheck = importBudget.trim() === "" ? null : checkBudget(importBudget);
  const importDelayCheck = importDelay.trim() === "" ? null : checkDelay(importDelay);

  function startEdit(source: CrawlSourceView) {
    setEditing(source.id);
    setEditBudget(String(source.pageBudget));
    setEditDelay(String(source.delayMs));
    setRowError(null);
    setNotice(null);
  }

  async function saveEdit(source: CrawlSourceView) {
    if (!editBudgetCheck.ok || !editDelayCheck.ok) return;
    setBusy(true);
    const result = await send("PATCH", { id: source.id, pageBudget: editBudgetCheck.value, delayMs: editDelayCheck.value });
    setBusy(false);
    if (!result.ok) return setRowError(result.message);
    setEditing(null);
    setNotice(`${source.domain}: page budget ${editBudgetCheck.value}, delay ${editDelayCheck.value} ms.`);
    router.refresh();
  }

  const domainCheck = checkDomain(domain);
  const budgetCheck = checkBudget(budget);
  const delayCheck = checkDelay(delay);
  const valid = domainCheck.ok && budgetCheck.ok && delayCheck.ok;

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    setAddError(null);
    setNotice(null);
    if (!domainCheck.ok || !budgetCheck.ok || !delayCheck.ok) return;
    setBusy(true);
    const result = await send("POST", { domain: domainCheck.domain, pageBudget: budgetCheck.value, delayMs: delayCheck.value });
    setBusy(false);
    if (!result.ok) {
      setAddError(result.message);
      return;
    }
    setNotice(`${domainCheck.domain} added. It starts switched off: enable it below when you are ready.`);
    setDomain("");
    setTouched(false);
    router.refresh();
  }

  async function toggle(source: CrawlSourceView) {
    setRowError(null);
    setNotice(null);
    if (!source.enabled) {
      setPending(source);
      setDialogError(null);
      dialogRef.current?.showModal();
      return;
    }
    setBusy(true);
    const result = await send("PATCH", { id: source.id, enabled: false });
    setBusy(false);
    if (!result.ok) return setRowError(result.message);
    setNotice(`${source.domain} switched off.`);
    router.refresh();
  }

  async function confirmEnable() {
    if (!pending) return;
    setBusy(true);
    const result = await send("PATCH", { id: pending.id, enabled: true });
    setBusy(false);
    if (!result.ok) return setDialogError(result.message);
    dialogRef.current?.close();
    setNotice(`${pending.domain} switched on. The crawler may now visit it.`);
    setPending(null);
    router.refresh();
  }

  async function importHosts(event: React.FormEvent) {
    event.preventDefault();
    setImportTouched(true);
    setImportError(null);
    setNotice(null);
    const hosts = importText.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
    if (hosts.length === 0) return setImportError("Paste at least one entry: a host name or a full URL, one per line.");
    if (hosts.length > IMPORT_MAX_HOSTS) return setImportError(`At most ${IMPORT_MAX_HOSTS} entries at a time; split the list.`);
    if (importBudgetCheck && !importBudgetCheck.ok) return setImportError(importBudgetCheck.message);
    if (importDelayCheck && !importDelayCheck.ok) return setImportError(importDelayCheck.message);

    const body: Record<string, unknown> = { hosts };
    if (importBudgetCheck?.ok) body.pageBudget = importBudgetCheck.value;
    if (importDelayCheck?.ok) body.delayMs = importDelayCheck.value;
    if (importEnabled) body.enabled = true;

    setBusy(true);
    try {
      const response = await csrfFetch("/api/admin/crawl-sources/import", { method: "POST", body: JSON.stringify(body) });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setImportError(SOURCE_ERRORS[data?.error ?? ""] ?? `Not imported (${data?.error ?? `status ${response.status}`}).`);
        return;
      }
      const data = (await response.json()) as { results: ImportHostResult[] };
      setImportResults(data.results);
      const counts: Record<string, number> = {};
      for (const result of data.results) counts[result.status] = (counts[result.status] ?? 0) + 1;
      setNotice(
        `Import finished: ${counts.created ?? 0} added, ${counts.exists ?? 0} already listed, ` +
        `${counts.blocked ?? 0} never crawl, ${counts.invalid ?? 0} invalid.`,
      );
      setImportText("");
      router.refresh();
    } catch {
      setImportError("Not imported: the request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-8">
      <div aria-live="polite">
        {notice && (
          <p className="text-sm text-[var(--brand)]" role="status">
            {notice}
          </p>
        )}
        {rowError && (
          <p className="text-sm text-[var(--danger)]" role="alert">
            {rowError}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1 text-sm">
          <label htmlFor="origin-filter">Origin</label>
          <select
            aria-label="Filter sites by origin"
            className="field"
            id="origin-filter"
            onChange={(event) => setOriginFilter(event.target.value as "ALL" | CrawlSourceView["origin"])}
            value={originFilter}
          >
            <option value="ALL">All origins</option>
            <option value="ADMIN">Admin</option>
            <option value="REPORTED">Reported</option>
            <option value="DISCOVERED">Discovered</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden a-card">
        <table className="a-table w-full min-w-[1100px] text-left text-sm">
          <caption className="sr-only">Sites the crawler may visit</caption>
          <thead>
            <tr>
              <th className="eyebrow" scope="col">Host</th>
              <th className="eyebrow" scope="col">Origin</th>
              <th className="eyebrow" scope="col">Hops</th>
              <th className="eyebrow" scope="col">Found via</th>
              <th className="eyebrow" scope="col">State</th>
              <th className="eyebrow" scope="col">Pages crawled</th>
              <th className="eyebrow" scope="col">Last crawled</th>
              <th className="eyebrow" scope="col">Page budget</th>
              <th className="eyebrow" scope="col">Delay</th>
              <th className="eyebrow" scope="col">Approved by</th>
              <th className="eyebrow" scope="col">Added</th>
              <th className="eyebrow" scope="col">Crawling</th>
              <th className="eyebrow" scope="col">Limits</th>
            </tr>
          </thead>
          <tbody>
            {visibleSources.map((source) => (
              <tr key={source.id}>
                <td className="font-mono">{source.domain}</td>
                <td>{originLabel(source.origin)}</td>
                <td className="tabular-nums">{source.hops}</td>
                <td className="font-mono">
                  {source.origin === "DISCOVERED"
                    ? source.discoveredFromDomain ?? "a source that is gone"
                    : "—"}
                </td>
                <td className="a-nowrap">{discoveryStateLabel(source) ?? "—"}</td>
                <td className="tabular-nums">{source.pagesCrawled}</td>
                <td className="a-nowrap tabular-nums">
                  {source.lastCrawledAt ? source.lastCrawledAt.slice(0, 16).replace("T", " ") : "Never"}
                </td>
                <td className="tabular-nums">
                  {editing === source.id ? (
                    <input
                      aria-label={`Page budget for ${source.domain}`}
                      className="field w-24"
                      inputMode="numeric"
                      onChange={(event) => setEditBudget(event.target.value)}
                      value={editBudget}
                    />
                  ) : (
                    source.pageBudget
                  )}
                </td>
                <td className="tabular-nums">
                  {editing === source.id ? (
                    <input
                      aria-label={`Delay in milliseconds for ${source.domain}`}
                      className="field w-24"
                      inputMode="numeric"
                      onChange={(event) => setEditDelay(event.target.value)}
                      value={editDelay}
                    />
                  ) : (
                    `${source.delayMs} ms`
                  )}
                </td>
                <td className="font-mono">{source.approvedBy ?? "-"}</td>
                <td className="a-nowrap tabular-nums">{source.createdAt.slice(0, 16).replace("T", " ")}</td>
                <td>
                  <button
                    aria-label={`${source.enabled ? "Switch off" : "Switch on"} crawling of ${source.domain}`}
                    aria-pressed={source.enabled}
                    className={`btn px-3 py-1 text-xs ${source.enabled ? "btn-primary" : "btn-secondary"}`}
                    disabled={busy || !crawlerEnabled}
                    onClick={() => toggle(source)}
                    type="button"
                  >
                    {source.enabled ? "On" : "Off"}
                  </button>
                </td>
                <td className="a-nowrap">
                  {editing === source.id ? (
                    <span className="flex flex-wrap gap-2">
                      <button
                        className="btn btn-primary px-3 py-1 text-xs"
                        disabled={busy || !editBudgetCheck.ok || !editDelayCheck.ok}
                        onClick={() => saveEdit(source)}
                        type="button"
                      >
                        Save
                      </button>
                      <button className="btn btn-secondary px-3 py-1 text-xs" onClick={() => setEditing(null)} type="button">
                        Cancel
                      </button>
                      {(!editBudgetCheck.ok || !editDelayCheck.ok) && (
                        <span className="text-xs text-[var(--danger)]" role="alert">
                          {!editBudgetCheck.ok ? editBudgetCheck.message : !editDelayCheck.ok ? editDelayCheck.message : ""}
                        </span>
                      )}
                    </span>
                  ) : (
                    <button
                      aria-label={`Edit page budget and delay for ${source.domain}`}
                      className="btn btn-secondary px-3 py-1 text-xs"
                      disabled={busy || !crawlerEnabled}
                      onClick={() => startEdit(source)}
                      type="button"
                    >
                      Edit
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibleSources.length === 0 && (
          <p className="muted p-6 text-center text-sm">No sites{originFilter === "ALL" ? " yet" : " for this origin"}.</p>
        )}
      </div>

      <form className="a-card grid max-w-xl gap-4 p-4" noValidate onSubmit={add}>
        <h2>Add a host</h2>
        <Field
          error={touched && !domainCheck.ok ? domainCheck.message : null}
          hint="The host name only, for example news.example-site.org. Pages on this host and its subdomains may be crawled. A leading www. is dropped, so www.example.org covers example.org and all its subdomains."
          id="source-domain"
          label="Host"
        >
          <input
            aria-describedby="source-domain-hint"
            autoComplete="off"
            className="field"
            id="source-domain"
            maxLength={253}
            onChange={(event) => setDomain(event.target.value)}
            value={domain}
          />
        </Field>
        <Field
          error={touched && !budgetCheck.ok ? budgetCheck.message : null}
          hint={`Most pages one run may fetch, up to ${PAGE_BUDGET_MAX}.`}
          id="source-budget"
          label="Page budget"
        >
          <input
            aria-describedby="source-budget-hint"
            className="field"
            id="source-budget"
            inputMode="numeric"
            onChange={(event) => setBudget(event.target.value)}
            value={budget}
          />
        </Field>
        <Field
          error={touched && !delayCheck.ok ? delayCheck.message : null}
          hint={`Wait between pages, in milliseconds (${DELAY_MIN_MS} to ${DELAY_MAX_MS}).`}
          id="source-delay"
          label="Delay"
        >
          <input
            aria-describedby="source-delay-hint"
            className="field"
            id="source-delay"
            inputMode="numeric"
            onChange={(event) => setDelay(event.target.value)}
            value={delay}
          />
        </Field>
        {addError && (
          <p className="text-sm text-[var(--danger)]" role="alert">
            {addError}
          </p>
        )}
        <div>
          <button className="btn btn-primary" disabled={busy || !crawlerEnabled || (touched && !valid)} type="submit">
            {busy ? "Adding…" : "Add host (switched off)"}
          </button>
        </div>
      </form>

      <form className="a-card grid max-w-xl gap-4 p-4" noValidate onSubmit={importHosts}>
        <h2>Import a list of hosts</h2>
        <Field
          error={importTouched && importText.trim() === "" ? "Paste at least one entry: a host name or a full URL, one per line." : null}
          hint={`One entry per line: a host name or a full URL (the host is taken from it). Up to ${IMPORT_MAX_HOSTS} entries. Each entry gets its own result, so repeats, never-crawl hosts and invalid lines are reported, never rejected.`}
          id="import-hosts"
          label="Hosts to import"
        >
          <textarea
            aria-describedby="import-hosts-hint"
            aria-label="Hosts to import"
            className="field font-mono"
            id="import-hosts"
            onChange={(event) => setImportText(event.target.value)}
            rows={8}
            value={importText}
          />
        </Field>
        <Field
          error={importTouched && importBudgetCheck && !importBudgetCheck.ok ? importBudgetCheck.message : null}
          hint={`Most pages one run may fetch per imported site. Leave blank for the server default.`}
          id="import-budget"
          label="Page budget for imported sites"
        >
          <input
            aria-describedby="import-budget-hint"
            className="field"
            id="import-budget"
            inputMode="numeric"
            onChange={(event) => setImportBudget(event.target.value)}
            value={importBudget}
          />
        </Field>
        <Field
          error={importTouched && importDelayCheck && !importDelayCheck.ok ? importDelayCheck.message : null}
          hint={`Wait between pages, in milliseconds (${DELAY_MIN_MS} to ${DELAY_MAX_MS}). Leave blank for the server default.`}
          id="import-delay"
          label="Delay for imported sites"
        >
          <input
            aria-describedby="import-delay-hint"
            className="field"
            id="import-delay"
            inputMode="numeric"
            onChange={(event) => setImportDelay(event.target.value)}
            value={importDelay}
          />
        </Field>
        <div className="grid gap-1 text-sm">
          <label className="flex items-start gap-2">
            <input
              checked={importEnabled}
              className="mt-1"
              onChange={(event) => setImportEnabled(event.target.checked)}
              type="checkbox"
            />
            <span>
              Switch the imported sites on immediately
              <span className="muted block text-xs">
                Like switching a single host on: only tick this for sites you have decided are appropriate to crawl.
              </span>
            </span>
          </label>
        </div>
        {importError && (
          <p className="text-sm text-[var(--danger)]" role="alert">
            {importError}
          </p>
        )}
        <div>
          <button
            className="btn btn-primary"
            disabled={
              busy ||
              !crawlerEnabled ||
              (importTouched && (importText.trim() === "" || importBudgetCheck?.ok === false || importDelayCheck?.ok === false))
            }
            type="submit"
          >
            {busy ? "Importing…" : "Import hosts"}
          </button>
        </div>
      </form>

      {importResults && <ImportResults results={importResults} />}

      <dialog
        aria-labelledby="enable-source-title"
        className="m-auto w-[min(32rem,calc(100vw-2rem))] a-card p-6 text-[var(--ink)]"
        onClose={() => setDialogError(null)}
        ref={dialogRef}
      >
        <h2 id="enable-source-title">Switch on {pending?.domain}?</h2>
        <p className="mt-3 text-sm">
          The crawler will start visiting pages on this public host and its subdomains, up to {pending?.pageBudget} pages a run with {pending?.delayMs} ms
          between pages, and comparing images with survivors&apos; fingerprints. Only enable a site you have decided is
          appropriate to crawl. This is recorded.
        </p>
        {dialogError && (
          <p className="mt-4 text-sm text-[var(--danger)]" role="alert">
            {dialogError}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button autoFocus className="btn btn-secondary" onClick={() => dialogRef.current?.close()} type="button">
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={confirmEnable} type="button">
            {busy ? "Saving…" : "Switch on"}
          </button>
        </div>
      </dialog>
    </div>
  );
}

/**
 * The import results table (WP2): one row per pasted entry. Addresses are
 * plain text — never links, never loaded.
 */
export function ImportResults({ results }: { results: ImportHostResult[] }) {
  return (
    <div className="a-card overflow-hidden">
      <table className="a-table w-full min-w-[560px] text-left text-sm">
        <caption className="sr-only">Import results, one row per entry</caption>
        <thead>
          <tr>
            <th className="eyebrow" scope="col">Entered</th>
            <th className="eyebrow" scope="col">Host</th>
            <th className="eyebrow" scope="col">Result</th>
          </tr>
        </thead>
        <tbody>
          {results.map((result, index) => (
            <tr key={index}>
              <td className="break-all font-mono">{result.input}</td>
              <td className="break-all font-mono">{result.host ?? "—"}</td>
              <td>
                {IMPORT_STATUS_LABELS[result.status]}
                {result.status === "invalid" && result.reason
                  ? ` (${result.reason === "private_domain" ? "private or reserved name" : "not a public host name"})`
                  : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  error: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 text-sm">
      <label htmlFor={id}>{label}</label>
      {children}
      <p className="muted text-xs" id={`${id}-hint`}>
        {hint}
      </p>
      {error && (
        <p className="text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
