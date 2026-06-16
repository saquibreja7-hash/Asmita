"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";
import { computePdqHash, PDQ_CLIENT_VERSION } from "@/lib/pdq/pdq";
import type { HashPickerPlatform } from "@/lib/hash-submission";
import { t, type Locale } from "@/lib/i18n";

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

type Props = {
  enableHashUpload?: boolean;
  platforms?: HashPickerPlatform[];
  locale: Locale;
};

export function SubmitForm({ enableHashUpload = false, platforms = [], locale }: Props) {
  const router = useRouter();
  const [urls, setUrls] = useState("");
  const [declaration, setDeclaration] = useState(false);
  const [detection, setDetection] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const [hashFiles, setHashFiles] = useState<FileHashState[]>([]);
  const [selectedPlatformIds, setSelectedPlatformIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setHydrated(true), 0);
    return () => window.clearTimeout(id);
  }, []);

  async function detect(value: string) {
    const first = value.split(/\s+/).find(Boolean);
    if (!first) { setDetection(""); return; }
    const response = await fetch(`/api/platforms/detect?url=${encodeURIComponent(first)}`);
    const data = (await response.json()) as { platformName?: string };
    setDetection(data.platformName || "Unknown - will be reviewed");
  }

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
  const parsedUrls = urls.split(/\n+/).map((u) => u.trim()).filter(Boolean);
  const hashOnly = hashedFiles.length > 0 && parsedUrls.length === 0;
  const hasAnyContent = parsedUrls.length > 0 || hashedFiles.length > 0;
  const canSubmit = declaration && hasAnyContent && (!hashOnly || selectedPlatformIds.length > 0);

  function togglePlatform(id: string) {
    setSelectedPlatformIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function submit() {
    setError("");
    setSubmitting(true);
    try {
      const declarationResponse = await csrfFetch("/api/profile/declaration", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acknowledged: true, version: "draft-2026-05-12", language: "en" }),
      });
      if (!declarationResponse.ok) {
        setError(t(locale, "submit.declaration.error"));
        return;
      }
      const selectedPlatforms = hashOnly ? platforms.filter((p) => selectedPlatformIds.includes(p.id)) : [];
      const emailPlatformIds = selectedPlatforms.filter((p) => p.hasEmail).map((p) => p.id);
      const formOnlyPlatforms = selectedPlatforms
        .filter((p) => !p.hasEmail && p.formUrl)
        .map((p) => ({ id: p.id, name: p.name, formUrl: p.formUrl! }));
      sessionStorage.setItem("asmita_submit_draft", JSON.stringify({
        urls: parsedUrls,
        hashes: hashedFiles.map((f) => ({
          hash: f.hash!,
          quality: f.quality ?? 0,
          clientVersion: PDQ_CLIENT_VERSION,
        })),
        platformIds: hashOnly ? selectedPlatformIds : [],
        emailPlatformIds,
        formOnlyPlatforms,
        declaration: true,
      }));
      router.push("/review-sign");
    } catch {
      setError(t(locale, "submit.error.generic"));
    } finally {
      setSubmitting(false);
    }
  }

  const lineCount = parsedUrls.length;
  const lowQuality = hashFiles.some((f) => f.status === "hashed" && (f.quality ?? 100) < 50);

  return (
    <div className="space-y-8">

      {/* URL section */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3" style={{ boxShadow: "var(--shadow-soft)" }}>
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--teal-soft)]">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M6.5 9.5a3.535 3.535 0 0 0 5 0l2-2a3.536 3.536 0 0 0-5-5l-1.5 1.5" stroke="var(--teal)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M9.5 6.5a3.535 3.535 0 0 0-5 0l-2 2a3.536 3.536 0 0 0 5 5L9 12" stroke="var(--teal)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
          <div>
            <label htmlFor="urls" className="block text-sm font-semibold text-[var(--foreground)]">
              {t(locale, "submit.urls.label")}
            </label>
            <p className="muted text-xs leading-[1.5]">
              {t(locale, "submit.urls.sub")}
            </p>
          </div>
        </div>
        <textarea
          className="field min-h-36 font-mono text-[13px] leading-[1.7] bg-[var(--background)]"
          id="urls"
          onChange={(e) => { setUrls(e.target.value); void detect(e.target.value); }}
          value={urls}
          placeholder={"https://example.com/post/1234\nhttps://example.com/post/5678"}
          spellCheck={false}
        />
        <div className="flex items-center justify-between text-xs">
          <span className="muted">{lineCount} {lineCount === 1 ? t(locale, "submit.urls.linkSingular") : t(locale, "submit.urls.linkPlural")}</span>
          {detection && (
            <span className="font-medium text-[var(--teal)]">{t(locale, "submit.urls.detected")} {detection}</span>
          )}
        </div>
      </div>

      {/* Hash section */}
      {enableHashUpload && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-5"
          style={{ boxShadow: "var(--shadow-soft)" }}
        >
          <div>
            <p className="text-sm font-semibold text-[var(--foreground)]">
              {t(locale, "submit.hash.title")}{" "}
              <span className="font-normal text-[var(--muted)]">{t(locale, "submit.hash.optional")}</span>
            </p>
            <p className="muted mt-1 text-sm leading-[1.6]">
              {t(locale, "submit.hash.sub")}
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={onSelectFiles}
            aria-label={t(locale, "submit.hash.fileLabel")}
            className="sr-only"
            tabIndex={-1}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full cursor-pointer flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--background)] px-6 py-8 text-center transition-colors hover:border-[var(--teal)] hover:bg-[var(--teal-soft)]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--teal-soft)]">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                <path d="M10 13V4M10 4l-3 3M10 4l3 3" stroke="var(--teal)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3 14v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1" stroke="var(--teal)" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </span>
            <span>
              <span className="block text-sm font-semibold text-[var(--foreground)]">{t(locale, "submit.hash.fileLabel")}</span>
              <span className="muted mt-0.5 block text-xs">{t(locale, "submit.hash.fileHint")}</span>
            </span>
          </button>

          {hashFiles.length > 0 && (
            <ul className="space-y-1.5 text-sm" aria-live="polite">
              {hashFiles.map((file, i) => (
                <li
                  key={`${file.name}-${i}`}
                  className="flex items-center justify-between rounded-lg border border-[var(--hairline)] px-3 py-2"
                >
                  <span className="truncate text-[var(--foreground)]">{file.name}</span>
                  <span className={`ml-2 shrink-0 text-xs font-mono ${
                    file.status === "hashed" ? "text-[var(--teal)]"
                    : file.status === "error" ? "text-[var(--rose)]"
                    : "text-[var(--muted)]"
                  }`}>
                    {file.status === "hashing" && t(locale, "submit.hash.processing")}
                    {file.status === "hashed" && `${t(locale, "submit.hash.ready")} ${file.quality}${t(locale, "submit.hash.readySuffix")}`}
                    {file.status === "error" && t(locale, "submit.hash.error")}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {lowQuality && (
            <p className="text-sm text-amber-700">
              {t(locale, "submit.hash.lowQuality")}
            </p>
          )}

          {hashedFiles.length > 0 && parsedUrls.length === 0 && platforms.length > 0 && (
            <div>
              <p className="block text-sm font-semibold text-[var(--foreground)]">
                {t(locale, "submit.hash.platforms.title")}
              </p>
              <p className="muted mt-1 text-sm leading-[1.6]">
                {t(locale, "submit.hash.platforms.sub")}
              </p>
              <ul className="mt-3 space-y-2">
                {platforms.map((p) => (
                  <li key={p.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-3 hover:border-[var(--teal)] transition-colors">
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 accent-[var(--teal)]"
                        checked={selectedPlatformIds.includes(p.id)}
                        onChange={() => togglePlatform(p.id)}
                      />
                      <span className="flex-1 text-sm text-[var(--foreground)]">{p.name}</span>
                      {!p.hasEmail && (
                        <span className="shrink-0 font-mono text-[11px] text-[var(--muted)]">{t(locale, "submit.hash.platforms.formNote")}</span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
              {selectedPlatformIds.some((id) => {
                const p = platforms.find((pl) => pl.id === id);
                return p && !p.hasEmail;
              }) && (
                <p className="muted mt-2 text-xs leading-[1.6]">
                  {t(locale, "submit.hash.platforms.formOnlyNote")}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Declaration */}
      <div className="hairline" />
      <label className="flex cursor-pointer items-start gap-3">
        <input
          checked={declaration}
          onChange={(e) => setDeclaration(e.target.checked)}
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0 accent-[var(--teal)]"
        />
        <span className="text-sm leading-[1.65] text-[var(--foreground)]">
          {t(locale, "submit.declaration.text")}
        </span>
      </label>

      {error && (
        <p className="text-sm font-semibold text-[var(--rose)]">{error}</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          className="btn btn-primary"
          disabled={!hydrated || !canSubmit || submitting}
          onClick={submit}
          type="button"
        >
          {submitting ? t(locale, "submit.cta.saving") : t(locale, "submit.cta.review")}
        </button>
        <Link className="btn btn-secondary" href="/resources">
          {t(locale, "submit.cta.resources")}
        </Link>
      </div>

    </div>
  );
}
