"use client";

import { useRef, useState } from "react";
import { computePdqHash, PDQ_CLIENT_VERSION } from "@/lib/pdq/pdq";
import { csrfFetch } from "@/lib/client-csrf";

const MAX_FILES = 10;

type FileHashState = {
  name: string;
  status: "hashing" | "hashed" | "error";
  hash?: string;
  quality?: number;
  error?: string;
};

type SubmitState = "idle" | "submitting" | "submitted" | "error";

async function hashImageFile(file: File): Promise<{ hash: string; quality: number }> {
  const bitmap = await createImageBitmap(file);
  try {
    // Draw at natural size with no canvas smoothing: pdq.ts applies the same
    // nearest-neighbor 512x512 pre-resize as Meta's reference tool, so any
    // canvas-side rescaling here would silently change hashes.
    const width = bitmap.width;
    const height = bitmap.height;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("canvas_unavailable");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, width, height);
    const result = computePdqHash(imageData);
    // Release pixel data eagerly; the image itself is never transmitted.
    canvas.width = 0;
    canvas.height = 0;
    return result;
  } finally {
    bitmap.close();
  }
}

export default function HashGenerator({ caseId }: { caseId: string }) {
  const [files, setFiles] = useState<FileHashState[]>([]);
  const [declaration, setDeclaration] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const inputRef = useRef<HTMLInputElement>(null);

  async function onSelectFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []).slice(0, MAX_FILES);
    if (selected.length === 0) return;
    setSubmitState("idle");
    setFiles(selected.map((file) => ({ name: file.name, status: "hashing" as const })));
    const next: FileHashState[] = [];
    for (const file of selected) {
      try {
        const { hash, quality } = await hashImageFile(file);
        next.push({ name: file.name, status: "hashed", hash, quality });
      } catch {
        next.push({ name: file.name, status: "error", error: "could_not_hash" });
      }
      setFiles([...next, ...selected.slice(next.length).map((f) => ({ name: f.name, status: "hashing" as const }))]);
    }
    // Allow re-selecting the same files.
    if (inputRef.current) inputRef.current.value = "";
  }

  async function onSubmit() {
    const hashed = files.filter((f) => f.status === "hashed" && f.hash);
    if (hashed.length === 0 || !declaration) return;
    setSubmitState("submitting");
    try {
      const response = await csrfFetch(`/api/cases/${caseId}/hashes`, {
        method: "POST",
        body: JSON.stringify({
          hashes: hashed.map((f) => ({
            hash: f.hash,
            quality: f.quality ?? 0,
            clientVersion: PDQ_CLIENT_VERSION,
          })),
          declaration: true,
        }),
      });
      if (!response.ok) throw new Error(`status_${response.status}`);
      setSubmitState("submitted");
    } catch {
      setSubmitState("error");
    }
  }

  const hashedCount = files.filter((f) => f.status === "hashed").length;
  const lowQuality = files.some((f) => f.status === "hashed" && (f.quality ?? 100) < 50);

  return (
    <section aria-label="Generate digital fingerprints" className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onSelectFiles}
        aria-label="Select images to fingerprint"
        className="sr-only"
        tabIndex={-1}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex w-full cursor-pointer flex-col items-center gap-3 rounded-[24px] border border-dashed border-[var(--color-ash)] bg-[var(--color-parchment)] px-6 py-8 text-center transition-colors hover:border-[var(--color-off-black)]"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-periwinkle-mist)]">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M10 13V4M10 4l-3 3M10 4l3 3" stroke="var(--color-off-black)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M3 14v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1" stroke="var(--color-off-black)" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </span>
        <span>
          <span className="block text-sm font-medium text-[var(--color-off-black)]">Choose photos to fingerprint</span>
          <span className="muted mt-0.5 block text-xs">Up to {MAX_FILES} images. They never leave this device.</span>
        </span>
      </button>

      {files.length > 0 && (
        <ul className="space-y-1 text-sm" aria-live="polite">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="flex items-center justify-between rounded-[16px] border border-[var(--color-ash)] px-4 py-2.5">
              <span className="truncate">{file.name}</span>
              <span className={`ml-3 shrink-0 text-xs ${file.status === "error" ? "text-[var(--danger)]" : "text-[var(--color-graphite)]"}`}>
                {file.status === "hashing" && "Creating fingerprint…"}
                {file.status === "hashed" && `Fingerprint ready (quality ${file.quality}/100)`}
                {file.status === "error" && "Could not process this image"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {lowQuality && (
        <p className="text-sm text-[var(--warning)]">
          One or more images produced a weak fingerprint (very flat or blurred images do
          this). You can still submit, but matching may be less reliable.
        </p>
      )}

      {hashedCount > 0 && (
        <label className="flex cursor-pointer items-start gap-3 text-sm leading-[1.6]">
          <input
            type="checkbox"
            checked={declaration}
            onChange={(event) => setDeclaration(event.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-off-black)]"
          />
          <span>
            I declare that I appear in this content (or I am the authorized reporter), that
            it was shared or threatened to be shared without consent, and I understand that
            false reports carry legal penalties.
          </span>
        </label>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={hashedCount === 0 || !declaration || submitState === "submitting"}
        className="btn btn-midnight disabled:opacity-40"
      >
        {submitState === "submitting" ? "Submitting fingerprints…" : `Submit ${hashedCount} fingerprint${hashedCount === 1 ? "" : "s"}`}
      </button>

      {submitState === "submitted" && (
        <p className="text-sm text-[var(--success)]" role="status">
          Fingerprints submitted. Our team reviews every submission before notices go out;
          you can track the status on your case page.
        </p>
      )}
      {submitState === "error" && (
        <p className="text-sm text-[var(--danger)]" role="alert">
          Something went wrong while submitting. Your photos are still only on your device.
          Please try again.
        </p>
      )}
    </section>
  );
}
