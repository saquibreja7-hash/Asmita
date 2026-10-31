"use client";

import { useState } from "react";
import { csrfFetch } from "@/lib/client-csrf";

export function AdminLoginForm() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [totp, setTotp] = useState("");
  const [step, setStep] = useState<"email" | "verify">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function requestOtp() {
    setLoading(true);
    setError("");
    try {
      const response = await csrfFetch("/api/admin/auth/request-otp", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        setError("This admin email cannot receive a code right now.");
        return;
      }
      setStep("verify");
    } catch {
      setError("The request timed out. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function verify() {
    setLoading(true);
    setError("");
    try {
      const response = await csrfFetch("/api/admin/auth/verify", {
        method: "POST",
        body: JSON.stringify({ email, otp, totp }),
      });
      if (response.status === 429) {
        setError("Too many attempts. Please wait 15 minutes and try again.");
        return;
      }
      if (!response.ok) {
        setError("The email code or authenticator code did not match.");
        return;
      }
      // A first sign-in with an enrolment code goes to authenticator setup.
      // A full page load, not router.push: the admin layout is shared by these
      // routes and must re-check the new session cookie.
      const { redirectTo } = (await response.json()) as { redirectTo?: string };
      window.location.assign(redirectTo === "/admin/setup-mfa" ? "/admin/setup-mfa" : "/admin/cases");
    } catch {
      setError("The request timed out. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      className="space-y-8"
      onSubmit={(e) => {
        e.preventDefault();
        if (step === "email") requestOtp();
        else verify();
      }}
    >
      <div className="text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
          {step === "email" ? "Step 01 of 02" : "Step 02 of 02"}
        </p>
        <h2 className="font-display mt-3 text-[24px] font-normal leading-[1.22] tracking-tight md:text-[32px] md:leading-[1.18]">
          {step === "email" ? "Your admin email." : "Two codes, please."}
        </h2>
      </div>

      <Row
        label="Admin email"
        hint="We will send a 6-digit code to this address."
        htmlFor="admin-email"
      >
        <input
          className="field"
          id="admin-email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
        />
      </Row>

      {step === "verify" && (
        <>
          <Row
            label="Email code"
            hint="The 6-digit code we just sent to your inbox."
            htmlFor="admin-otp"
          >
            <input
              className="field font-mono text-center text-2xl tracking-[0.4em]"
              id="admin-otp"
              inputMode="numeric"
              maxLength={6}
              onChange={(event) =>
                setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              value={otp}
              autoComplete="one-time-code"
            />
          </Row>
          <Row
            label="Authenticator code"
            hint="6-digit code from your authenticator app, or the 12-digit setup code you were given."
            htmlFor="admin-totp"
          >
            <input
              className="field font-mono text-center text-2xl tracking-[0.2em]"
              id="admin-totp"
              inputMode="numeric"
              maxLength={12}
              onChange={(event) =>
                setTotp(event.target.value.replace(/\D/g, "").slice(0, 12))
              }
              value={totp}
            />
          </Row>
        </>
      )}

      {error && (
        <p className="text-center text-sm font-medium text-[var(--rose)]">
          {error}
        </p>
      )}

      <div className="pt-2 text-center">
        <button
          className="btn btn-primary"
          disabled={
            loading ||
            !email ||
            (step === "verify" && (otp.length !== 6 || (totp.length !== 6 && totp.length !== 12)))
          }
          type="submit"
        >
          {loading
            ? "Working…"
            : step === "email"
            ? "Send admin code"
            : "Open admin workspace"}
        </button>
      </div>
    </form>
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
