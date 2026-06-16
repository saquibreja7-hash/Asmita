"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";
import { t, type Locale } from "@/lib/i18n";

type Step = "age" | "email" | "otp";

export function RegisterForm({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("age");
  const [ageConfirmed, setAgeConfirmed] = useState<"adult" | "minor" | null>(null);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setHydrated(true), 0);
    return () => window.clearTimeout(id);
  }, []);

  function continueFromAge() {
    if (ageConfirmed === "minor") {
      router.push("/minor-support");
    } else {
      setStep("email");
    }
  }

  async function requestOtp() {
    setLoading(true);
    setError("");
    try {
      const response = await csrfFetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(`Error ${response.status}: ${body.error ?? "unknown"}`);
        return;
      }
      setStep("otp");
    } catch {
      setError(t(locale, "reg.error.timeout"));
    } finally {
      setLoading(false);
    }
  }

  async function verify() {
    setLoading(true);
    setError("");
    try {
      const response = await csrfFetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, otp, ageOver18: true }),
      });
      if (!response.ok) {
        setError(t(locale, "reg.error.codeNoMatch"));
        return;
      }
      router.push("/submit");
    } catch {
      setError(t(locale, "reg.error.timeout"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <ProgressBar step={step} locale={locale} />

      {step === "age" && (
        <div className="mt-8">
          <h2 className="font-display text-[28px] font-normal leading-[1.2] tracking-tight md:text-[36px]">
            {t(locale, "reg.age.title")}
          </h2>
          <p className="muted mt-2 text-sm leading-[1.75]">
            {t(locale, "reg.age.sub")}
          </p>
          <div className="mt-8 space-y-3">
            <button
              type="button"
              onClick={() => setAgeConfirmed("adult")}
              className={`w-full rounded-xl border p-4 text-left transition-colors ${
                ageConfirmed === "adult"
                  ? "border-[var(--teal)] bg-[var(--teal)]/5 text-[var(--foreground)]"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]"
              }`}
            >
              I am 18 years of age or older.
            </button>
            <button
              type="button"
              onClick={() => setAgeConfirmed("minor")}
              className={`w-full rounded-xl border p-4 text-left transition-colors ${
                ageConfirmed === "minor"
                  ? "border-[var(--teal)] bg-[var(--teal)]/5 text-[var(--foreground)]"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]"
              }`}
            >
              I am under 18 years of age.
            </button>
          </div>
          <button
            className="btn btn-primary mt-6"
            disabled={!ageConfirmed}
            type="button"
            onClick={continueFromAge}
          >
            Continue
          </button>
        </div>
      )}

      {step === "email" && (
        <div className="mt-8">
          <h2 className="font-display text-[28px] font-normal leading-[1.2] tracking-tight md:text-[36px]">
            {t(locale, "reg.email.title")}
          </h2>
          <p className="muted mt-2 text-sm leading-[1.75]">
            {t(locale, "reg.email.sub")}
          </p>
          <form
            className="mt-8 space-y-4"
            onSubmit={(e) => { e.preventDefault(); requestOtp(); }}
          >
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-semibold text-[var(--foreground)]"
              >
                {t(locale, "reg.email.label")}
              </label>
              <input
                className="field mt-2"
                id="email"
                name="email"
                onChange={(e) => setEmail(e.target.value)}
                required
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                placeholder="you@example.com"
              />
            </div>
            {error && <FormError message={error} />}
            <button
              className="btn btn-primary"
              disabled={loading || !hydrated || !email}
              type="submit"
            >
              {loading ? t(locale, "reg.email.sending") : t(locale, "reg.email.sendBtn")}
            </button>
          </form>
        </div>
      )}

      {step === "otp" && (
        <div className="mt-8">
          <h2 className="font-display text-[28px] font-normal leading-[1.2] tracking-tight md:text-[36px]">
            {t(locale, "reg.otp.title")}
          </h2>
          <p className="muted mt-2 text-sm leading-[1.75]">
            {t(locale, "reg.otp.sub")}{" "}
            <span className="font-mono text-[var(--foreground)]">{email}</span>.
          </p>
          <form
            className="mt-8 space-y-4"
            onSubmit={(e) => { e.preventDefault(); verify(); }}
          >
            <div>
              <label
                htmlFor="otp"
                className="block text-sm font-semibold text-[var(--foreground)]"
              >
                {t(locale, "reg.otp.label")}
              </label>
              <input
                className="field mt-2 font-mono text-center text-2xl tracking-[0.4em]"
                id="otp"
                inputMode="numeric"
                maxLength={6}
                onChange={(e) =>
                  setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                required
                value={otp}
                autoComplete="one-time-code"
                placeholder="000000"
              />
            </div>
            {error && <FormError message={error} />}
            <button
              className="btn btn-primary"
              disabled={loading || !hydrated || otp.length !== 6}
              type="submit"
            >
              {loading ? t(locale, "reg.otp.verifying") : t(locale, "reg.otp.verifyBtn")}
            </button>
            <p className="muted text-sm leading-[1.7]">
              {t(locale, "reg.otp.wrongEmail")}{" "}
              <button
                type="button"
                onClick={() => { setStep("email"); setOtp(""); setError(""); }}
                className="link-underline text-[var(--foreground)]"
              >
                {t(locale, "reg.otp.changeEmail")}
              </button>
              .
            </p>
          </form>
        </div>
      )}
    </div>
  );
}

function ProgressBar({ step, locale }: { step: Step; locale: Locale }) {
  const steps = [t(locale, "reg.progress.age"), t(locale, "reg.progress.email"), t(locale, "reg.progress.otp")];
  const current = step === "age" ? 0 : step === "email" ? 1 : 2;
  return (
    <div className="flex items-center gap-2">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center gap-2 flex-1 last:flex-none">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold transition-colors ${
                i < current
                  ? "bg-[var(--teal)] text-white"
                  : i === current
                  ? "border-2 border-[var(--teal)] text-[var(--teal)]"
                  : "border border-[var(--border)] text-[var(--muted)]"
              }`}
            >
              {i < current ? (
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <span className={`hidden text-[11px] sm:block ${i === current ? "font-semibold text-[var(--foreground)]" : "text-[var(--muted)]"}`}>
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className="flex-1 h-px mx-1" style={{ background: i < current ? "var(--teal)" : "var(--hairline)" }} />
          )}
        </div>
      ))}
    </div>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <p className="text-sm font-semibold text-[var(--rose)]">{message}</p>
  );
}
