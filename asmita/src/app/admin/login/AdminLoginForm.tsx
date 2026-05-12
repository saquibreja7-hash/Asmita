"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";

export function AdminLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [totp, setTotp] = useState("");
  const [step, setStep] = useState<"email" | "verify">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function requestOtp() {
    setLoading(true);
    setError("");
    const response = await csrfFetch("/api/admin/auth/request-otp", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    if (!response.ok) {
      setError("This admin email cannot receive a code right now.");
      return;
    }
    setStep("verify");
  }

  async function verify() {
    setLoading(true);
    setError("");
    const response = await csrfFetch("/api/admin/auth/verify", {
      method: "POST",
      body: JSON.stringify({ email, otp, totp }),
    });
    setLoading(false);
    if (!response.ok) {
      setError("The email code or MFA code did not match.");
      return;
    }
    router.push("/admin/cases");
  }

  return (
    <form className="panel mt-8 max-w-lg space-y-5 p-6">
      <label className="block text-sm font-bold" htmlFor="admin-email">
        Admin email
        <input
          className="field mt-2"
          id="admin-email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </label>
      {step === "verify" ? (
        <>
          <label className="block text-sm font-bold" htmlFor="admin-otp">
            Email code
            <input
              className="field mt-2"
              id="admin-otp"
              inputMode="numeric"
              maxLength={6}
              onChange={(event) => setOtp(event.target.value)}
              value={otp}
            />
          </label>
          <label className="block text-sm font-bold" htmlFor="admin-totp">
            Authenticator code
            <input
              className="field mt-2"
              id="admin-totp"
              inputMode="numeric"
              maxLength={6}
              onChange={(event) => setTotp(event.target.value)}
              value={totp}
            />
          </label>
        </>
      ) : null}
      {error ? <p className="text-sm font-bold text-[var(--rose)]">{error}</p> : null}
      <button
        className="btn btn-primary w-full"
        disabled={loading || !email || (step === "verify" && (otp.length !== 6 || totp.length !== 6))}
        onClick={step === "email" ? requestOtp : verify}
        type="button"
      >
        {step === "email" ? "Send admin code" : "Open admin workspace"}
      </button>
    </form>
  );
}
