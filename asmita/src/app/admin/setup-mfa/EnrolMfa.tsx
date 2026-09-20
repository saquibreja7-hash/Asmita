"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";

type Enrolment = { secret: string; qrSvg: string };

export function EnrolMfa() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "staged" | "confirming" | "error">("idle");
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [code, setCode] = useState("");
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
      setState("staged");
    } catch {
      setError("Network error. Try again.");
      setState("error");
    }
  }

  async function confirm() {
    setState("confirming");
    setError("");
    try {
      const res = await csrfFetch("/api/admin/mfa/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: code }),
      });
      if (!res.ok) {
        setError(res.status === 401 ? "That code did not match. Check your authenticator and try again."
          : "Could not finish setup. Try again or sign in again if your session expired.");
        setState("staged");
        return;
      }
      router.replace("/admin/cases");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
      setState("staged");
    }
  }

  if (!enrolment) {
    return (
      <div className="card text-center">
        <p className="text-[16px] leading-[1.5] text-[var(--color-graphite)]">
          Generate a secret, scan it, then enter a code from your authenticator to finish setup.
          If this page closes before confirmation, you can sign in and generate a new secret.
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
          Time-based, SHA1, 6 digits, 30 second period. This key is pending until you verify a code.
        </p>
      </div>
      <form className="card mt-4 !p-6" onSubmit={(event) => { event.preventDefault(); void confirm(); }}>
        <label htmlFor="mfa-confirm-code" className="block text-sm font-medium">6-digit authenticator code</label>
        <input id="mfa-confirm-code" className="field mt-2 font-mono" inputMode="numeric"
          autoComplete="one-time-code" maxLength={6} required value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} />
        <button className="btn btn-primary mt-4" type="submit"
          disabled={code.length !== 6 || state === "confirming"}>
          {state === "confirming" ? "Verifying…" : "Verify and finish setup"}
        </button>
        {error && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
      </form>
    </div>
  );
}
