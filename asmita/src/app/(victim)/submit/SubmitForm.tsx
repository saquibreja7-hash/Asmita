"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";
import { computePdqHash, PDQ_CLIENT_VERSION } from "@/lib/pdq/pdq";
import type { HashPickerPlatform } from "@/lib/hash-submission";

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
};

export function SubmitForm({ enableHashUpload = false, platforms = [] }: Props) {
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
        setError("Please confirm the declaration before submitting.");
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
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const lineCount = parsedUrls.length;
  const lowQuality = hashFiles.some((f) => f.status === "hashed" && (f.quality ?? 100) < 50);

  return (
    <div className="space-y-8">

      {/* URL section */}
      <div>
        <label
          htmlFor="urls"
          className="block text-sm font-semibold text-[var(--foreground)]"
        >
          Links where the content appears
        </label>
        <p className="muted mt-1 text-sm leading-[1.6]">
          One URL per line. Leave empty if you only want to use digital fingerprinting below.
        </p>
        <textarea
          className="field mt-3 min-h-40 font-mono text-[13px] leading-[1.7]"
          id="urls"
          onChange={(e) => { setUrls(e.target.value); void detect(e.target.value); }}
          value={urls}
          placeholder={"https://example.com/post/1234\nhttps://example.com/post/5678"}
          spellCheck={false}
        />
        <div className="muted mt-2 flex items-center justify-between text-xs">
          <span>{lineCount} {lineCount === 1 ? "link" : "links"}</span>
          {detection && (
            <span className="font-medium text-[var(--teal)]">Detected: {detection}</span>
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
              Digital fingerprint{" "}
              <span className="font-normal text-[var(--muted)]">- optional</span>
            </p>
            <p className="muted mt-1 text-sm leading-[1.6]">
              Your photo never leaves this device. Only the fingerprint is sent.
              Platforms use it to find and remove matching content proactively.
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={onSelectFiles}
            aria-label="Select images to fingerprint"
            className="block w-full text-sm text-[var(--muted)] file:mr-3 file:rounded-lg file:border file:border-[var(--border)] file:bg-[var(--background)] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[var(--foreground)] hover:file:border-[var(--teal)]"
          />

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
                    {file.status === "hashing" && "Processing..."}
                    {file.status === "hashed" && `Ready (quality ${file.quality}/100)`}
                    {file.status === "error" && "Could not process"}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {lowQuality && (
            <p className="text-sm text-amber-700">
              One or more images produced a weak fingerprint. You can still submit, but matching may be less reliable.
            </p>
          )}

          {hashedFiles.length > 0 && parsedUrls.length === 0 && platforms.length > 0 && (
            <div>
              <p className="block text-sm font-semibold text-[var(--foreground)]">
                Which platforms is the content on?
              </p>
              <p className="muted mt-1 text-sm leading-[1.6]">
                Select all that apply. We will send the signed fingerprint advisory to their teams. You can select more than one.
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
                        <span className="shrink-0 font-mono text-[11px] text-[var(--muted)]">form</span>
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
                  Platforms marked "form" do not accept direct email. We will guide you to their form after signing.
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
          I declare that I am the person depicted in this content and that it
          has been or may be shared without my consent.
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
          {submitting ? "Saving..." : "Review and sign"}
        </button>
        <Link className="btn btn-secondary" href="/resources">
          Support resources
        </Link>
      </div>

    </div>
  );
}
