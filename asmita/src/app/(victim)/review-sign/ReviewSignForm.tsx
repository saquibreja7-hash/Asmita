"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";

type HashEntry = { hash: string; quality: number; clientVersion: string };

type Draft = {
  urls: string[];
  hashes: HashEntry[];
  platformIds: string[];
  emailPlatformIds: string[];
  formOnlyPlatforms: { id: string; name: string; formUrl: string }[];
  declaration: boolean;
};

type Step =
  | "loading"
  | "review"
  | "creating"
  | "sign"
  | "signing"
  | "hash-sign"
  | "hash-signing";

function CheckItem({ heading, detail }: { heading: string; detail: string }) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--teal-soft)]"
        aria-hidden
      >
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
          <path d="M1 4l2.5 2.5L9 1" stroke="var(--teal)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <div>
        <p className="text-sm font-semibold text-[var(--foreground)]">{heading}</p>
        <p className="muted mt-0.5 text-sm leading-[1.65]">{detail}</p>
      </div>
    </div>
  );
}

export function ReviewSignForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("loading");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [caseId, setCaseId] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [signature, setSignature] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        const raw = sessionStorage.getItem("asmita_submit_draft");
        if (!raw) { router.replace("/submit"); return; }
        const data = JSON.parse(raw) as Draft;
        if (!data.urls?.length && !data.hashes?.length) { router.replace("/submit"); return; }
        setDraft(data);
        setStep("review");
      } catch {
        router.replace("/submit");
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [router]);

  async function createCase() {
    if (!draft) return;
    setStep("creating");
    setError("");
    try {
      const createRes = await csrfFetch("/api/cases/create", { method: "POST" });
      if (!createRes.ok) {
        setError("Failed to create case. Please try again.");
        setStep("review");
        return;
      }
      const { caseId: newCaseId } = (await createRes.json()) as { caseId: string };

      if (draft.urls.length > 0) {
        const urlRes = await csrfFetch(`/api/cases/${newCaseId}/urls`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ urls: draft.urls, declaration: true }),
        });
        if (!urlRes.ok) {
          setError("Some links could not be accepted. Go back and check the URLs.");
          setStep("review");
          return;
        }
      }

      if (draft.hashes.length > 0) {
        const hashRes = await csrfFetch(`/api/cases/${newCaseId}/hashes`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            hashes: draft.hashes,
            declaration: true,
            platformIds: draft.platformIds,
          }),
        });
        if (!hashRes.ok) {
          setError("Image fingerprints could not be submitted. Please try again.");
          setStep("review");
          return;
        }

        // Hash-only path: no URLs
        if (draft.urls.length === 0) {
          if (draft.emailPlatformIds.length > 0) {
            // Has email platforms - show hash sign flow
            sessionStorage.removeItem("asmita_submit_draft");
            setCaseId(newCaseId);
            setPreviewUrl(`/api/cases/${newCaseId}/preview-hash-advisory`);
            setStep("hash-sign");
          } else {
            // All form-only - go to handoff for first form-only platform
            sessionStorage.removeItem("asmita_submit_draft");
            const first = draft.formOnlyPlatforms[0];
            if (first) {
              router.push(
                `/handoff/${newCaseId}?formUrl=${encodeURIComponent(first.formUrl)}&platformName=${encodeURIComponent(first.name)}`,
              );
            } else {
              router.push(`/case/${newCaseId}/confirmation`);
            }
          }
          return;
        }
      }

      sessionStorage.removeItem("asmita_submit_draft");
      setCaseId(newCaseId);

      const previewRes = await fetch(`/api/cases/${newCaseId}/preview-notice`);
      if (previewRes.ok) {
        setPreviewUrl(`/api/cases/${newCaseId}/preview-notice`);
        setStep("sign");
      } else {
        router.push(`/case/${newCaseId}`);
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setStep("review");
    }
  }

  async function signNotice() {
    if (!caseId) return;
    setStep("signing");
    setError("");
    try {
      const res = await csrfFetch(`/api/cases/${caseId}/sign-notice`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), contact: contact.trim(), signature: signature.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(
          data.error === "already_signed"
            ? "This notice has already been signed."
            : "Something went wrong. Please try again.",
        );
        setStep("sign");
        return;
      }
      router.push(`/case/${caseId}`);
    } catch {
      setError("The request timed out or failed. Please try again.");
      setStep("sign");
    }
  }

  async function signHashAdvisory() {
    if (!caseId || !draft) return;
    setStep("hash-signing");
    setError("");
    try {
      const res = await csrfFetch(`/api/cases/${caseId}/sign-hash-advisory`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          contact: contact.trim(),
          signature: signature.trim(),
          platformIds: draft.emailPlatformIds,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(
          data.error === "already_signed"
            ? "This notice has already been signed."
            : "Something went wrong. Please try again.",
        );
        setStep("hash-sign");
        return;
      }
      router.push(`/case/${caseId}`);
    } catch {
      setError("The request timed out or failed. Please try again.");
      setStep("hash-sign");
    }
  }

  const canSign =
    name.trim().length > 0 &&
    contact.trim().length > 0 &&
    signature.trim().length > 0 &&
    agreed &&
    step !== "signing" &&
    step !== "hash-signing";

  if (step === "loading") return null;

  if (step === "review" || step === "creating") {
    return (
      <div className="mx-auto max-w-5xl gap-16 md:flex md:items-start">
        <aside className="mb-12 md:mb-0 md:w-64 md:shrink-0">
          <div className="md:sticky md:top-28">
            <span className="pill"><span className="dot" />Review and sign</span>
            <p className="muted mt-5 text-sm leading-[1.75]">
              Check the details below before your case is created. Once you sign, the notice is authorised for dispatch.
            </p>
            <div className="mt-8 space-y-4">
              <CheckItem heading="Review your submission" detail="Check the URLs and fingerprints you are about to submit." />
              <CheckItem heading="Sign the notice" detail="Add your name and signature to authorise dispatch." />
              <CheckItem heading="Case created" detail="Your reference number is issued and the notice queued for sending." />
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1 space-y-8">
          <div>
            <h1 className="font-display text-[28px] font-normal leading-[1.2] tracking-tight md:text-[36px]">
              Review your submission.
            </h1>
            <p className="muted mt-2 text-sm leading-[1.75]">
              Check these details before continuing. Your case will be created on the next step.
            </p>
          </div>

          {draft && draft.urls.length > 0 && (
            <div
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6"
              style={{ boxShadow: "var(--shadow-soft)" }}
            >
              <p className="text-sm font-semibold text-[var(--foreground)]">
                Links ({draft.urls.length})
              </p>
              <ul className="mt-3 space-y-1.5">
                {draft.urls.map((url, i) => (
                  <li key={i} className="break-all font-mono text-[13px] text-[var(--muted)]">
                    {url}
                  </li>
                ))}
              </ul>
              {draft.urls.length > 1 && (
                <p className="muted mt-4 text-xs leading-[1.65]">
                  You will sign a notice for the first link on the next screen. Notices for remaining links can be signed from your case dashboard.
                </p>
              )}
            </div>
          )}

          {draft && draft.hashes.length > 0 && (
            <div
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6"
              style={{ boxShadow: "var(--shadow-soft)" }}
            >
              <p className="text-sm font-semibold text-[var(--foreground)]">
                Digital fingerprints ({draft.hashes.length})
              </p>
              <ul className="mt-3 space-y-1.5">
                {draft.hashes.map((h, i) => (
                  <li key={i} className="font-mono text-[13px] text-[var(--muted)]">
                    {h.hash.slice(0, 16)}... (quality {h.quality}/100)
                  </li>
                ))}
              </ul>
              {draft.platformIds.length > 0 && (
                <p className="muted mt-3 text-xs leading-[1.65]">
                  Platforms selected: {draft.platformIds.length}
                  {draft.emailPlatformIds.length > 0 && ` (${draft.emailPlatformIds.length} will receive a signed notice)`}
                  {draft.formOnlyPlatforms.length > 0 && ` (${draft.formOnlyPlatforms.length} require a form submission)`}
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm font-semibold text-[var(--rose)]">{error}</p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn btn-primary"
              disabled={step === "creating"}
              onClick={createCase}
            >
              {step === "creating" ? "Creating case..." : "Create case and preview notice"}
            </button>
            <a className="btn btn-secondary" href="/submit">
              Go back
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Shared sign form used for both URL notice and hash advisory
  const isHashSign = step === "hash-sign" || step === "hash-signing";
  const onSign = isHashSign ? signHashAdvisory : signNotice;
  const signingInProgress = step === "signing" || step === "hash-signing";

  return (
    <div className="mx-auto max-w-5xl gap-16 md:flex md:items-start">
      <aside className="mb-12 md:mb-0 md:w-64 md:shrink-0">
        <div className="md:sticky md:top-28">
          <span className="pill">
            <span className="dot" />
            {isHashSign ? "Sign fingerprint notice" : "Sign notice"}
          </span>
          <p className="muted mt-5 text-sm leading-[1.75]">
            {isHashSign
              ? "Read the fingerprint advisory in full. Your signature authorises Asmita to send it to the selected platforms on your behalf."
              : "Read the notice in full. Your signature authorises Asmita to send it on your behalf."}
          </p>
          <div className="mt-8 space-y-4">
            <CheckItem heading="Read the notice" detail="Scroll through the document on the right to review what will be sent." />
            <CheckItem heading="Add your details" detail="Enter your name and contact so the platform can respond to you." />
            <CheckItem heading="Sign to authorise" detail="Type your name as a digital signature to confirm the declaration." />
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1 space-y-8">
        <div>
          <h1 className="font-display text-[28px] font-normal leading-[1.2] tracking-tight md:text-[36px]">
            {isHashSign ? "Review and sign your fingerprint notice." : "Review and sign your notice."}
          </h1>
          <p className="muted mt-2 text-sm leading-[1.75]">
            Read the notice in full, then add your details and signature below.
          </p>
        </div>

        <div
          className="overflow-hidden rounded-xl border border-[var(--border)]"
          style={{ boxShadow: "var(--shadow-soft)" }}
        >
          <div className="border-b border-[var(--hairline)] bg-[var(--surface)] px-5 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
              {isHashSign ? "Fingerprint advisory preview" : "Notice preview"}
            </p>
          </div>
          <iframe
            src={previewUrl}
            className="w-full"
            style={{ height: "520px", border: "none" }}
            title={isHashSign ? "Fingerprint advisory preview" : "Notice preview"}
          />
        </div>

        <div
          className="space-y-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6"
          style={{ boxShadow: "var(--shadow-soft)" }}
        >
          <p className="text-sm font-semibold text-[var(--foreground)]">Your details</p>

          <div>
            <label htmlFor="rs-name" className="block text-sm font-semibold text-[var(--foreground)]">
              Full name
            </label>
            <p className="muted mt-1 text-sm">This will appear in the notice as the complainant.</p>
            <input
              id="rs-name"
              type="text"
              className="field mt-2"
              placeholder="Your full legal name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              autoComplete="name"
            />
          </div>

          <div>
            <label htmlFor="rs-contact" className="block text-sm font-semibold text-[var(--foreground)]">
              Contact (email or phone)
            </label>
            <p className="muted mt-1 text-sm">Included so the platform can contact you if needed.</p>
            <input
              id="rs-contact"
              type="text"
              className="field mt-2"
              placeholder="email@example.com or +91 98765 43210"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              maxLength={200}
              autoComplete="email"
            />
          </div>
        </div>

        <div
          className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6"
          style={{ boxShadow: "var(--shadow-soft)" }}
        >
          <p className="text-sm font-semibold text-[var(--foreground)]">Signature</p>
          <p className="muted text-sm leading-[1.6]">
            Type your name as your digital signature. By signing, you confirm the declaration in the notice is accurate.
          </p>
          <input
            id="rs-signature"
            type="text"
            className="field font-display text-[18px] italic"
            placeholder="Type your full name"
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            maxLength={100}
            autoComplete="off"
          />
        </div>

        <div className="hairline" />

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 shrink-0 accent-[var(--teal)]"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span className="text-sm leading-[1.65] text-[var(--foreground)]">
            I confirm that the information above is accurate and I authorise Asmita to send this{" "}
            {isHashSign ? "fingerprint advisory" : "takedown notice"} on my behalf.
          </span>
        </label>

        {error && (
          <p className="text-sm font-semibold text-[var(--rose)]">{error}</p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canSign}
            onClick={onSign}
          >
            {signingInProgress ? "Signing..." : "Sign and submit"}
          </button>
          <a className="btn btn-secondary" href={`/case/${caseId}`}>
            Skip for now
          </a>
        </div>
      </div>
    </div>
  );
}
