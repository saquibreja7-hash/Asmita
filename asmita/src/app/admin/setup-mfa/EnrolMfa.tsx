"use client";

import { useState } from "react";
import { csrfFetch } from "@/lib/client-csrf";

type Enrolment = { secret: string; qrSvg: string };

export function EnrolMfa() {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [error, setError] = useState("");

  async function enrol() {
    setState("loading");
    setError("");
    try {
      const res = await csrfFetch("/api/admin/mfa/enroll", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(
          body.error === "already_enrolled"
            ? "An authenticator is already enrolled for this account. Ask a super admin to reset it first."
            : "Could not create a secret. Try again.",
        );
        setState("error");
        return;
      }
      const data = (await res.json()) as Enrolment;
      setEnrolment(data);
      setState("done");
    } catch {
      setError("Network error. Try again.");
      setState("error");
    }
  }

  if (state !== "done" || !enrolment) {
    return (
      <div className="card text-center">
        <p className="text-[16px] leading-[1.5] text-[var(--color-graphite)]">
          Your account has no authenticator yet. Generate a secret, scan it, then log in again
          with a code from your app. The secret is shown once and never again.
        </p>
        <button className="btn btn-primary mt-8" onClick={enrol} disabled={state === "loading"} type="button">
          {state === "loading" ? "Generating…" : "Generate my authenticator secret"}
        </button>
        {error && <p className="mt-4 text-sm text-[var(--danger)]">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <div
        className="card !p-6"
        // SVG produced server-side by the qrcode library from a URI we built; no user input.
        dangerouslySetInnerHTML={{ __html: enrolment.qrSvg }}
      />
      <div className="card mt-4 !p-6">
        <p className="eyebrow">Manual entry key</p>
        <p className="mt-2 break-all font-mono text-sm tracking-widest select-all">
          {enrolment.secret.match(/.{1,4}/g)?.join(" ") ?? enrolment.secret}
        </p>
        <p className="mt-3 text-xs text-[var(--color-graphite)]">
          Time-based, SHA1, 6 digits, 30 second period. Store it in your authenticator now: this
          page will not show it again.
        </p>
      </div>
      <p className="mt-6 text-center text-sm">
        <a className="text-link" href="/admin/login">
          Continue to admin login
        </a>
      </p>
    </div>
  );
}
