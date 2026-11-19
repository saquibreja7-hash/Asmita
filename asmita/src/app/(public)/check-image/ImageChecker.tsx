"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { t, type Locale } from "@/lib/i18n";
import { readImageProvenance, type ProvenanceResult } from "@/lib/ai-provenance";
import { readC2paCredentials, type C2paSummary } from "@/lib/c2pa-credentials";

type Status = "idle" | "checking" | "done" | "error";
type DeepStatus = "idle" | "checking" | "done" | "error";

type DeepCheck = {
  type: string;
  detected: boolean;
  validationState: string | null;
  model: string | null;
};
type DeepResult = { detected: boolean; checks: DeepCheck[] };

export function ImageChecker({
  locale,
  deepCheckEnabled,
  deepCheckConfigured,
}: {
  locale: Locale;
  deepCheckEnabled: boolean;
  deepCheckConfigured: boolean;
}) {
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<ProvenanceResult | null>(null);
  const [c2pa, setC2pa] = useState<C2paSummary | null>(null);
  const [c2paLoading, setC2paLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [deepConsent, setDeepConsent] = useState(false);
  const [deepStatus, setDeepStatus] = useState<DeepStatus>("idle");
  const [deepResult, setDeepResult] = useState<DeepResult | null>(null);
  const [deepUnavailable, setDeepUnavailable] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const deepCheckOff = deepUnavailable || !deepCheckConfigured;

  async function handleFile(next: File) {
    setFileName(next.name);
    setFile(next);
    setStatus("checking");
    setResult(null);
    setC2pa(null);
    setC2paLoading(true);
    setDeepConsent(false);
    setDeepStatus("idle");
    setDeepResult(null);
    setDeepUnavailable(false);
    try {
      // Both signals run on her device only; neither ever sends the file.
      // The C2PA engine is lazy-loaded here, on her first pick.
      const meta = await readImageProvenance(next).catch(() => null);
      setResult(meta);
      setStatus("done");
      void readC2paCredentials(next).then((summary) => {
        setC2pa(summary);
        setC2paLoading(false);
      });
    } catch {
      setStatus("error");
      setC2paLoading(false);
    }
  }

  async function runDeepCheck() {
    if (!ageConfirmed || deepCheckOff || !file || !deepConsent) return;
    setDeepStatus("checking");
    setDeepResult(null);
    try {
      const csrf = await (await fetch("/api/csrf", { cache: "no-store" })).json();
      const body = new FormData();
      body.append("file", file);
      body.append("ageConfirmed", "true");
      body.append("consent", "true");
      const res = await fetch("/api/check-image", {
        method: "POST",
        headers: { "x-csrf-token": (csrf as { token: string }).token },
        body,
      });
      const payload = (await res.json().catch(() => null)) as (DeepResult & { error?: string }) | null;
      if (!res.ok) {
        // The OpenAI key is not configured on the server: stop offering the
        // check and say so plainly instead of showing a generic failure.
        if (res.status === 503 && payload?.error === "provider_unconfigured") {
          setDeepUnavailable(true);
          setDeepStatus("idle");
          return;
        }
        throw new Error("deep_failed");
      }
      setDeepResult(payload);
      setDeepStatus("done");
    } catch {
      setDeepStatus("error");
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (ageConfirmed && file) void handleFile(file);
  }

  const rawEntries = result ? Object.entries(result.raw) : [];
  const c2paRawEntries = c2pa ? Object.entries(c2pa.raw) : [];

  return (
    <div className="mx-auto max-w-xl">
      {/* AGE GATE */}
      <div className="rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-6" style={{ boxShadow: "var(--shadow-soft)" }}>
        <p className="font-display text-[18px] font-normal leading-snug tracking-tight">
          {t(locale, "check.age.title")}
        </p>
        <p className="muted mt-3 text-sm leading-[1.7]">{t(locale, "check.age.body")}</p>
        <label className="mt-5 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={ageConfirmed}
            onChange={(e) => setAgeConfirmed(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand)]"
          />
          <span className="text-sm leading-[1.6] text-[var(--ink)]">
            {t(locale, "check.age.confirm")}
          </span>
        </label>
        <p className="mt-4 text-sm">
          <Link href="/minor-support" className="link-underline text-[var(--text-muted)]">
            {t(locale, "check.age.minorLink")}{" "}
            <span className="cta-arrow" aria-hidden>→</span>
          </Link>
        </p>
      </div>

      {/* UPLOADER */}
      <div className="mt-6">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onInputChange}
          disabled={!ageConfirmed}
          className="sr-only"
          aria-hidden={!ageConfirmed}
          tabIndex={ageConfirmed ? 0 : -1}
        />
        <div className="rounded-[var(--radius-box)] border border-dashed border-[var(--line)] bg-[var(--card)] p-8 text-center">
          <p className="font-medium text-[var(--ink)]">{t(locale, "check.upload.label")}</p>
          <p className="muted mt-2 text-sm leading-[1.6]">{t(locale, "check.upload.hint")}</p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={!ageConfirmed || status === "checking"}
            className="btn btn-primary mt-5"
          >
            {status === "done" || status === "error"
              ? t(locale, "check.upload.change")
              : t(locale, "check.upload.button")}
          </button>
          {fileName && (
            <p className="muted mt-4 truncate font-mono text-xs" title={fileName}>
              {fileName}
            </p>
          )}
        </div>
      </div>

      {/* CHECKING */}
      {status === "checking" && (
        <p className="muted mt-6 text-center text-sm">{t(locale, "check.checking")}</p>
      )}

      {/* ERROR */}
      {status === "error" && (
        <div className="mt-6 rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-6">
          <p className="font-display text-[18px] leading-snug tracking-tight">{t(locale, "check.error.title")}</p>
          <p className="muted mt-3 text-sm leading-[1.7]">{t(locale, "check.error.body")}</p>
        </div>
      )}

      {/* RESULT */}
      {status === "done" && (
        <div className="mt-6">
          <span className="eyebrow mb-4 block">{t(locale, "check.result.title")}</span>

          {/* FIRST SIGNAL: signed Content Credentials, read on this device. */}
          <p className="muted mb-2 text-xs font-medium uppercase tracking-wide">{t(locale, "check.c2pa.title")}</p>
          {c2paLoading && <p className="muted text-sm leading-[1.7]">{t(locale, "check.c2pa.loading")}</p>}
          {!c2paLoading && c2pa?.status === "none" && (
            <div className="rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--page)] p-6" style={{ boxShadow: "var(--shadow-soft)" }}>
              <p className="font-display text-[20px] font-normal leading-[1.3] tracking-tight text-[var(--ink)]">
                {t(locale, "check.c2pa.result.none.title")}
              </p>
              <p className="muted mt-3 text-sm leading-[1.75]">{t(locale, "check.c2pa.result.none.body")}</p>
            </div>
          )}
          {!c2paLoading && c2pa?.status === "unavailable" && (
            <p className="muted text-sm leading-[1.7]">{t(locale, "check.c2pa.result.unavailable")}</p>
          )}
          {!c2paLoading && c2pa?.status === "found" && (
            <div
              className="rounded-[var(--radius-box)] border p-6"
              style={{
                borderColor: c2pa.aiUsed ? "var(--brand)" : "var(--line)",
                background: c2pa.aiUsed ? "color-mix(in srgb, var(--brand) 8%, transparent)" : "var(--page)",
                boxShadow: "var(--shadow-soft)",
              }}
            >
              <p
                className="font-display text-[20px] font-normal leading-[1.3] tracking-tight"
                style={{ color: c2pa.aiUsed ? "var(--brand)" : "var(--ink)" }}
              >
                {t(locale, "check.c2pa.result.found.title")}
              </p>
              <p className="muted mt-3 text-sm leading-[1.75]">{t(locale, "check.c2pa.result.found.body")}</p>

              {c2pa.aiUsed && (
                <p className="mt-4 text-sm font-medium leading-[1.7] text-[var(--brand)]">
                  {t(locale, "check.c2pa.ai")}
                </p>
              )}

              <dl className="mt-5 space-y-2 border-t border-[var(--line)] pt-4 text-sm">
                {c2pa.tool && (
                  <div className="flex gap-3">
                    <dt className="muted w-28 shrink-0">{t(locale, "check.c2pa.tool")}</dt>
                    <dd className="break-all font-medium">{c2pa.tool}</dd>
                  </div>
                )}
                {c2pa.digitalSourceType && (
                  <div className="flex gap-3">
                    <dt className="muted w-28 shrink-0">{t(locale, "check.c2pa.source")}</dt>
                    <dd className="break-all font-mono text-xs">{c2pa.digitalSourceType}</dd>
                  </div>
                )}
                {c2pa.signer && (
                  <div className="flex gap-3">
                    <dt className="muted w-28 shrink-0">{t(locale, "check.c2pa.signer")}</dt>
                    <dd className="font-medium">{c2pa.signer}</dd>
                  </div>
                )}
                {typeof c2pa.signatureValidated === "boolean" && (
                  <div className="flex gap-3">
                    <dt className="muted w-28 shrink-0">{t(locale, "check.c2pa.validation")}</dt>
                    <dd className="font-medium">
                      {!c2pa.signatureValidated
                        ? t(locale, "check.c2pa.validation.invalid")
                        : c2pa.validationNote === "signingCredential.untrusted"
                          ? t(locale, "check.c2pa.validation.untrusted")
                          : t(locale, "check.c2pa.validation.valid")}
                    </dd>
                  </div>
                )}
              </dl>

              {c2paRawEntries.length > 0 && (
                <details className="mt-4">
                  <summary className="muted cursor-pointer text-xs">{t(locale, "check.result.rawLabel")}</summary>
                  <ul className="mt-2 space-y-1 font-mono text-[11px] text-[var(--text-muted)]">
                    {c2paRawEntries.map(([k, v]) => (
                      <li key={k} className="break-all">
                        {k}: {v}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {/* SECOND SIGNAL: unsigned metadata labels, read on this device. */}
          {result && (
            <div className="mt-6">
              <p className="muted mb-2 text-xs font-medium uppercase tracking-wide">{t(locale, "check.meta.title")}</p>
              <div
                className="rounded-[var(--radius-box)] border p-6"
                style={{
                  borderColor: result.ai ? "var(--brand)" : "var(--line)",
                  background: result.ai ? "color-mix(in srgb, var(--brand) 8%, transparent)" : "var(--page)",
                  boxShadow: "var(--shadow-soft)",
                }}
              >
                <p
                  className="font-display text-[20px] font-normal leading-[1.3] tracking-tight"
                  style={{ color: result.ai ? "var(--brand)" : "var(--ink)" }}
                >
                  {result.ai
                    ? t(locale, "check.result.aiFound.title")
                    : t(locale, "check.result.noneFound.title")}
                </p>
                <p className="muted mt-3 text-sm leading-[1.75]">
                  {result.ai
                    ? t(locale, "check.result.aiFound.body")
                    : t(locale, "check.result.noneFound.body")}
                </p>

                {result.ai && (result.tool || result.source || result.signer) && (
                  <dl className="mt-5 space-y-2 border-t border-[var(--line)] pt-4 text-sm">
                    {result.tool && (
                      <div className="flex gap-3">
                        <dt className="muted w-28 shrink-0">{t(locale, "check.result.tool")}</dt>
                        <dd className="font-medium">{result.tool}</dd>
                      </div>
                    )}
                    {result.source && (
                      <div className="flex gap-3">
                        <dt className="muted w-28 shrink-0">{t(locale, "check.result.source")}</dt>
                        <dd className="break-all font-mono text-xs">{result.source}</dd>
                      </div>
                    )}
                    {result.signer && (
                      <div className="flex gap-3">
                        <dt className="muted w-28 shrink-0">{t(locale, "check.result.signer")}</dt>
                        <dd className="font-medium">{result.signer}</dd>
                      </div>
                    )}
                  </dl>
                )}

                {rawEntries.length > 0 && (
                  <details className="mt-4">
                    <summary className="muted cursor-pointer text-xs">{t(locale, "check.result.rawLabel")}</summary>
                    <ul className="mt-2 space-y-1 font-mono text-[11px] text-[var(--text-muted)]">
                      {rawEntries.map(([k, v]) => (
                        <li key={k} className="break-all">
                          {k}: {v}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </div>
          )}

          {/* DEEPER CHECK (opt-in per check, sends the image to OpenAI). */}
          {deepCheckEnabled && (
          <div className="mt-6 rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-6" style={{ boxShadow: "var(--shadow-soft)" }}>
            <p className="font-display text-[18px] font-normal leading-snug tracking-tight">
              {t(locale, "check.deep.title")}
            </p>
            <p className="muted mt-3 text-sm leading-[1.7]">{t(locale, "check.deep.body")}</p>
            <p className="muted mt-2 text-xs leading-[1.6]">{t(locale, "check.deep.limitation")}</p>

            {deepStatus !== "done" && deepCheckOff && (
              <p className="mt-5 text-sm leading-[1.7] text-[var(--text-muted)]">{t(locale, "check.deep.unavailable")}</p>
            )}

            {deepStatus !== "done" && !deepCheckOff && (
              <>
                <label className="mt-5 flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={deepConsent}
                    onChange={(e) => setDeepConsent(e.target.checked)}
                    className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand)]"
                  />
                  <span className="text-sm leading-[1.6] text-[var(--ink)]">
                    {t(locale, "check.deep.consent")}
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => void runDeepCheck()}
                  disabled={!deepConsent || deepStatus === "checking"}
                  className="btn btn-primary mt-5"
                >
                  {t(locale, "check.deep.button")}
                </button>
              </>
            )}

            {deepStatus === "checking" && (
              <p className="muted mt-4 text-sm">{t(locale, "check.deep.checking")}</p>
            )}
            {deepStatus === "error" && (
              <p className="mt-4 text-sm text-[var(--danger)]">{t(locale, "check.deep.error")}</p>
            )}

            {deepStatus === "done" && deepResult && (
              <div
                className="mt-5 rounded-[var(--radius-box)] border p-5"
                style={{
                  borderColor: deepResult.detected ? "var(--brand)" : "var(--line)",
                  background: deepResult.detected
                    ? "color-mix(in srgb, var(--brand) 8%, transparent)"
                    : "transparent",
                }}
              >
                <p
                  className="font-display text-[17px] font-normal leading-snug tracking-tight"
                  style={{ color: deepResult.detected ? "var(--brand)" : "var(--ink)" }}
                >
                  {deepResult.detected
                    ? t(locale, "check.deep.result.detected.title")
                    : t(locale, "check.deep.result.none.title")}
                </p>
                <p className="muted mt-2 text-sm leading-[1.7]">
                  {deepResult.detected
                    ? t(locale, "check.deep.result.detected.body")
                    : t(locale, "check.deep.result.none.body")}
                </p>
                {deepResult.checks.length > 0 && (
                  <ul className="mt-3 space-y-1 font-mono text-[11px] text-[var(--text-muted)]">
                    {deepResult.checks.map((c) => (
                      <li key={c.type} className="break-all">
                        {c.type}: {c.detected ? "detected" : "not_detected"}
                        {c.model ? ` · ${c.model}` : ""}
                        {c.validationState ? ` · ${c.validationState}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          )}
        </div>
      )}
    </div>
  );
}
