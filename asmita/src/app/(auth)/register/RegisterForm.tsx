"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";
import { forgetEligibility, hasDraft, isEligibleAdult, rememberEligibleAdult } from "@/lib/eligibility";
import { t, type Locale } from "@/lib/i18n";

type Step = "age" | "email" | "otp";

// mode "track" (Track your case) skips the age question: it only finds a case
// this email already has, and never starts a new one.
export function RegisterForm({ locale, mode = "file" }: { locale: Locale; mode?: "file" | "track" }) {
  const router = useRouter();
  const tracking = mode === "track";
  const Heading = tracking ? "h2" : "h1";
  const [step, setStep] = useState<Step>(tracking ? "email" : "age");
  const [noCase, setNoCase] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState<"adult" | "minor" | "">("");
  const [ageThen, setAgeThen] = useState<"adult" | "minor" | "">("");
  const [email, setEmail] = useState("");
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(6).fill(""));
  const otp = otpDigits.join("");
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      // Answered on the eligibility screen already: go straight to the email.
      if (!tracking && isEligibleAdult()) {
        setAgeConfirmed("adult");
        setStep("email");
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, [tracking]);

  function continueFromAge() {
    if (ageConfirmed === "minor" || ageThen === "minor") {
      forgetEligibility();
      router.push("/minor-support");
      return;
    }
    rememberEligibleAdult();
    setStep("email");
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
        setError(response.status === 429
          ? (locale === "hi" ? "बहुत अधिक अनुरोध हुए हैं। कृपया कुछ समय बाद दोबारा कोशिश करें।" : "Too many requests. Please wait a little and try again.")
          : (locale === "hi" ? "हम अभी कोड नहीं भेज पा रहे हैं। कृपया कुछ समय बाद दोबारा कोशिश करें।" : "We couldn't send the code right now. Please try again in a little while."));
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
        body: JSON.stringify(tracking ? { email, otp, purpose: "track" } : { email, otp, ageOver18: ageConfirmed === "adult" }),
      });
      if (!response.ok) {
        setError(t(locale, "reg.error.codeNoMatch"));
        return;
      }
      const result = (await response.json().catch(() => ({}))) as { redirectTo?: string; hasCases?: boolean; noCase?: boolean };
      if (tracking) {
        if (result.noCase) {
          setNoCase(true);
          return;
        }
        router.push(result.redirectTo ?? "/my-cases");
        return;
      }
      // Links added before the email code go straight to review and signing.
      // Otherwise someone who already has a case sees it before starting another.
      router.push(hasDraft() ? "/review-sign" : result.hasCases ? "/my-cases?existing=1" : "/submit");
    } catch {
      setError(t(locale, "reg.error.timeout"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {step === "age" && (
        <div className="mt-8">
          <Heading className="section-title">
            {t(locale, "reg.age.title")}
          </Heading>
          <p className="muted mt-2 text-sm leading-[1.75]">
            {t(locale, "reg.age.sub")}
          </p>
          <div className="mt-6 space-y-3">
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-[var(--radius-box)] border p-4 transition-colors ${
                ageConfirmed === "adult"
                  ? "border-[var(--brand)] bg-[var(--brand-soft)]"
                  : "border-[var(--line)] bg-[var(--page)] hover:border-[var(--line)]"
              }`}
            >
              <input
                type="radio"
                checked={ageConfirmed === "adult"}
                onChange={() => setAgeConfirmed("adult")}
                className="mt-[3px] h-4 w-4 shrink-0 accent-[var(--brand)]"
              />
              <span className="text-[15px] font-medium leading-[1.4] text-[var(--ink)]">
                {t(locale, "auth.ageAdult")}
              </span>
            </label>
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-[var(--radius-box)] border p-4 transition-colors ${
                ageConfirmed === "minor"
                  ? "border-[var(--brand)] bg-[var(--brand-soft)]"
                  : "border-[var(--line)] bg-[var(--page)] hover:border-[var(--line)]"
              }`}
            >
              <input
                type="radio"
                checked={ageConfirmed === "minor"}
                onChange={() => setAgeConfirmed("minor")}
                className="mt-[3px] h-4 w-4 shrink-0 accent-[var(--brand)]"
              />
              <span className="text-[15px] font-medium leading-[1.4] text-[var(--ink)]">
                {t(locale, "auth.ageMinor")}
              </span>
            </label>
          </div>
          {ageConfirmed === "adult" && (
            <fieldset className="mt-8 space-y-3">
              <legend className="text-[15px] font-medium leading-[1.4] text-[var(--ink)]">
                {t(locale, "eligibility.ageThen.title")}
              </legend>
              <p className="muted text-sm leading-[1.6]">{t(locale, "eligibility.ageThen.sub")}</p>
              {(["adult", "minor"] as const).map((value) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-start gap-3 rounded-[var(--radius-box)] border p-4 transition-colors ${
                    ageThen === value
                      ? "border-[var(--brand)] bg-[var(--brand-soft)]"
                      : "border-[var(--line)] bg-[var(--page)] hover:border-[var(--line)]"
                  }`}
                >
                  <input
                    type="radio"
                    checked={ageThen === value}
                    onChange={() => setAgeThen(value)}
                    className="mt-[3px] h-4 w-4 shrink-0 accent-[var(--brand)]"
                  />
                  <span className="text-[15px] font-medium leading-[1.4] text-[var(--ink)]">
                    {t(locale, value === "adult" ? "auth.ageThenAdult" : "auth.ageThenMinor")}
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          <button
            className="btn btn-primary mt-8"
            disabled={!ageConfirmed || (ageConfirmed === "adult" && !ageThen) || !hydrated}
            onClick={continueFromAge}
            type="button"
          >
            {t(locale, "reg.otp.verifyBtn")}
          </button>
        </div>
      )}

      {noCase && (
        <div className="mt-8" role="status">
          <Heading className="section-title">{t(locale, "track.noCase.title")}</Heading>
          <p className="muted mt-2 text-sm leading-[1.75]">{t(locale, "track.noCase.sub")}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="btn btn-primary" href="/start">{t(locale, "track.noCase.start")}</Link>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => { setNoCase(false); setStep("email"); setOtpDigits(Array(6).fill("")); }}
            >
              {t(locale, "reg.otp.changeEmail")}
            </button>
          </div>
        </div>
      )}

      {!noCase && step === "email" && (
        <div className="mt-8">
          <Heading className="section-title">
            {t(locale, tracking ? "track.email.title" : "reg.email.title")}
          </Heading>
          <p className="muted mt-2 text-sm leading-[1.75]">
            {t(locale, tracking ? "track.email.sub" : "reg.email.sub")}
          </p>
          <p className="mt-3 rounded-[var(--radius-box)] bg-[var(--brand-soft)] px-4 py-3 text-sm leading-[1.6] text-[var(--brand-strong)]">
            {t(locale, "reg.email.safe")}
          </p>
          <form
            className="mt-8 space-y-4"
            onSubmit={(e) => { e.preventDefault(); requestOtp(); }}
          >
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-[var(--ink)]"
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

      {!noCase && step === "otp" && (
        <div className="mt-8">
          <Heading className="section-title">
            {t(locale, "reg.otp.title")}
          </Heading>
          <p className="muted mt-2 text-sm leading-[1.75]">
            {t(locale, "reg.otp.sub")}{" "}
            <span className="text-[var(--ink)]">{email}</span>.
          </p>
          <form
            className="mt-8 space-y-4"
            onSubmit={(e) => { e.preventDefault(); verify(); }}
          >
            <div>
              <label htmlFor="otp-0" className="block text-sm font-medium text-[var(--ink)]">
                {t(locale, "reg.otp.label")}
              </label>
              <div className="mt-2 flex gap-2" role="group" aria-label={locale === "hi" ? "सत्यापन कोड के अंक" : "Verification code digits"}>
                {Array.from({ length: 6 }, (_, index) => (
                  <input
                    key={index}
                    ref={(el) => { otpRefs.current[index] = el; }}
                    id={`otp-${index}`}
                    aria-label={index === 0 ? t(locale, "reg.otp.label") : (locale === "hi" ? `अंक ${index + 1}` : `Digit ${index + 1}`)}
                    className="field min-w-0 flex-1 !px-1 text-center font-mono text-xl"
                    type="text" inputMode="numeric" pattern="[0-9]*"
                    autoComplete={index === 0 ? "one-time-code" : "off"}
                    maxLength={index === 0 ? 6 : 1}
                    value={otpDigits[index]}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "");
                      if (digits.length > 1) { setOtpDigits(Array.from({ length: 6 }, (_, i) => digits[i] ?? "")); otpRefs.current[Math.min(digits.length, 6) - 1]?.focus(); return; }
                      const parts = [...otpDigits];
                      parts[index] = digits;
                      setOtpDigits(parts);
                      if (digits && index < 5) otpRefs.current[index + 1]?.focus();
                    }}
                    onPaste={(e) => {
                      e.preventDefault();
                      const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
                      if (digits) { setOtpDigits(Array.from({ length: 6 }, (_, i) => digits[i] ?? "")); otpRefs.current[Math.min(digits.length, 6) - 1]?.focus(); }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Backspace" && !otpDigits[index] && index > 0) otpRefs.current[index - 1]?.focus();
                      if (e.key === "ArrowLeft" && index > 0) { e.preventDefault(); otpRefs.current[index - 1]?.focus(); }
                      if (e.key === "ArrowRight" && index < 5) { e.preventDefault(); otpRefs.current[index + 1]?.focus(); }
                    }}
                  />
                ))}
              </div>
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
                onClick={() => { setStep("email"); setOtpDigits(Array(6).fill("")); setError(""); }}
                className="link-underline text-[var(--ink)]"
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

function FormError({ message }: { message: string }) {
  return (
    <p role="alert" className="text-sm font-medium text-[var(--danger)]">{message}</p>
  );
}
