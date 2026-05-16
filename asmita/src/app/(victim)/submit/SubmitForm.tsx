"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";

export function SubmitForm() {
  const router = useRouter();
  const [urls, setUrls] = useState("");
  const [declaration, setDeclaration] = useState(false);
  const [detection, setDetection] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setHydrated(true), 0);
    return () => window.clearTimeout(id);
  }, []);

  async function detect(value: string) {
    const first = value.split(/\s+/).find(Boolean);
    if (!first) {
      setDetection("");
      return;
    }
    const response = await fetch(
      `/api/platforms/detect?url=${encodeURIComponent(first)}`
    );
    const data = (await response.json()) as { platformName?: string };
    setDetection(data.platformName || "Unknown — will be reviewed");
  }

  async function submit() {
    setError("");
    setSubmitting(true);
    const createResponse = await csrfFetch("/api/cases/create", {
      method: "POST",
    });
    if (!createResponse.ok) {
      setError("Please sign in again before creating a case.");
      setSubmitting(false);
      return;
    }
    const declarationResponse = await csrfFetch(
      "/api/profile/declaration",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          acknowledged: true,
          version: "draft-2026-05-12",
          language: "en",
        }),
      }
    );
    if (!declarationResponse.ok) {
      setError("Please confirm the declaration before submitting links.");
      setSubmitting(false);
      return;
    }
    const created = (await createResponse.json()) as { caseId: string };
    const response = await csrfFetch(`/api/cases/${created.caseId}/urls`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        urls: urls
          .split(/\n+/)
          .map((item) => item.trim())
          .filter(Boolean),
        declaration,
      }),
    });
    if (!response.ok) {
      setError(
        "Some links could not be accepted. Check for private or invalid URLs."
      );
      setSubmitting(false);
      return;
    }
    router.push(`/case/${created.caseId}/confirmation`);
  }

  const lineCount = urls
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean).length;

  return (
    <div className="space-y-8">
      <Row
        label="Paste one URL per line"
        hint="Up to ten URLs per twenty-four hours. Private IPs, localhost, file URLs, and unsupported schemes are rejected."
        htmlFor="urls"
      >
        <textarea
          className="field min-h-44 font-mono text-[14px] leading-[1.7]"
          id="urls"
          onChange={(event) => {
            setUrls(event.target.value);
            void detect(event.target.value);
          }}
          required
          value={urls}
          placeholder="https://example.com/post/1234&#10;https://example.com/post/5678"
          spellCheck={false}
        />
        <div className="muted mt-2 flex items-center justify-between text-xs">
          <span>
            {lineCount} {lineCount === 1 ? "link" : "links"}
          </span>
          {detection && (
            <span className="text-[var(--teal)]">Detected: {detection}</span>
          )}
        </div>
      </Row>

      <label className="flex cursor-pointer items-start gap-3 rounded-[14px] border border-[var(--hairline)] bg-white p-4 transition-colors hover:border-[var(--border)]">
        <input
          checked={declaration}
          onChange={(event) => setDeclaration(event.target.checked)}
          type="checkbox"
          className="mt-[3px] h-4 w-4 accent-[var(--teal)]"
        />
        <span className="font-display text-[15px] leading-[1.55] tracking-tight text-[var(--foreground)] md:text-[16px]">
          I declare that I am reporting non-consensual intimate content
          involving me, and I understand that Asmita will not open or verify
          the content at these URLs.
        </span>
      </label>

      {error && (
        <p className="text-center text-sm font-semibold text-[var(--rose)]">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
        <button
          className="btn btn-primary"
          disabled={!hydrated || !declaration || !urls.trim() || submitting}
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

function Row({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="font-display text-[18px] leading-[1.3] tracking-tight text-[var(--foreground)]"
      >
        {label}
      </label>
      <p className="muted mt-1 text-sm leading-[1.6]">{hint}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}
