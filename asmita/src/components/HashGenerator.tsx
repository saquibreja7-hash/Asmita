"use client";

import { useRef, useState } from "react";
import { computePdqHash, PDQ_CLIENT_VERSION } from "@/lib/pdq/pdq";
import { csrfFetch } from "@/lib/client-csrf";

// Largest edge fed into PDQ. Downscaling on-canvas keeps hashing under the
// 3s budget on low-end devices without materially changing the hash.
const MAX_DIMENSION = 512;
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
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(2, Math.round(bitmap.width * scale));
    const height = Math.max(2, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("canvas_unavailable");
    ctx.drawImage(bitmap, 0, 0, width, height);
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
      <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
        <p className="font-semibold">Your photo never leaves this device.</p>
        <p>
          We create a digital fingerprint (a &ldquo;hash&rdquo;) of your photo right here in
          your browser. Only the fingerprint is sent to us &mdash; never the photo itself.
          Platforms use the fingerprint to find and block the content.
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onSelectFiles}
        aria-label="Select images to fingerprint"
        className="block w-full text-sm"
      />

      {files.length > 0 && (
        <ul className="space-y-1 text-sm" aria-live="polite">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="flex items-center justify-between rounded border border-gray-200 px-3 py-2">
              <span className="truncate">{file.name}</span>
              <span>
                {file.status === "hashing" && "Creating fingerprint…"}
                {file.status === "hashed" && `Fingerprint ready (quality ${file.quality}/100)`}
                {file.status === "error" && "Could not process this image"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {lowQuality && (
        <p className="text-sm text-amber-700">
          One or more images produced a weak fingerprint (very flat or blurred images do
          this). You can still submit, but matching may be less reliable.
        </p>
      )}

      {hashedCount > 0 && (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={declaration}
            onChange={(event) => setDeclaration(event.target.checked)}
            className="mt-1"
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
        className="rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {submitState === "submitting" ? "Submitting fingerprints…" : `Submit ${hashedCount} fingerprint${hashedCount === 1 ? "" : "s"}`}
      </button>

      {submitState === "submitted" && (
        <p className="text-sm text-emerald-800" role="status">
          Fingerprints submitted. Our team reviews every submission before notices go out;
          you can track the status on your case page.
        </p>
      )}
      {submitState === "error" && (
        <p className="text-sm text-red-700" role="alert">
          Something went wrong while submitting. Your photos are still only on your device.
          Please try again.
        </p>
      )}
    </section>
  );
}
