"use client";

/*
 * The trace tool's client half (experiment E3, docs/lab/charter.md). All
 * analysis happens in this browser (src/lib/lab/trace/browser.ts); nothing
 * is uploaded, and the page states that in both languages. The results show
 * each suspect/original pair honestly: a verdict band, what the band means,
 * the measured scores, the notes about anything that could not be measured,
 * and the aligned heat map so a human can see the matching regions — never
 * just a number.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import {
  runTrace,
  type TraceRunResult,
  type OriginalComparison,
} from "@/lib/lab/trace/browser";
import { buildEvidencePdf, type EvidenceScoreRow } from "@/lib/lab/trace/pdf";
import { TRACE_TOOL_VERSION } from "@/lib/lab/trace/score";

type Props = {
  locale: "en" | "hi";
  sscdModelUrl: string | null;
  humanModelBase: string;
};

const HEAT_MATCHED = "rgba(0, 128, 118, 0.34)";
const HEAT_DIFFERENT = "rgba(128, 128, 128, 0.20)";
const FACE_FRAME = "rgba(154, 91, 0, 0.95)";

function pngObjectUrl(png: Uint8Array): string {
  // A copy with a concrete ArrayBuffer (Blob's BlobPart wants exactly that).
  const copy = new Uint8Array(png.byteLength);
  copy.set(png);
  return URL.createObjectURL(new Blob([copy], { type: "image/png" }));
}

/** One drawn image: the PNG with the heat grid and the face box on top. */
function TraceCanvas({
  png,
  width,
  height,
  heat,
  faceBox,
  label,
}: {
  png: Uint8Array;
  width: number;
  height: number;
  heat?: { grid: number; matched: boolean[] };
  faceBox: { x: number; y: number; w: number; h: number } | null;
  label: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let revoked = false;
    const url = pngObjectUrl(png);
    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      if (heat) {
        const cell = img.naturalWidth / heat.grid;
        for (let gy = 0; gy < heat.grid; gy++) {
          for (let gx = 0; gx < heat.grid; gx++) {
            const ok = heat.matched[gy * heat.grid + gx];
            ctx.fillStyle = ok ? HEAT_MATCHED : HEAT_DIFFERENT;
            ctx.fillRect(gx * cell, gy * cell, cell, cell);
          }
        }
      }
      if (faceBox) {
        ctx.strokeStyle = FACE_FRAME;
        ctx.lineWidth = Math.max(2, img.naturalWidth / 300);
        ctx.strokeRect(faceBox.x, faceBox.y, faceBox.w, faceBox.h);
      }
      if (!revoked) URL.revokeObjectURL(url);
    };
    img.src = url;
    return () => {
      revoked = true;
      img.onload = null;
      img.src = "";
      URL.revokeObjectURL(url);
    };
  }, [png, heat, faceBox]);
  return (
    <figure className="m-0">
      <canvas
        ref={ref}
        width={width}
        height={height}
        role="img"
        aria-label={label}
        className="block w-full rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)]"
      />
    </figure>
  );
}

function scoreRow(label: string, value: string): { label: string; value: string } {
  return { label, value };
}

function comparisonScores(locale: "en" | "hi", c: OriginalComparison): EvidenceScoreRow[] {
  const unavailable = t(locale, "lab.trace.score.unavailable");
  const quality = t(locale, "lab.trace.score.quality");
  const rows: EvidenceScoreRow[] = [];
  const whole = c.signals.whole;
  rows.push(
    scoreRow(
      t(locale, "lab.trace.score.whole"),
      whole ? `${whole.distance} (${quality} ${whole.qualityA}/${whole.qualityB})` : unavailable,
    ),
  );
  rows.push(scoreRow(t(locale, "lab.trace.score.face"), c.signals.face ? `${c.signals.face.distance}` : unavailable));
  rows.push(
    scoreRow(t(locale, "lab.trace.score.background"), c.signals.background ? `${c.signals.background.distance}` : unavailable),
  );
  rows.push(
    scoreRow(t(locale, "lab.trace.score.sscd"), c.signals.sscd ? c.signals.sscd.cosine.toFixed(3) : unavailable),
  );
  rows.push(
    scoreRow(t(locale, "lab.trace.score.tiles"), `${Math.round(c.signals.tiles.agreement * 100)}%`),
  );
  return rows;
}

const NOTE_KEYS = {
  identical_pixels: "lab.trace.note.identical",
  low_image_quality: "lab.trace.note.low_quality",
  no_face_in_pair: "lab.trace.note.no_face",
  sscd_model_not_configured: "lab.trace.sscd.off",
  sscd_inference_failed: "lab.trace.note.sscd_inference_failed",
  landmarks_unavailable: "lab.trace.landmarks.off",
} as const;

const VERDICT_STYLES = {
  strong: "bg-[var(--success-soft)] text-[var(--success)]",
  possible: "bg-[var(--warning-soft)] text-[var(--warning)]",
  none: "bg-[var(--card)] text-[var(--text)] border border-[var(--line)]",
} as const;

export function TraceClient({ locale, sscdModelUrl, humanModelBase }: Props) {
  const [suspect, setSuspect] = useState<File | null>(null);
  const [originals, setOriginals] = useState<File[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TraceRunResult | null>(null);
  const [error, setError] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const suspectInputRef = useRef<HTMLInputElement | null>(null);
  const originalsInputRef = useRef<HTMLInputElement | null>(null);

  const ready = suspect !== null && originals.length > 0 && !running;

  const reset = () => {
    setSuspect(null);
    setOriginals([]);
    setResult(null);
    setError("");
    if (suspectInputRef.current) suspectInputRef.current.value = "";
    if (originalsInputRef.current) originalsInputRef.current.value = "";
  };

  const run = useCallback(async () => {
    if (!suspect || originals.length === 0) {
      setError(t(locale, "lab.trace.error.none"));
      return;
    }
    setError("");
    setRunning(true);
    setResult(null);
    try {
      const outcome = await runTrace(suspect, originals, { sscdModelUrl, humanModelBase });
      setResult(outcome);
    } catch (err) {
      setError(err instanceof Error && err.message === "no_originals" ? t(locale, "lab.trace.error.none") : t(locale, "lab.trace.error.decode"));
    } finally {
      setRunning(false);
    }
  }, [suspect, originals, sscdModelUrl, humanModelBase, locale]);

  const downloadPdf = useCallback(
    async (comparison: OriginalComparison) => {
      if (!result) return;
      setPdfBusy(true);
      try {
        // The evidence PDF is deliberately English-only (pdf-lib's standard
        // fonts cannot draw Devanagari); the page says so in both languages.
        const rows = comparisonScores("en", comparison);
        const bytes = await buildEvidencePdf({
          generatedAt: new Date().toLocaleString("en-GB", { timeZone: "UTC", hour12: false }) + " UTC",
          toolVersion: TRACE_TOOL_VERSION,
          verdictLine: `Verdict: ${t("en", `lab.trace.verdict.${comparison.verdict.verdict}` as never)}`,
          explanationLines: [
            t("en", `lab.trace.explain.${comparison.verdict.verdict}` as never),
            t("en", "lab.trace.caveat"),
          ],
          scores: rows,
          methodLines: [
            t("en", "lab.trace.method.1"),
            t("en", "lab.trace.method.2"),
            t("en", "lab.trace.method.3"),
            t("en", "lab.trace.method.4"),
          ],
          suspect: {
            caption: `Suspect image - ${result.suspect.name}`,
            png: result.suspect.png,
            size: { width: result.suspect.pngWidth, height: result.suspect.pngHeight },
            highlight: result.suspect.faceBox,
          },
          original: {
            caption: `Original image - ${comparison.name}`,
            png: comparison.png,
            size: { width: comparison.pngWidth, height: comparison.pngHeight },
            highlight: comparison.faceBox,
          },
        });
        const pdfBytes = new Uint8Array(bytes.byteLength);
        pdfBytes.set(bytes);
        const blob = new Blob([pdfBytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "asmita-lab-trace-evidence.pdf";
        anchor.click();
        URL.revokeObjectURL(url);
      } finally {
        setPdfBusy(false);
      }
    },
    [result],
  );

  return (
    <div className="mx-auto max-w-4xl">
      <div className="filing-card space-y-6">
        <div>
          <label htmlFor="trace-suspect" className="block text-[18px] font-medium leading-[1.3] text-[var(--ink)]">
            {t(locale, "lab.trace.suspect.label")}
          </label>
          <p className="muted mt-1 text-sm leading-[1.5]">{t(locale, "lab.trace.suspect.hint")}</p>
          <input
            ref={suspectInputRef}
            id="trace-suspect"
            type="file"
            accept="image/*"
            onChange={(e) => setSuspect(e.target.files?.[0] ?? null)}
            className="field mt-3 cursor-pointer text-sm"
          />
          {suspect && <p className="muted mt-2 truncate text-xs">{suspect.name}</p>}
        </div>

        <div>
          <label htmlFor="trace-originals" className="block text-[18px] font-medium leading-[1.3] text-[var(--ink)]">
            {t(locale, "lab.trace.originals.label")}
          </label>
          <p className="muted mt-1 text-sm leading-[1.5]">{t(locale, "lab.trace.originals.hint")}</p>
          <input
            ref={originalsInputRef}
            id="trace-originals"
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setOriginals(Array.from(e.target.files ?? []))}
            className="field mt-3 cursor-pointer text-sm"
          />
          {originals.length > 0 && (
            <p className="muted mt-2 truncate text-xs">{originals.map((f) => f.name).join(", ")}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary" disabled={!ready} onClick={run}>
            {running ? t(locale, "lab.trace.running") : t(locale, "lab.trace.run")}
          </button>
          {(result || suspect || originals.length > 0) && !running && (
            <button type="button" className="btn btn-secondary" onClick={reset}>
              {t(locale, "lab.trace.reset")}
            </button>
          )}
        </div>

        {running && (
          <p role="status" className="text-sm font-medium leading-[1.6] text-[var(--brand)]">
            {t(locale, "lab.trace.running")}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm font-medium text-[var(--danger)]">
            {error}
          </p>
        )}
      </div>

      {result && (
        <div className="mt-10 space-y-10" aria-live="polite">
          <h2 className="section-title text-left">{t(locale, "lab.trace.results.title")}</h2>

          <div className="card p-5 text-sm leading-[1.6]">
            <h3 className="font-semibold text-[var(--ink)]">{t(locale, "lab.trace.capabilities.title")}</h3>
            <ul className="mt-2 space-y-1.5">
              <li>{result.capabilities.sscd ? t(locale, "lab.trace.sscd.on") : t(locale, "lab.trace.sscd.off")}</li>
              {result.capabilities.landmarksReason && <li>{t(locale, "lab.trace.landmarks.off")}</li>}
            </ul>
          </div>

          {result.comparisons.map((comparison, i) => (
            <article key={comparison.name} className="space-y-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold text-[var(--ink)]">
                  {t(locale, "lab.trace.match.title")}: <span className="font-normal text-[var(--text)]">{comparison.name}</span>
                </h3>
                {i === result.bestIndex && result.comparisons.length > 1 && (
                  <span className="rounded-full bg-[var(--brand-soft)] px-3 py-1 text-xs font-medium text-[var(--brand-strong)]">
                    {t(locale, "lab.trace.match.best")}
                  </span>
                )}
              </div>

              <p
                data-verdict={comparison.verdict.verdict}
                className={`rounded-[var(--radius-box)] px-4 py-3 text-[16px] font-semibold leading-[1.5] ${VERDICT_STYLES[comparison.verdict.verdict]}`}
              >
                {t(locale, `lab.trace.verdict.${comparison.verdict.verdict}` as never)}
              </p>
              <p className="max-w-3xl text-[15px] leading-[1.7] text-[var(--text)]">
                {t(locale, `lab.trace.explain.${comparison.verdict.verdict}` as never)}
              </p>

              <ul className="space-y-1.5">
                {comparison.signals.notes.map((note) => (
                  <li key={note} className="text-sm leading-[1.6] text-[var(--text)]">
                    {t(locale, NOTE_KEYS[note] as never)}
                  </li>
                ))}
              </ul>

              <div className="grid gap-6 md:grid-cols-2">
                <TraceCanvas
                  png={result.suspect.png}
                  width={result.suspect.pngWidth}
                  height={result.suspect.pngHeight}
                  faceBox={result.suspect.faceBox}
                  label={result.suspect.name}
                />
                <TraceCanvas
                  png={comparison.png}
                  width={comparison.pngWidth}
                  height={comparison.pngHeight}
                  heat={{ grid: comparison.signals.tiles.grid, matched: comparison.signals.tiles.matched }}
                  faceBox={comparison.faceBox}
                  label={comparison.name}
                />
              </div>
              <p className="muted text-xs leading-[1.6]">{t(locale, "lab.trace.heat.legend")}</p>

              <div className="overflow-x-auto">
                <table className="w-full max-w-xl border-collapse text-sm">
                  <tbody>
                    {comparisonScores(locale, comparison).map((row) => (
                      <tr key={row.label} className="border-b border-[var(--line)] last:border-b-0">
                        <th scope="row" className="py-2 pr-4 text-left font-medium text-[var(--ink)]">{row.label}</th>
                        <td className="py-2 tabular-nums text-[var(--text)]">{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={pdfBusy}
                  onClick={() => void downloadPdf(comparison)}
                >
                  {pdfBusy ? t(locale, "lab.trace.pdf.building") : t(locale, "lab.trace.pdf.button")}
                </button>
                <p className="muted max-w-xl text-xs leading-[1.6]">{t(locale, "lab.trace.pdf.note")}</p>
              </div>
            </article>
          ))}

          <p className="mx-auto max-w-3xl border-t border-[var(--line)] pt-6 text-sm leading-[1.7] text-[var(--text)]">
            {t(locale, "lab.trace.caveat")}
          </p>
        </div>
      )}
    </div>
  );
}
