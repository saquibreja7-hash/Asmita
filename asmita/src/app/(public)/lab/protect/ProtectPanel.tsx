"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { t, type Locale } from "@/lib/i18n";
import { makeProtectSeed, protectPixels } from "@/lib/lab/protect/perturbation";

/*
 * Photo protection's client half (docs/lab/beta-spec.md WP91). The photo is
 * decoded, perturbed and re-encoded as a PNG entirely inside the visitor's
 * browser: it is never uploaded, stored or logged — there is no server
 * half to send it to. The original and the protected copy live only in
 * object URLs of this component's state, which die with the tab.
 *
 * The before/after pair and the download are announced with role="status"
 * and by moving focus to the results heading, the same two signals
 * /check-image uses.
 */

type Status = "idle" | "running" | "done" | "error";

type Result = {
  originalUrl: string;
  protectedUrl: string;
  width: number;
  height: number;
};

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB, the beta spec's upload cap.
// 25 million pixels, the same whole-image cap the crawler's decoder uses:
// it bounds canvas memory while leaving every ordinary camera photo intact.
const MAX_PIXELS = 25_000_000;

const ERROR_KEY: Record<string, Parameters<typeof t>[1]> = {
  wrong_type: "lab.protect.error.wrongType",
  too_large: "lab.protect.error.tooLarge",
  too_many_pixels: "lab.protect.error.tooManyPixels",
  decode_failed: "lab.protect.error.decode",
};

export function ProtectPanel({ locale }: { locale: Locale }) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errorKey, setErrorKey] = useState<Parameters<typeof t>[1]>("lab.protect.error.generic");
  const [result, setResult] = useState<Result | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const urlsRef = useRef<{ originalUrl: string; protectedUrl: string } | null>(null);

  useEffect(() => {
    if (status === "done") resultHeadingRef.current?.focus();
  }, [status]);

  // Object URLs are revocable handles on the visitor's own file and the
  // protected copy; release both when the component goes away.
  useEffect(() => {
    const held = urlsRef.current;
    return () => {
      if (held) {
        URL.revokeObjectURL(held.originalUrl);
        URL.revokeObjectURL(held.protectedUrl);
      }
    };
  }, []);

  function releaseUrls() {
    const held = urlsRef.current;
    if (held) {
      URL.revokeObjectURL(held.originalUrl);
      URL.revokeObjectURL(held.protectedUrl);
      urlsRef.current = null;
    }
  }

  function pickFile(next: File) {
    releaseUrls();
    setFile(next);
    setResult(null);
    setStatus("idle");
  }

  function fail(code: string) {
    setErrorKey(ERROR_KEY[code] ?? "lab.protect.error.generic");
    setStatus("error");
  }

  async function protect() {
    if (!file || status === "running") return;
    if (!ACCEPTED_TYPES.has(file.type)) {
      fail("wrong_type");
      return;
    }
    if (file.size === 0 || file.size > MAX_FILE_BYTES) {
      fail("too_large");
      return;
    }

    setStatus("running");
    setResult(null);
    releaseUrls();

    let bitmap: ImageBitmap;
    try {
      // EXIF rotation is applied on decode, so the protected copy comes
      // out upright whatever orientation the camera wrote.
      bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      fail("decode_failed");
      return;
    }

    try {
      if (bitmap.width * bitmap.height > MAX_PIXELS) {
        fail("too_many_pixels");
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        fail("generic");
        return;
      }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bitmap, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      protectPixels(imageData.data, makeProtectSeed());
      ctx.putImageData(imageData, 0, 0);

      // PNG is lossless, so the protective layer survives the download
      // exactly as it was added.
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) {
        fail("generic");
        return;
      }

      const originalUrl = URL.createObjectURL(file);
      const protectedUrl = URL.createObjectURL(blob);
      urlsRef.current = { originalUrl, protectedUrl };
      setResult({ originalUrl, protectedUrl, width: canvas.width, height: canvas.height });
      setStatus("done");
      canvas.width = 0;
      canvas.height = 0;
    } finally {
      bitmap.close();
    }
  }

  const busy = status === "running";
  const announcement = busy
    ? t(locale, "lab.protect.running")
    : status === "done" && result
      ? t(locale, "lab.protect.result.title")
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
        aria-label={t(locale, "lab.protect.upload.label")}
        tabIndex={-1}
      />
      <div className="rounded-[var(--radius-box)] border border-dashed border-[var(--line)] bg-[var(--card)] p-8 text-center">
        <p className="font-medium text-[var(--ink)]">{t(locale, "lab.protect.upload.label")}</p>
        <p className="muted mt-2 text-sm leading-[1.6]">{t(locale, "lab.protect.upload.hint")}</p>
        <p className="muted mt-2 text-sm leading-[1.6]">{t(locale, "lab.protect.privacy")}</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="btn btn-secondary mt-5"
        >
          {file ? t(locale, "lab.protect.upload.change") : t(locale, "lab.protect.upload.button")}
        </button>
        {file && (
          <p className="muted mt-4 truncate font-mono text-xs" title={file.name}>
            {file.name}
          </p>
        )}
      </div>

      {/* PROTECT */}
      <div
        className="mt-6 rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-6"
        style={{ boxShadow: "var(--shadow-soft)" }}
      >
        <button
          type="button"
          onClick={() => void protect()}
          disabled={!file || busy}
          className="btn btn-primary w-full sm:w-auto"
        >
          {t(locale, "lab.protect.run")}
        </button>

        <p className="mt-5 text-sm">
          <Link href="/minor-support" className="link-underline text-[var(--text-muted)]">
            {t(locale, "lab.protect.minor")}{" "}
            <span className="cta-arrow" aria-hidden>→</span>
          </Link>
        </p>
      </div>

      {/* ANNOUNCEMENT */}
      <p className="sr-only" role="status">
        {announcement}
      </p>
      {busy && (
        <p className="muted mt-6 text-center text-sm" aria-hidden="true">{t(locale, "lab.protect.running")}</p>
      )}

      {/* ERROR */}
      {status === "error" && (
        <div role="alert" className="mt-6 rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-6">
          <p className="font-display text-[18px] leading-snug tracking-tight">{t(locale, "lab.protect.error.title")}</p>
          <p className="muted mt-3 text-sm leading-[1.7]">{t(locale, errorKey)}</p>
        </div>
      )}

      {/* RESULTS */}
      {status === "done" && result && (
        <div className="mt-6">
          <h2 ref={resultHeadingRef} tabIndex={-1} className="eyebrow mb-4 block outline-none">
            {t(locale, "lab.protect.result.title")}
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <figure className="m-0 overflow-hidden rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)]">
              <img
                src={result.originalUrl}
                alt={t(locale, "lab.protect.result.original")}
                width={result.width}
                height={result.height}
                className="block h-auto w-full"
              />
              <figcaption className="border-t border-[var(--line)] px-4 py-3 text-sm font-medium text-[var(--text)]">
                {t(locale, "lab.protect.result.original")}
              </figcaption>
            </figure>
            <figure className="m-0 overflow-hidden rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)]">
              <img
                src={result.protectedUrl}
                alt={t(locale, "lab.protect.result.protected")}
                width={result.width}
                height={result.height}
                className="block h-auto w-full"
              />
              <figcaption className="border-t border-[var(--line)] px-4 py-3 text-sm font-medium text-[var(--text)]">
                {t(locale, "lab.protect.result.protected")}
              </figcaption>
            </figure>
          </div>

          <p className="muted mt-4 text-sm leading-[1.7]">{t(locale, "lab.protect.result.lookSame")}</p>

          <a href={result.protectedUrl} download="protected-photo.png" className="btn btn-primary mt-4 w-full sm:w-auto">
            {t(locale, "lab.protect.result.download")}
          </a>

          {/* The strong limits notice the WP requires. */}
          <p className="mt-5 rounded-[var(--radius-box)] bg-[var(--brand-soft)] px-5 py-4 text-sm leading-[1.7] text-[var(--brand-strong)]">
            {t(locale, "lab.protect.result.limits")}
          </p>
        </div>
      )}
    </div>
  );
}
