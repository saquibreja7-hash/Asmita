"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";
import { forgetEligibility, hasDraft, isEligibleAdult, rememberEligibleAdult } from "@/lib/eligibility";
import { t, type Locale } from "@/lib/i18n";
import { FormError } from "@/components/FormError";

type Step = "age" | "email" | "otp";

// mode "track" (Track your case) skips the age question: it only finds a case
// this email already has, and never starts a new one.
export function RegisterForm({ locale, mode = "file" }: { locale: Locale; mode?: "file" | "track" }) {
  const router = useRouter();
  const tracking = mode === "track";
  const [step, setStep] = useState<Step>(tracking ? "email" : "age");
  const [noCase, setNoCase] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState<"adult" | "minor" | "">("");
  const [ageThen, setAgeThen] = useState<"adult" | "minor" | "">("");
  const [email, setEmail] = useState("");
  // One single code box (WP40 A3): type, paste or autofill all land in it.
  const [otp, setOtp] = useState("");
  const otpRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  // Each step's heading; focus moves to it whenever the step changes (A11).
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

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

  // Move focus to the new step's heading so screen readers announce it,
  // like the eligibility wizard does (A11).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
  }, [step, noCase]);

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
        // The step did not change, so focus the code box itself for a retry (A11).
        otpRef.current?.focus();
        otpRef.current?.select();
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
          <h2 className="section-title">
            {t(locale, "reg.age.title")}
          </h2>
          <p className="muted mt-2 text-sm leading-[1.75]">
            {t(locale, "reg.age.sub")}
          </p>
          {/* The two answers are one question, so they are one radio group
              with a legend and a shared name (WP40 A12). The legend is hidden
              because the heading above already asks it on screen. */}
          <fieldset className="mt-6 space-y-3">
            <legend className="sr-only">{t(locale, "eligibility.ageNow.title")}</legend>
            {(["adult", "minor"] as const).map((value) => (
              <label
                key={value}
                className={`flex cursor-pointer items-start gap-3 rounded-[var(--radius-box)] border p-4 transition-colors ${
                  ageConfirmed === value
                    ? "border-[var(--brand)] bg-[var(--brand-soft)]"
                    : "border-[var(--line)] bg-[var(--page)] hover:border-[var(--line)]"
                }`}
              >
                <input
                  type="radio"
                  name="ageNow"
                  checked={ageConfirmed === value}
                  onChange={() => setAgeConfirmed(value)}
                  className="mt-[3px] h-4 w-4 shrink-0 accent-[var(--brand)]"
                />
                <span className="text-[15px] font-medium leading-[1.4] text-[var(--ink)]">
                  {t(locale, value === "adult" ? "auth.ageAdult" : "auth.ageMinor")}
                </span>
              </label>
            ))}
          </fieldset>
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
                    name="ageThen"
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
          <h2 className="section-title outline-none" ref={headingRef} tabIndex={-1}>{t(locale, "track.noCase.title")}</h2>
          <p className="muted mt-2 text-sm leading-[1.75]">{t(locale, "track.noCase.sub")}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="btn btn-primary" href="/start">{t(locale, "track.noCase.start")}</Link>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => { setNoCase(false); setStep("email"); setOtp(""); }}
            >
              {t(locale, "reg.otp.changeEmail")}
            </button>
          </div>
        </div>
      )}

      {!noCase && step === "email" && (
        <div className="mt-8">
          <h2 className="section-title outline-none" ref={headingRef} tabIndex={-1}>
            {t(locale, tracking ? "track.email.title" : "reg.email.title")}
          </h2>
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
            <FormError message={error} />
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
          <h2 className="section-title outline-none" ref={headingRef} tabIndex={-1}>
            {t(locale, "reg.otp.title")}
          </h2>
          <p className="muted mt-2 text-sm leading-[1.75]">
            {t(locale, "reg.otp.sub")}{" "}
            <span className="text-[var(--ink)]">{email}</span>.
          </p>
          <form
            className="mt-8 space-y-4"
            onSubmit={(e) => { e.preventDefault(); verify(); }}
          >
            <div>
              <label htmlFor="otp" className="block text-sm font-medium text-[var(--ink)]">
                {t(locale, "reg.otp.label")}
              </label>
              {/* One box takes the whole code: typed, pasted or autofilled by
                  the browser's one-time-code suggestion (WP40 A3). */}
              <input
                ref={otpRef}
                className="field mt-2 font-mono text-center text-2xl tracking-[0.4em]"
                id="otp"
                name="otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                pattern="[0-9]{6}"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </div>
            <FormError message={error} />
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
