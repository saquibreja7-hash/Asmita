"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { t, type Locale } from "@/lib/i18n";

/*
 * The detector panel's client half (docs/lab/beta-spec.md WP90). The file
 * never leaves the browser until she consents and runs the check; the image
 * and every result live only in this component's state, which dies with the
 * tab. Results are announced with role="status" and by moving focus to the
 * results heading, the same two signals /check-image uses.
 */

type Status = "idle" | "running" | "done" | "error";

type Band = "likely_ai" | "unclear" | "likely_camera";

type Row = {
  id: string;
  name: string;
  status: "scored" | "not_configured" | "no_face" | "error";
  score?: number;
  band?: Band;
  error?: string;
};

type PanelResult = { rows: Row[]; disagree: boolean };

const BAND_KEY: Record<Band, Parameters<typeof t>[1]> = {
  likely_ai: "lab.detectors.band.likelyAi",
  unclear: "lab.detectors.band.unclear",
  likely_camera: "lab.detectors.band.likelyCamera",
};

const ERROR_KEY: Record<string, Parameters<typeof t>[1]> = {
  rate_limited: "lab.detectors.error.rateLimited",
  payload_too_large: "lab.detectors.error.tooLarge",
  invalid_size: "lab.detectors.error.tooLarge",
  unsupported_type: "lab.detectors.error.wrongType",
  not_an_image: "lab.detectors.error.wrongType",
};

export function DetectorPanel({ locale }: { locale: Locale }) {
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [errorKey, setErrorKey] = useState<Parameters<typeof t>[1]>("lab.detectors.error.generic");
  const [result, setResult] = useState<PanelResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (status === "done") resultHeadingRef.current?.focus();
  }, [status]);

  function pickFile(next: File) {
    setFile(next);
    setResult(null);
    setStatus("idle");
  }

  async function run() {
    if (!file || !consent || status === "running") return;
    setStatus("running");
    setResult(null);
    try {
      const csrf = await (await fetch("/api/csrf", { cache: "no-store" })).json();
      const body = new FormData();
      body.append("file", file);
      body.append("consent", "true");
      const res = await fetch("/api/lab/detectors", {
        method: "POST",
        headers: { "x-csrf-token": (csrf as { token: string }).token },
        body,
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        setErrorKey((payload?.error && ERROR_KEY[payload.error]) || "lab.detectors.error.generic");
        setStatus("error");
        return;
      }
      setResult((await res.json()) as PanelResult);
      setStatus("done");
    } catch {
      setErrorKey("lab.detectors.error.generic");
      setStatus("error");
    }
  }

  const busy = status === "running";
  const announcement = busy
    ? t(locale, "lab.detectors.running")
    : status === "done" && result
      ? t(locale, "lab.detectors.result.title")
      : "";

  return (
    <div className="mx-auto max-w-2xl">
      {/* UPLOADER */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) pickFile(picked);
        }}
        className="sr-only"
        aria-label={t(locale, "lab.detectors.upload.label")}
        tabIndex={-1}
      />
      <div className="rounded-[var(--radius-box)] border border-dashed border-[var(--line)] bg-[var(--card)] p-8 text-center">
        <p className="font-medium text-[var(--ink)]">{t(locale, "lab.detectors.upload.label")}</p>
        <p className="muted mt-2 text-sm leading-[1.6]">{t(locale, "lab.detectors.upload.hint")}</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="btn btn-secondary mt-5"
        >
          {file ? t(locale, "lab.detectors.upload.change") : t(locale, "lab.detectors.upload.button")}
        </button>
        {file && (
          <p className="muted mt-4 truncate font-mono text-xs" title={file.name}>
            {file.name}
          </p>
        )}
      </div>

      {/* CONSENT AND RUN */}
      <div
        className="mt-6 rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-6"
        style={{ boxShadow: "var(--shadow-soft)" }}
      >
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand)]"
          />
          <span className="text-sm leading-[1.6] text-[var(--ink)]">{t(locale, "lab.detectors.consent")}</span>
        </label>

        <button
          type="button"
          onClick={() => void run()}
          disabled={!file || !consent || busy}
          className="btn btn-primary mt-5 w-full sm:w-auto"
        >
          {t(locale, "lab.detectors.run")}
        </button>

        <p className="mt-5 text-sm">
          <Link href="/minor-support" className="link-underline text-[var(--text-muted)]">
            {t(locale, "lab.detectors.minor")}{" "}
            <span className="cta-arrow" aria-hidden>→</span>
          </Link>
        </p>
      </div>

      {/* ANNOUNCEMENT */}
      <p className="sr-only" role="status">
        {announcement}
      </p>
      {busy && (
        <p className="muted mt-6 text-center text-sm" aria-hidden="true">{t(locale, "lab.detectors.running")}</p>
      )}

      {/* ERROR */}
      {status === "error" && (
        <div role="alert" className="mt-6 rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-6">
          <p className="font-display text-[18px] leading-snug tracking-tight">{t(locale, "lab.detectors.error.title")}</p>
          <p className="muted mt-3 text-sm leading-[1.7]">{t(locale, errorKey)}</p>
        </div>
      )}

      {/* RESULTS */}
      {status === "done" && result && (
        <div className="mt-6">
          <h2 ref={resultHeadingRef} tabIndex={-1} className="eyebrow mb-4 block outline-none">
            {t(locale, "lab.detectors.result.title")}
          </h2>
          <ul className="space-y-3">
            {result.rows.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] px-5 py-4"
              >
                <span className="font-medium text-[var(--ink)]">
                  {row.name}
                  {row.id === "gend" && (
                    <span className="mt-1 block text-xs font-normal leading-[1.6] text-[var(--text-muted)]">
                      {t(locale, "lab.detectors.gend.checks")}{" "}
                      <a
                        href="https://arxiv.org/abs/2508.06248"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link-underline text-[var(--text-muted)]"
                      >
                        {t(locale, "lab.detectors.gend.paper")}
                      </a>
                      {" · "}
                      <a
                        href="https://github.com/yermandy/GenD"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link-underline text-[var(--text-muted)]"
                      >
                        {t(locale, "lab.detectors.gend.code")}
                      </a>
                    </span>
                  )}
                </span>
                {row.status === "scored" && typeof row.score === "number" && row.band && (
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-[var(--line)] bg-[var(--page)] px-3 py-1 text-xs font-medium text-[var(--text)]">
                      {t(locale, BAND_KEY[row.band])}
                    </span>
                    <span className="text-sm tabular-nums text-[var(--text)]">
                      {t(locale, "lab.detectors.score")} {row.score} / 100
                    </span>
                  </span>
                )}
                {row.status === "not_configured" && (
                  <span className="rounded-full border border-[var(--line)] bg-[var(--page)] px-3 py-1 text-xs font-medium text-[var(--text-muted)]">
                    {t(locale, "lab.detectors.row.notConfigured")}
                  </span>
                )}
                {row.status === "no_face" && (
                  <span className="rounded-full border border-[var(--line)] bg-[var(--page)] px-3 py-1 text-xs font-medium text-[var(--text-muted)]">
                    {t(locale, "lab.detectors.row.noFace")}
                  </span>
                )}
                {row.status === "error" && (
                  <span className="rounded-full border border-[var(--line)] bg-[var(--page)] px-3 py-1 text-xs font-medium text-[var(--text-muted)]">
                    {t(locale, "lab.detectors.row.error")}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {result.disagree && (
            <p className="mt-5 rounded-[var(--radius-box)] bg-[var(--brand-soft)] px-5 py-4 text-sm leading-[1.7] text-[var(--brand-strong)]">
              {t(locale, "lab.detectors.result.disagree")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
