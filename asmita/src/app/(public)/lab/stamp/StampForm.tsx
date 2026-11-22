"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { t, type Locale } from "@/lib/i18n";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_CREATOR_CHARS = 100;

type Status = "idle" | "checking" | "done" | "rateLimited" | "error";

/**
 * WP94 (docs/lab/beta-spec.md): the upload form for the Content Credentials
 * stamp. The photo goes to /api/lab/stamp only — nowhere else on this page
 * fetches anything — and comes back as the stamped file, downloaded in the
 * browser. The typed name and the photo are never stored anywhere. Progress
 * and results are announced (role="status" plus focus moved to the results
 * heading, the site's A5 pattern).
 */
export function StampForm({ locale }: { locale: Locale }) {
  const [file, setFile] = useState<File | null>(null);
  const [creatorName, setCreatorName] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [problem, setProblem] = useState<"tooLarge" | "type" | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  useEffect(() => {
    if (status === "done") resultHeadingRef.current?.focus();
  }, [status]);

  function pick(nextFile: File | null) {
    setFile(nextFile);
    setProblem(null);
    if (nextFile && nextFile.size > MAX_BYTES) setProblem("tooLarge");
    else if (nextFile && !ACCEPTED_TYPES.includes(nextFile.type)) setProblem("type");
  }

  async function stamp(event: React.FormEvent) {
    event.preventDefault();
    if (!file || problem || status === "checking") return;
    setStatus("checking");
    try {
      const csrf = await (await fetch("/api/csrf", { cache: "no-store" })).json();
      const body = new FormData();
      body.append("image", file);
      const trimmedName = creatorName.trim();
      if (trimmedName) body.append("creator", trimmedName);
      const response = await fetch("/api/lab/stamp", {
        method: "POST",
        headers: { "x-csrf-token": (csrf as { token: string }).token },
        body,
      });

      if (response.status === 429) {
        setStatus("rateLimited");
        return;
      }
      if (!response.ok) {
        setStatus("error");
        return;
      }
      const stamped = await response.blob();
      // The invented file name the route sends back, so the browser download
      // keeps it (the visitor's own file name never comes back).
      const suggestedName = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1];
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(URL.createObjectURL(suggestedName ? new File([stamped], suggestedName, { type: stamped.type }) : stamped));
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  return (
    <form onSubmit={stamp} className="mx-auto max-w-xl">
      <div className="rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-6">
        <label htmlFor="stamp-file" className="font-display text-[18px] font-normal leading-snug tracking-tight">
          {t(locale, "lab.stamp.form.label")}
        </label>
        <p className="muted mt-2 text-sm leading-[1.6]">{t(locale, "lab.stamp.form.hint")}</p>
        <input
          id="stamp-file"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => pick(event.target.files?.[0] ?? null)}
          className="input mt-4"
        />
        {problem === "tooLarge" && (
          <p className="mt-3 text-sm leading-[1.6] text-[var(--danger, #a13a3a)]">{t(locale, "lab.stamp.error.tooLarge")}</p>
        )}
        {problem === "type" && (
          <p className="mt-3 text-sm leading-[1.6] text-[var(--danger, #a13a3a)]">{t(locale, "lab.stamp.error.type")}</p>
        )}

        <label htmlFor="stamp-creator" className="mt-6 block font-display text-[18px] font-normal leading-snug tracking-tight">
          {t(locale, "lab.stamp.form.name.label")}
        </label>
        <p className="muted mt-2 text-sm leading-[1.6]">{t(locale, "lab.stamp.form.name.hint")}</p>
        <input
          id="stamp-creator"
          type="text"
          value={creatorName}
          onChange={(event) => setCreatorName(event.target.value)}
          maxLength={MAX_CREATOR_CHARS}
          autoComplete="off"
          className="input mt-3"
        />

        <button
          type="submit"
          disabled={status === "checking" || !file || problem !== null}
          className="btn btn-primary mt-6"
        >
          {t(locale, "lab.stamp.form.button")}
        </button>
      </div>

      {/* Announced to screen readers only: the form's state changes. */}
      <p className="sr-only" role="status">
        {status === "checking"
          ? t(locale, "lab.stamp.form.checking")
          : status === "done"
            ? t(locale, "lab.stamp.result.title")
            : ""}
      </p>

      {status === "rateLimited" && (
        <div role="alert" className="mt-6 rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-6">
          <p className="muted text-sm leading-[1.75]">{t(locale, "lab.stamp.error.rateLimited")}</p>
        </div>
      )}

      {status === "error" && (
        <div role="alert" className="mt-6 rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-6">
          <p className="muted text-sm leading-[1.75]">{t(locale, "lab.stamp.error.body")}</p>
        </div>
      )}

      {status === "done" && downloadUrl && (
        <div className="mt-6">
          <h2 ref={resultHeadingRef} tabIndex={-1} className="eyebrow mb-4 block outline-none">
            {t(locale, "lab.stamp.result.title")}
          </h2>
          <div className="rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-6">
            <p className="muted text-sm leading-[1.75]">{t(locale, "lab.stamp.result.body")}</p>
            <a href={downloadUrl} download className="btn btn-primary mt-5">
              {t(locale, "lab.stamp.result.download")}
            </a>
            <div className="mt-6 border-t border-[var(--line)] pt-5">
              <p className="font-medium text-[var(--ink)]">{t(locale, "lab.stamp.result.verify")}</p>
              <p className="muted mt-2 text-sm leading-[1.75]">{t(locale, "lab.stamp.result.verifyNote")}</p>
              <Link href="/check-image" className="btn btn-secondary mt-4">
                {t(locale, "lab.stamp.result.verifyCta")}
              </Link>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
