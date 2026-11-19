"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { computePdqHash, PDQ_CLIENT_VERSION } from "@/lib/pdq/pdq";
import { csrfFetch } from "@/lib/client-csrf";
import { t, type Locale } from "@/lib/i18n";
import { CrawlConsent } from "../../(victim)/case/[caseId]/CrawlConsent";
import type { ConsentState } from "../../(victim)/case/[caseId]/crawl-consent-logic";

/*
 * The two steps of "Watch for my images" (WP22), after the sign-in the page
 * already required:
 *
 * 1. Fingerprint her images on her device (the same PDQ the complaint flow
 *    uses; the images never leave the browser) and continue: the server
 *    creates her watch case (no links are ever asked for) and stores the
 *    fingerprints, and answers with the watch-only authorisation draft.
 * 2. One tick. The CrawlConsent component in its watch variant shows the tick
 *    text and the full authorisation in a disclosure; ticking records the
 *    WATCH_ONLY consent and takes her to her watch page.
 *
 * Nothing is sent to any platform at any point in this flow.
 */

const MAX_HASH_FILES = 10;

type FileHashState = {
  name: string;
  status: "hashing" | "hashed" | "error";
  hash?: string;
  quality?: number;
};

async function hashImageFile(file: File): Promise<{ hash: string; quality: number }> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("canvas_unavailable");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    const result = computePdqHash(imageData);
    canvas.width = 0;
    canvas.height = 0;
    return result;
  } finally {
    bitmap.close();
  }
}

type CreatedWatch = {
  caseId: string;
  referenceNumber: string;
  existing?: boolean;
  draft: { subject: string; body: string; templateRef: string } | null;
};

export function WatchForm({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [hashFiles, setHashFiles] = useState<FileHashState[]>([]);
  const [created, setCreated] = useState<CreatedWatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function onSelectFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []).slice(0, MAX_HASH_FILES);
    if (selected.length === 0) return;
    setHashFiles(selected.map((f) => ({ name: f.name, status: "hashing" as const })));
    const next: FileHashState[] = [];
    for (const file of selected) {
      try {
        const { hash, quality } = await hashImageFile(file);
        next.push({ name: file.name, status: "hashed", hash, quality });
      } catch {
        next.push({ name: file.name, status: "error" });
      }
      setHashFiles([
        ...next,
        ...selected.slice(next.length).map((f) => ({ name: f.name, status: "hashing" as const })),
      ]);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const hashedFiles = hashFiles.filter((f) => f.status === "hashed" && f.hash);
  const hashing = hashFiles.some((f) => f.status === "hashing");
  const lowQuality = hashFiles.some((f) => f.status === "hashed" && (f.quality ?? 100) < 50);

  async function continueToTick() {
    if (hashedFiles.length === 0) return;
    setError("");
    setBusy(true);
    try {
      const response = await csrfFetch("/api/watch", {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          hashes: hashedFiles.map((f) => ({ hash: f.hash!, quality: f.quality ?? 0, clientVersion: PDQ_CLIENT_VERSION })),
        }),
      });
      if (!response.ok) {
        setError(t(locale, "watch.error"));
        return;
      }
      const result = (await response.json()) as CreatedWatch;
      if (result.existing) {
        // She already has a watch: it is the one to keep or restart.
        router.push(`/case/${result.caseId}`);
        return;
      }
      setCreated(result);
    } catch {
      setError(t(locale, "watch.error"));
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    const initial: ConsentState | null = created.draft
      ? { status: "none", available: true, draft: created.draft }
      : { status: "none", available: false, draft: null };
    return (
      <div className="mt-10 space-y-6">
        <p role="status" className="rounded-[var(--radius-box)] bg-[var(--brand-soft)] px-4 py-3 text-sm leading-[1.6] text-[var(--brand-strong)]">
          {t(locale, "watch.created")}{" "}
          <span className="font-mono">{created.referenceNumber}</span>
        </p>
        {!created.draft && (
          <p className="muted rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] px-4 py-3 text-sm leading-[1.6]">
            {t(locale, "watch.notAvailable.sub")}
          </p>
        )}
        <CrawlConsent
          caseId={created.caseId}
          locale={locale}
          initialConsent={initial}
          watch
          onNowOn={() => router.push(`/case/${created.caseId}`)}
        />
      </div>
    );
  }

  return (
    <div className="mt-10 space-y-6">
      <div className="filing-card">
        <label htmlFor="watch-images" className="block text-[18px] font-medium leading-[1.3] text-[var(--ink)]">
          {t(locale, "watch.images.label")}
        </label>
        <p className="muted mt-1 text-sm leading-[1.5]">{t(locale, "watch.images.sub")}</p>

        <input
          ref={fileInputRef}
          id="watch-images"
          type="file"
          accept="image/*"
          multiple
          onChange={onSelectFiles}
          className="field mt-4 cursor-pointer text-sm"
        />

        {hashFiles.length > 0 && (
          <ul className="mt-4 space-y-1.5 text-sm" aria-live="polite">
            {hashFiles.map((file, i) => (
              <li
                key={`${file.name}-${i}`}
                className="flex items-center justify-between rounded-[var(--radius-box)] border border-[var(--line)] px-3 py-2"
              >
                <span className="truncate text-[var(--ink)]">{file.name}</span>
                <span className={`ml-2 shrink-0 text-xs ${
                  file.status === "hashed" ? "text-[var(--brand)]"
                  : file.status === "error" ? "text-[var(--danger)]"
                  : "text-[var(--text-muted)]"
                }`}>
                  {file.status === "hashing" && t(locale, "submit.hash.processing")}
                  {file.status === "hashed" && `${t(locale, "submit.hash.ready")} ${file.quality}${t(locale, "submit.hash.readySuffix")}`}
                  {file.status === "error" && t(locale, "submit.hash.error")}
                </span>
              </li>
            ))}
          </ul>
        )}

        {hashing && <p className="muted mt-3 text-sm leading-[1.6]">{t(locale, "submit.hash.processingNote")}</p>}

        {hashedFiles.length > 0 && !hashing && (
          <p className="mt-3 text-sm font-medium leading-[1.6] text-[var(--brand)]">
            {t(locale, "submit.hash.doneNote")}
          </p>
        )}

        {lowQuality && <p className="mt-2 text-sm text-[var(--warning)]">{t(locale, "submit.hash.lowQuality")}</p>}
      </div>

      {error && <p role="alert" className="text-sm font-medium text-[var(--danger)]">{error}</p>}

      <button
        className="btn btn-primary btn-arrow w-full justify-center sm:w-auto"
        disabled={busy || hashing || hashedFiles.length === 0}
        onClick={continueToTick}
        type="button"
      >
        {busy ? t(locale, "watch.working") : t(locale, "watch.cta")}
      </button>
    </div>
  );
}
