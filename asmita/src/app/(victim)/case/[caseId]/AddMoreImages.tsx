"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { computePdqHash, PDQ_CLIENT_VERSION } from "@/lib/pdq/pdq";
import { csrfFetch } from "@/lib/client-csrf";
import { t, type Locale } from "@/lib/i18n";

/*
 * "Add more images" on her watch page (WP22): fingerprints more images on her
 * device and posts only the fingerprint codes to the case's hashes route.
 * The images themselves never leave the browser, and nothing is sent to any
 * platform: the new fingerprints simply join the watch.
 */

const MAX_HASH_FILES = 10;

export function AddMoreImages({ caseId, locale }: { caseId: string; locale: Locale }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(true);

  async function onContinue(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(0, MAX_HASH_FILES);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (files.length === 0) return;
    setMessage("");
    setBusy(true);
    try {
      const hashes: Array<{ hash: string; quality: number; clientVersion: string }> = [];
      let failed = 0;
      for (const file of files) {
        try {
          const bitmap = await createImageBitmap(file);
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) throw new Error("canvas_unavailable");
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(bitmap, 0, 0);
          const { hash, quality } = computePdqHash(ctx.getImageData(0, 0, bitmap.width, bitmap.height));
          bitmap.close();
          canvas.width = 0;
          canvas.height = 0;
          hashes.push({ hash, quality, clientVersion: PDQ_CLIENT_VERSION });
        } catch {
          failed += 1;
        }
      }
      if (hashes.length === 0) {
        setOk(false);
        setMessage(t(locale, "watch.error"));
        return;
      }
      const response = await csrfFetch(`/api/cases/${caseId}/hashes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hashes, declaration: true }),
      });
      setOk(response.ok);
      if (!response.ok) {
        setMessage(t(locale, "watch.error"));
        return;
      }
      setMessage(t(locale, "case.watch.addImages.done") + (failed ? ` (${failed} ${t(locale, "submit.hash.error").toLowerCase()})` : ""));
      router.refresh();
    } catch {
      setOk(false);
      setMessage(t(locale, "watch.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <input
        ref={fileInputRef}
        id="watch-add-images"
        type="file"
        accept="image/*"
        multiple
        onChange={onContinue}
        aria-label={t(locale, "case.watch.addImages")}
        className="sr-only"
        tabIndex={-1}
      />
      <button
        type="button"
        className="btn btn-secondary"
        disabled={busy}
        onClick={() => fileInputRef.current?.click()}
      >
        {busy ? t(locale, "case.watch.addImages.working") : t(locale, "case.watch.addImages")}
      </button>
      {message && (
        <p aria-live="polite" className={`mt-3 text-sm font-medium ${ok ? "text-[var(--brand)]" : "text-[var(--danger)]"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
