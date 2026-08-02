"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { t, type Locale } from "@/lib/i18n";
import { readImageProvenance, type ProvenanceResult } from "@/lib/ai-provenance";

type Status = "idle" | "checking" | "done" | "error";
type DeepStatus = "idle" | "checking" | "done" | "error";

type DeepCheck = {
  type: string;
  detected: boolean;
  validationState: string | null;
  issuer: string | null;
  model: string | null;
  generatedAt: string | null;
};
type DeepResult = { detected: boolean; checks: DeepCheck[] };

export function ImageChecker({ locale }: { locale: Locale }) {
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<ProvenanceResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [deepConsent, setDeepConsent] = useState(false);
  const [deepStatus, setDeepStatus] = useState<DeepStatus>("idle");
  const [deepResult, setDeepResult] = useState<DeepResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(next: File) {
    setFileName(next.name);
    setFile(next);
    setStatus("checking");
    setResult(null);
    setDeepConsent(false);
    setDeepStatus("idle");
    setDeepResult(null);
    try {
      const res = await readImageProvenance(next);
      setResult(res);
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  async function runDeepCheck() {
    if (!file || !deepConsent) return;
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
      if (!res.ok) throw new Error("deep_failed");
      setDeepResult((await res.json()) as DeepResult);
      setDeepStatus("done");
    } catch {
      setDeepStatus("error");
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  }

  const rawEntries = result ? Object.entries(result.raw) : [];

  return (
    <div className="mx-auto max-w-xl">
      {/* AGE GATE */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6" style={{ boxShadow: "var(--shadow-soft)" }}>
        <p className="font-display text-[18px] font-normal leading-snug tracking-tight">
          {t(locale, "check.age.title")}
        </p>
        <p className="muted mt-3 text-sm leading-[1.7]">{t(locale, "check.age.body")}</p>
        <label className="mt-5 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={ageConfirmed}
            onChange={(e) => setAgeConfirmed(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-[var(--teal)]"
          />
          <span className="text-sm leading-[1.6] text-[var(--foreground)]">
            {t(locale, "check.age.confirm")}
          </span>
        </label>
        <p className="mt-4 text-sm">
          <Link href="/minor-support" className="link-underline text-[var(--muted)]">
            {t(locale, "check.age.minorLink")}{" "}
            <span className="cta-arrow" aria-hidden>→</span>
          </Link>
        </p>
      </div>

      {/* UPLOADER */}
      <div className={ageConfirmed ? "mt-6" : "mt-6 pointer-events-none opacity-45"}>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onInputChange}
          className="sr-only"
          aria-hidden={!ageConfirmed}
          tabIndex={ageConfirmed ? 0 : -1}
        />
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center">
          <p className="font-medium text-[var(--foreground)]">{t(locale, "check.upload.label")}</p>
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
        <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <p className="font-display text-[18px] leading-snug tracking-tight">{t(locale, "check.error.title")}</p>
          <p className="muted mt-3 text-sm leading-[1.7]">{t(locale, "check.error.body")}</p>
        </div>
      )}

      {/* RESULT */}
      {status === "done" && result && (
        <div className="mt-6">
          <span className="eyebrow mb-4 block">{t(locale, "check.result.title")}</span>
          <div
            className="rounded-xl border p-6"
            style={{
              borderColor: result.ai ? "var(--saffron)" : "var(--border)",
              background: result.ai ? "color-mix(in srgb, var(--saffron) 8%, transparent)" : "var(--surface)",
              boxShadow: "var(--shadow-soft)",
            }}
          >
            <p
              className="font-display text-[20px] font-normal leading-[1.3] tracking-tight"
              style={{ color: result.ai ? "var(--saffron)" : "var(--foreground)" }}
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
              <dl className="mt-5 space-y-2 border-t border-[var(--hairline)] pt-4 text-sm">
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
                <ul className="mt-2 space-y-1 font-mono text-[11px] text-[var(--muted)]">
                  {rawEntries.map(([k, v]) => (
                    <li key={k} className="break-all">
                      {k}: {v}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          {/* DEEPER CHECK (opt-in, sends image to OpenAI) */}
          <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6" style={{ boxShadow: "var(--shadow-soft)" }}>
            <p className="font-display text-[18px] font-normal leading-snug tracking-tight">
              {t(locale, "check.deep.title")}
            </p>
            <p className="muted mt-3 text-sm leading-[1.7]">{t(locale, "check.deep.body")}</p>
            <p className="muted mt-2 text-xs leading-[1.6]">{t(locale, "check.deep.limitation")}</p>

            {deepStatus !== "done" && (
              <>
                <label className="mt-5 flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={deepConsent}
                    onChange={(e) => setDeepConsent(e.target.checked)}
                    className="mt-1 h-4 w-4 shrink-0 accent-[var(--teal)]"
                  />
                  <span className="text-sm leading-[1.6] text-[var(--foreground)]">
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
              <p className="mt-4 text-sm text-[var(--rose)]">{t(locale, "check.deep.error")}</p>
            )}

            {deepStatus === "done" && deepResult && (
              <div
                className="mt-5 rounded-lg border p-5"
                style={{
                  borderColor: deepResult.detected ? "var(--saffron)" : "var(--border)",
                  background: deepResult.detected
                    ? "color-mix(in srgb, var(--saffron) 8%, transparent)"
                    : "transparent",
                }}
              >
                <p
                  className="font-display text-[17px] font-normal leading-snug tracking-tight"
                  style={{ color: deepResult.detected ? "var(--saffron)" : "var(--foreground)" }}
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
                  <ul className="mt-3 space-y-1 font-mono text-[11px] text-[var(--muted)]">
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
        </div>
      )}
    </div>
  );
}
