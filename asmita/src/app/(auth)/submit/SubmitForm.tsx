"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { computePdqHash, PDQ_CLIENT_VERSION } from "@/lib/pdq/pdq";
import type { HashPickerPlatform } from "@/lib/hash-submission";
import { DRAFT_KEY } from "@/lib/eligibility";
import { t, type Locale } from "@/lib/i18n";
import { checkLink, matchPlatform, type LinkCheckError, type PlatformPattern } from "@/lib/link-check";
import { FormHandoff } from "@/components/FormHandoff";
import { UnsureHandoff } from "@/components/UnsureHandoff";

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
  // Without a session the draft waits in this tab while the email is confirmed.
  signedIn: boolean;
  // Names and domains only, for naming the platform beside each link.
  knownPlatforms: (PlatformPattern & { id: string; formUrl?: string })[];
  enableHashUpload?: boolean;
  platforms?: HashPickerPlatform[];
  locale: Locale;
  children: React.ReactNode;
};

type LineCheck = { line: string; url?: string; platform?: string; problem?: LinkCheckError | "duplicate" };

const LINK_PROBLEM_KEY = {
  invalid_url: "submit.link.invalid",
  blocked_scheme: "submit.link.invalid",
  local_or_private_address: "submit.link.local",
  duplicate: "submit.link.duplicate",
} as const;

// Checks every pasted line in the browser with the same rules the server uses,
// so a mistake shows beside the line instead of on the review step, and
// nothing is sent anywhere to check it.
function checkLines(text: string, knownPlatforms: PlatformPattern[]): LineCheck[] {
  const seen = new Set<string>();
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const checked = checkLink(line);
      if (!checked.ok) return { line, problem: checked.error };
      const url = checked.url.toString();
      // www. and a trailing slash do not make a different link.
      const key = checked.domain + checked.url.pathname.replace(/\/$/, "") + checked.url.search;
      if (seen.has(key)) return { line, problem: "duplicate" as const };
      seen.add(key);
      return { line, url, platform: matchPlatform(checked.domain, knownPlatforms)?.name };
    });
}

export function SubmitForm({ signedIn, knownPlatforms, enableHashUpload = false, platforms = [], locale, children }: Props) {
  const router = useRouter();
  const [urls, setUrls] = useState("");
  const [declaration, setDeclaration] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [handoff, setHandoff] = useState<{ name: string; formUrl: string }[] | null>(null);
  const [remainingDraft, setRemainingDraft] = useState<string | null>(null);

  const [hashFiles, setHashFiles] = useState<FileHashState[]>([]);
  const [selectedPlatformIds, setSelectedPlatformIds] = useState<string[]>([]);
  // "Not sure where it is, or not posted yet": never a dead end without a platform.
  const [unsure, setUnsure] = useState(false);
  const [showUnsure, setShowUnsure] = useState(false);
  // The fingerprint section is optional, so it starts folded away.
  const [hashOpen, setHashOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setHydrated(true), 0);
    return () => window.clearTimeout(id);
  }, []);

  async function onSelectFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []).slice(0, MAX_HASH_FILES);
    if (selected.length === 0) return;
    setHashOpen(true);
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
  const lineChecks = checkLines(urls, knownPlatforms);
  const parsedUrls = lineChecks.flatMap((c) => (c.url ? [c.url] : []));
  const skippedLines = lineChecks.filter((c) => c.problem).length;
  const hashOnly = hashedFiles.length > 0 && parsedUrls.length === 0;
  const hasAnyContent = parsedUrls.length > 0 || hashedFiles.length > 0;
  const canSubmit = declaration && hasAnyContent && (!hashOnly || selectedPlatformIds.length > 0 || unsure);

  function togglePlatform(id: string) {
    setUnsure(false);
    setSelectedPlatformIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleUnsure() {
    setSelectedPlatformIds([]);
    setUnsure((prev) => !prev);
  }

  // The declaration is logged on the review step, once there is a session.
  function submit() {
    setError("");
    if (hashOnly && unsure) {
      setShowUnsure(true);
      return;
    }
    setSubmitting(true);
    try {
      const selectedPlatforms = hashOnly ? platforms.filter((p) => selectedPlatformIds.includes(p.id)) : [];
      const formLinks = new Map<string, { name: string; formUrl: string }>();
      const remainingUrls = parsedUrls.filter((url) => {
        const checked = checkLink(url);
        const platform = checked.ok ? matchPlatform(checked.domain, knownPlatforms) : null;
        if (!platform?.formUrl) return true;
        formLinks.set(platform.id, { name: platform.name, formUrl: platform.formUrl });
        return false;
      });
      const remainingPlatforms = selectedPlatforms.filter((platform) => {
        // Only a URL in the human-verified directory may be offered as a handoff.
        const verified = knownPlatforms.find((p) => p.formUrl && p.formUrl === platform.formUrl);
        if (!verified?.formUrl) return true;
        formLinks.set(verified.id, { name: verified.name, formUrl: verified.formUrl });
        return false;
      });
      const hasRemaining = remainingUrls.length > 0 || (hashOnly && remainingPlatforms.length > 0);
      const draft = hasRemaining ? JSON.stringify({
        urls: remainingUrls,
        hashes: hashedFiles.map((f) => ({ hash: f.hash!, quality: f.quality ?? 0, clientVersion: PDQ_CLIENT_VERSION })),
        platformIds: hashOnly ? remainingPlatforms.map((p) => p.id) : [],
        emailPlatformIds: remainingPlatforms.filter((p) => p.hasEmail).map((p) => p.id),
        formOnlyPlatforms: [],
        declaration: true,
      }) : null;
      if (formLinks.size > 0) {
        sessionStorage.removeItem(DRAFT_KEY);
        setRemainingDraft(draft);
        setHandoff([...formLinks.values()]);
      } else if (draft) {
        sessionStorage.setItem(DRAFT_KEY, draft);
        router.push(signedIn ? "/review-sign" : "/register");
      }

    } catch {
      setError(t(locale, "submit.error.generic"));
    } finally {
      setSubmitting(false);
    }
  }

  if (showUnsure) {
    return <UnsureHandoff locale={locale} onBack={() => setShowUnsure(false)} />;
  }

  if (handoff) {
    return <FormHandoff locale={locale} links={handoff} fingerprintNotSent={hashedFiles.length > 0} onBack={() => setHandoff(null)} onContinue={remainingDraft ? () => {
      try {
        sessionStorage.setItem(DRAFT_KEY, remainingDraft);
        router.push(signedIn ? "/review-sign" : "/register");
      } catch { setError(t(locale, "submit.error.generic")); }
    } : undefined} error={error} />;
  }

  const lowQuality = hashFiles.some((f) => f.status === "hashed" && (f.quality ?? 100) < 50);

  return (
    <div>
      {children}
      <div className="mt-6 space-y-6">
      <div className="filing-card">
      {/* Step 1: the links */}
      <Step n={1}>
          <div>
            <label htmlFor="urls" className="block text-[18px] font-medium leading-[1.3] text-[var(--ink)]">
              {t(locale, "submit.urls.label")}
            </label>
            <p className="muted mt-1 text-sm leading-[1.5]">
              {t(locale, "submit.urls.sub")}
            </p>
          </div>
        <textarea
          className="filing-input mt-4 min-h-32"
          id="urls"
          onChange={(e) => setUrls(e.target.value)}
          aria-describedby={lineChecks.length > 0 ? "url-checks" : undefined}
          value={urls}
          placeholder={"https://example.com/post/1234\nhttps://example.com/post/5678"}
          spellCheck={false}
        />

        {lineChecks.length > 0 && (
          <ul id="url-checks" className="mt-3 space-y-2 text-sm" aria-live="polite">
            {lineChecks.map((c, i) => (
              <li key={`${c.line}-${i}`} className="flex items-center gap-3 rounded-[var(--radius-box)] border border-[var(--line)] bg-white px-3 py-2.5">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white ${
                    c.problem ? "bg-[var(--danger)]" : "bg-[var(--brand)]"
                  }`}
                  aria-hidden
                >
                  {c.problem ? "✕" : "✓"}
                </span>
                <span className="min-w-0 flex-1 truncate text-[var(--ink)]">{c.line}</span>
                {c.problem ? (
                  <span className="shrink-0 font-medium text-[var(--danger)]">{t(locale, LINK_PROBLEM_KEY[c.problem])}</span>
                ) : (
                  <span className="shrink-0 rounded-full bg-[var(--brand-soft)] px-2.5 py-0.5 text-[13px] font-medium text-[var(--brand)]">
                    {c.platform ?? t(locale, "submit.link.unknown")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {lineChecks.some((c) => c.url && !c.platform) && <p className="mt-3 rounded-[var(--radius-box)] bg-[var(--brand-soft)] p-4 text-sm leading-[1.7] text-[var(--ink)]">{locale === "hi" ? "हम इस प्लेटफ़ॉर्म को अभी नहीं पहचानते। आप जाँच का अनुरोध कर सकते हैं; हम रिपोर्टिंग का सुरक्षित रास्ता खोजने की कोशिश करेंगे, लेकिन संपर्क या सामग्री हटने का वादा नहीं कर सकते।" : "We don’t recognize this platform yet. You can request an investigation. We’ll try to find a safe reporting route, but cannot promise to contact the platform or secure removal."}</p>}
        {skippedLines > 0 && parsedUrls.length > 0 && (
          <p className="mt-2 text-xs text-[var(--text-muted)]">{t(locale, "submit.link.skipNote")}</p>
        )}

        <details className="group mt-4">
          <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-[var(--brand)] [&::-webkit-details-marker]:hidden">
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-current text-[11px]" aria-hidden>?</span>
            {t(locale, "submit.howCopy.title")}
          </summary>
          <ol className="mt-3 space-y-2 text-sm leading-[1.5] text-[var(--text)]">
            {(["submit.howCopy.1", "submit.howCopy.2", "submit.howCopy.3"] as const).map((key, i) => (
              <li key={key} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[12px] font-semibold text-[var(--brand)]">
                  {i + 1}
                </span>
                <span className="pt-0.5">{t(locale, key)}</span>
              </li>
            ))}
          </ol>
        </details>

      {/* Hash section: optional, folded until opened or a photo is chosen */}
      {enableHashUpload && (
        <details
          className="group mt-5 rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)]"
          open={hashOpen}
          onToggle={(e) => setHashOpen(e.currentTarget.open)}
        >
          <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)]" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <path d="M10 13V4M10 4l-3 3M10 4l3 3" stroke="var(--brand)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3 14v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1" stroke="var(--brand)" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-medium text-[var(--ink)]">
                {t(locale, "submit.hash.title")}{" "}
                <span className="font-normal text-[var(--text-muted)]">{t(locale, "submit.hash.optional")}</span>
              </span>
              <span className="muted block text-sm">{t(locale, "submit.hash.fileHint")}</span>
            </span>
            <span className="text-[22px] leading-none text-[var(--text-muted)] transition-transform group-open:rotate-45" aria-hidden>+</span>
          </summary>

          <div className="space-y-5 border-t border-[var(--line)] px-5 pb-5 pt-4">
          <div>
            <p className="muted text-sm leading-[1.6]">
              {t(locale, "submit.hash.sub")}
            </p>
            <p className="muted mt-3 text-sm leading-[1.6]">{t(locale, "submit.hash.stopncii.text")}</p>
            <a href="https://stopncii.org/" target="_blank" rel="noopener noreferrer" className="link-underline text-sm">{t(locale, "submit.hash.stopncii.link")}</a>

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
            className="btn btn-secondary w-full justify-center"
          >
            {t(locale, "submit.hash.fileLabel")}
          </button>

          {hashFiles.length > 0 && (
            <ul className="space-y-1.5 text-sm" aria-live="polite">
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

          {hashFiles.some((f) => f.status === "hashing") && (
            <p className="muted text-sm leading-[1.6]">
              {t(locale, "submit.hash.processingNote")}
            </p>
          )}

          {hashedFiles.length > 0 && hashFiles.every((f) => f.status !== "hashing") && (
            <p className="text-sm leading-[1.6] font-medium text-[var(--brand)]">
              {t(locale, "submit.hash.doneNote")}
            </p>
          )}

          {lowQuality && (
            <p className="text-sm text-[var(--warning)]">
              {t(locale, "submit.hash.lowQuality")}
            </p>
          )}

          {hashedFiles.length > 0 && parsedUrls.length === 0 && (
            <div>
              <p className="block text-sm font-medium text-[var(--ink)]">
                {t(locale, "submit.hash.platforms.title")}
              </p>
              {platforms.length > 0 && (
                <p className="muted mt-1 text-sm leading-[1.6]">
                  {t(locale, "submit.hash.platforms.sub")}
                </p>
              )}
              <ul className="mt-3 space-y-2">
                {platforms.map((p) => (
                  <li key={p.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] px-4 py-3 hover:border-[var(--brand)] transition-colors">
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 accent-[var(--brand)]"
                        checked={selectedPlatformIds.includes(p.id)}
                        onChange={() => togglePlatform(p.id)}
                      />
                      <span className="flex-1 text-sm text-[var(--ink)]">{p.name}</span>
                      {!p.hasEmail && (
                        <span className="shrink-0 text-[11px] text-[var(--text-muted)]">{t(locale, "submit.hash.platforms.formNote")}</span>
                      )}
                    </label>
                  </li>
                ))}
                <li>
                  <label className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] px-4 py-3 hover:border-[var(--brand)] transition-colors">
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 accent-[var(--brand)]"
                      checked={unsure}
                      onChange={toggleUnsure}
                    />
                    <span className="flex-1 text-sm text-[var(--ink)]">{t(locale, "submit.hash.platforms.unsure")}</span>
                  </label>
                </li>
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
        </details>
      )}

      </Step>

      {/* Step 2: confirm it is you */}
      <Step n={2} last>
        <h2 className="subsection-title">{t(locale, "submit.confirm.title")}</h2>
        <label
          className={`mt-4 flex cursor-pointer items-start gap-3 rounded-[var(--radius-box)] border px-4 py-4 transition-colors ${
            declaration ? "border-[var(--brand)] bg-[var(--brand-soft)]" : "border-[var(--line)] bg-[var(--page)]"
          }`}
        >
          <input
            checked={declaration}
            onChange={(e) => setDeclaration(e.target.checked)}
            type="checkbox"
            className="mt-1 h-5 w-5 shrink-0 accent-[var(--brand)]"
          />
          <span className="text-[15px] leading-[1.6] text-[var(--ink)]">
            {t(locale, "submit.declaration.text")}
          </span>
        </label>
      </Step>
      </div>

      {error && (
        <p className="text-sm font-medium text-[var(--danger)]">{error}</p>
      )}

      {!canSubmit && (
        <p className="text-sm text-[var(--text-muted)]" role="status">
          {t(
            locale,
            !hasAnyContent
              ? "submit.hint.content"
              : hashOnly && selectedPlatformIds.length === 0 && !unsure
                ? "submit.hint.hashPlatform"
                : "submit.hint.declaration",
          )}
        </p>
      )}
      <div>
        <button
          className="btn btn-primary btn-arrow w-full justify-center sm:w-auto"
          disabled={!hydrated || !canSubmit || submitting}
          onClick={submit}
          type="button"
        >
          {submitting ? t(locale, "submit.cta.saving") : t(locale, "submit.cta.review")}
        </button>
      </div>

      </div>
    </div>
  );
}

// A numbered step on a vertical line that runs down to the next step. On
// phones the number sits above the step so the fields get the full width.
function Step({ n, last = false, children }: { n: number; last?: boolean; children: React.ReactNode }) {
  return (
    <section className={`relative sm:grid sm:grid-cols-[32px_minmax(0,1fr)] sm:gap-x-4 ${last ? "" : "pb-8"}`}>
      {!last && <span className="absolute bottom-0 left-[15.5px] top-10 hidden w-px bg-[var(--line)] sm:block" aria-hidden />}
      <span
        className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--brand)] text-[14px] font-semibold text-white sm:mb-0"
        aria-hidden
      >
        {n}
      </span>
      <div className="min-w-0 sm:pt-1">{children}</div>
    </section>
  );
}
