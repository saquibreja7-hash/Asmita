"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";
import type { CrawlSourceView } from "@/lib/crawl-sources";
import {
  checkBudget,
  checkDelay,
  checkDomain,
  DELAY_MAX_MS,
  DELAY_MIN_MS,
  PAGE_BUDGET_MAX,
  SOURCE_ERRORS,
} from "./source-validation";

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

export function SourcesManager({ sources }: { sources: CrawlSourceView[] }) {
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

      <div className="overflow-hidden a-card">
        <table className="a-table w-full min-w-[720px] text-left text-sm">
          <caption className="sr-only">Sites the crawler may visit</caption>
          <thead>
            <tr>
              <th className="eyebrow" scope="col">Site</th>
              <th className="eyebrow" scope="col">Page budget</th>
              <th className="eyebrow" scope="col">Delay</th>
              <th className="eyebrow" scope="col">Approved by</th>
              <th className="eyebrow" scope="col">Added</th>
              <th className="eyebrow" scope="col">Crawling</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => (
              <tr key={source.id}>
                <td className="font-mono">{source.domain}</td>
                <td className="tabular-nums">{source.pageBudget}</td>
                <td className="tabular-nums">{source.delayMs} ms</td>
                <td className="font-mono">{source.approvedBy ?? "-"}</td>
                <td className="a-nowrap tabular-nums">{source.createdAt.slice(0, 16).replace("T", " ")}</td>
                <td>
                  <button
                    aria-label={`${source.enabled ? "Switch off" : "Switch on"} crawling of ${source.domain}`}
                    aria-pressed={source.enabled}
                    className={`btn px-3 py-1 text-xs ${source.enabled ? "btn-primary" : "btn-secondary"}`}
                    disabled={busy}
                    onClick={() => toggle(source)}
                    type="button"
                  >
                    {source.enabled ? "On" : "Off"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sources.length === 0 && <p className="muted p-6 text-center text-sm">No sites yet.</p>}
      </div>

      <form className="a-card grid max-w-xl gap-4 p-4" noValidate onSubmit={add}>
        <h2>Add a site</h2>
        <Field
          error={touched && !domainCheck.ok ? domainCheck.message : null}
          hint="The website name only, for example example-news.org."
          id="source-domain"
          label="Site"
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
          <button className="btn btn-primary" disabled={busy || (touched && !valid)} type="submit">
            {busy ? "Adding…" : "Add site (switched off)"}
          </button>
        </div>
      </form>

      <dialog
        aria-labelledby="enable-source-title"
        className="m-auto w-[min(32rem,calc(100vw-2rem))] a-card p-6 text-[var(--ink)]"
        onClose={() => setDialogError(null)}
        ref={dialogRef}
      >
        <h2 id="enable-source-title">Switch on {pending?.domain}?</h2>
        <p className="mt-3 text-sm">
          The crawler will start visiting this public site, up to {pending?.pageBudget} pages a run with {pending?.delayMs} ms
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

function Field({
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
