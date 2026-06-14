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

  // Hash section state
  const [hashFiles, setHashFiles] = useState<FileHashState[]>([]);
  const [selectedPlatformId, setSelectedPlatformId] = useState("");
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
  const canSubmit = declaration && hasAnyContent && (!hashOnly || selectedPlatformId !== "");

  async function submit() {
    setError("");
    setSubmitting(true);

    const createResponse = await csrfFetch("/api/cases/create", { method: "POST" });
    if (!createResponse.ok) {
      setError("Please sign in again before creating a case.");
      setSubmitting(false);
      return;
    }
    const created = (await createResponse.json()) as { caseId: string };

    const declarationResponse = await csrfFetch("/api/profile/declaration", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ acknowledged: true, version: "draft-2026-05-12", language: "en" }),
    });
    if (!declarationResponse.ok) {
      setError("Please confirm the declaration before submitting.");
      setSubmitting(false);
      return;
    }

    if (parsedUrls.length > 0) {
      const urlResponse = await csrfFetch(`/api/cases/${created.caseId}/urls`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ urls: parsedUrls, declaration }),
      });
      if (!urlResponse.ok) {
        setError("Some links could not be accepted. Check for private or invalid URLs.");
        setSubmitting(false);
        return;
      }
    }

    if (hashedFiles.length > 0) {
      const hashResponse = await csrfFetch(`/api/cases/${created.caseId}/hashes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          hashes: hashedFiles.map((f) => ({
            hash: f.hash,
            quality: f.quality ?? 0,
            clientVersion: PDQ_CLIENT_VERSION,
          })),
          declaration: true,
          platformId: hashOnly ? selectedPlatformId : undefined,
        }),
      });
      if (!hashResponse.ok) {
        setError("Image fingerprints could not be submitted. Please try again.");
        setSubmitting(false);
        return;
      }

      if (hashOnly) {
        const platform = platforms.find((p) => p.id === selectedPlatformId);
        if (platform && !platform.hasEmail && platform.formUrl) {
          // FORM_ONLY platform: guide survivor to fill the platform's own form.
          router.push(
            `/handoff/${created.caseId}?formUrl=${encodeURIComponent(platform.formUrl)}&platformName=${encodeURIComponent(platform.name)}`,
          );
          return;
        }
        router.push(`/case/${created.caseId}/confirmation`);
        return;
      }
    }

    router.push(`/case/${created.caseId}`);
  }

  const lineCount = parsedUrls.length;
  const lowQuality = hashFiles.some((f) => f.status === "hashed" && (f.quality ?? 100) < 50);
  const selectedPlatform = platforms.find((p) => p.id === selectedPlatformId);

  return (
    <div className="space-y-8">
      {/* URL section */}
      <div>
        <label
          htmlFor="urls"
          className="font-display text-[18px] leading-[1.3] tracking-tight text-[var(--foreground)]"
        >
          Paste links where the content appears
        </label>
        <p className="muted mt-1 text-sm leading-[1.6]">
          One URL per line. Leave empty if you don&apos;t have links yet.
        </p>
        <div className="mt-3">
          <textarea
            className="field min-h-44 font-mono text-[14px] leading-[1.7]"
            id="urls"
            onChange={(e) => { setUrls(e.target.value); void detect(e.target.value); }}
            value={urls}
            placeholder={"https://example.com/post/1234\nhttps://example.com/post/5678"}
            spellCheck={false}
          />
          <div className="muted mt-2 flex items-center justify-between text-xs">
            <span>{lineCount} {lineCount === 1 ? "link" : "links"}</span>
            {detection && <span className="text-[var(--teal)]">Detected: {detection}</span>}
          </div>
        </div>
      </div>

      {/* Hash section */}
      {enableHashUpload && (
        <div className="rounded-[14px] border border-[var(--hairline)] bg-[var(--surface)] p-5 space-y-4">
          <div>
            <p className="font-display text-[18px] leading-[1.3] tracking-tight text-[var(--foreground)]">
              Generate a digital fingerprint (optional)
            </p>
            <p className="muted mt-1 text-sm leading-[1.6]">
              Your photo never leaves this device — only the fingerprint is sent.
              Platforms use it to find and remove matching content.
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={onSelectFiles}
            aria-label="Select images to fingerprint"
            className="block w-full text-sm"
          />

          {hashFiles.length > 0 && (
            <ul className="space-y-1 text-sm" aria-live="polite">
              {hashFiles.map((file, i) => (
                <li key={`${file.name}-${i}`} className="flex items-center justify-between rounded border border-[var(--hairline)] px-3 py-2">
                  <span className="truncate">{file.name}</span>
                  <span className="muted ml-2 shrink-0 text-xs">
                    {file.status === "hashing" && "Processing…"}
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

          {/* Platform picker — only needed for hash-only submissions */}
          {hashedFiles.length > 0 && parsedUrls.length === 0 && platforms.length > 0 && (
            <div>
              <label
                htmlFor="platform-picker"
                className="font-display text-[15px] leading-[1.4] tracking-tight text-[var(--foreground)]"
              >
                Which platform is the content on?
              </label>
              <p className="muted mt-1 text-sm leading-[1.6]">
                We&apos;ll send the fingerprint advisory to their team.
              </p>
              <select
                id="platform-picker"
                className="field mt-2"
                value={selectedPlatformId}
                onChange={(e) => setSelectedPlatformId(e.target.value)}
              >
                <option value="">Select a platform…</option>
                {platforms.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{!p.hasEmail ? " (form submission)" : ""}
                  </option>
                ))}
              </select>
              {selectedPlatform && !selectedPlatform.hasEmail && selectedPlatform.formUrl && (
                <p className="muted mt-2 text-xs leading-[1.6]">
                  This platform requires a form submission. We&apos;ll guide you to fill it out after creating the case.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Declaration */}
      <label className="flex cursor-pointer items-start gap-3 rounded-[14px] border border-[var(--hairline)] bg-white p-4 transition-colors hover:border-[var(--border)]">
        <input
          checked={declaration}
          onChange={(e) => setDeclaration(e.target.checked)}
          type="checkbox"
          className="mt-[3px] h-4 w-4 accent-[var(--teal)]"
        />
        <span className="font-display text-[15px] leading-[1.55] tracking-tight text-[var(--foreground)] md:text-[16px]">
          I declare that I am the person depicted in this intimate content and
          that it has been or may be shared without my consent.
        </span>
      </label>

      {error && (
        <p className="text-center text-sm font-semibold text-[var(--rose)]">{error}</p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
        <button
          className="btn btn-primary"
          disabled={!hydrated || !canSubmit || submitting}
          onClick={submit}
          type="button"
        >
          {submitting ? "Creating case…" : "Create case"}
        </button>
        <Link className="btn btn-secondary" href="/resources">
          Support resources
        </Link>
      </div>
    </div>
  );
}
