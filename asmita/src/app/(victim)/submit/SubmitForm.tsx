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
    const response = await fetch(`/api/platforms/detect?url=${encodeURIComponent(first)}`);
    const data = (await response.json()) as { platformName?: string };
    setDetection(data.platformName || "Unknown - will be reviewed");
  }

  async function submit() {
    setError("");
    const createResponse = await csrfFetch("/api/cases/create", { method: "POST" });
    if (!createResponse.ok) {
      setError("Please sign in again before creating a case.");
      return;
    }
    const declarationResponse = await csrfFetch("/api/profile/declaration", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ acknowledged: true, version: "draft-2026-05-12", language: "en" }),
    });
    if (!declarationResponse.ok) {
      setError("Please confirm the declaration before submitting links.");
      return;
    }
    const created = (await createResponse.json()) as { caseId: string };
    const response = await csrfFetch(`/api/cases/${created.caseId}/urls`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ urls: urls.split(/\n+/).map((item) => item.trim()).filter(Boolean), declaration }),
    });
    if (!response.ok) {
      setError("Some links could not be accepted. Check for private or invalid URLs.");
      return;
    }
    router.push(`/case/${created.caseId}/confirmation`);
  }

  return (
    <form className="panel mt-8 max-w-3xl space-y-5 p-6">
      <div>
        <label className="text-sm font-bold" htmlFor="urls">
          Paste one URL per line
        </label>
        <textarea
          className="field mt-2 min-h-44"
          id="urls"
          onChange={(event) => {
            setUrls(event.target.value);
            void detect(event.target.value);
          }}
          required
          value={urls}
        />
        {detection ? <p className="mt-3 text-sm font-bold text-[var(--teal)]">Detected: {detection}</p> : null}
      </div>
      <label className="flex gap-3 rounded-md border border-[var(--border)] p-4">
        <input checked={declaration} onChange={(event) => setDeclaration(event.target.checked)} type="checkbox" />
        <span>
          I declare that I am reporting non-consensual intimate content involving me and I understand
          Asmita will not open or verify the content at these URLs.
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={!hydrated || !declaration || !urls.trim()} onClick={submit} type="button">
          Create case
        </button>
        <Link className="btn btn-secondary" href="/resources">
          Support resources
        </Link>
      </div>
      {error ? <p className="font-bold text-[var(--rose)]">{error}</p> : null}
    </form>
  );
}
