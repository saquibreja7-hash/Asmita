"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";

type Step = "age" | "email" | "otp";

export function RegisterForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("age");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [age, setAge] = useState<"adult" | "minor" | "">("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setHydrated(true), 0);
    return () => window.clearTimeout(id);
  }, []);

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
        setError("Please wait before requesting another code.");
        return;
      }
      setStep("otp");
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
      const response = await csrfFetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, otp, ageOver18: age === "adult" }),
      });
      if (!response.ok) {
        setError("The code did not match. Please try again.");
        return;
      }
      router.push(age === "minor" ? "/minor-support" : "/submit");
    } catch {
      setError("The request timed out. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <StepHeader step={step} />

      {step === "age" && (
        <fieldset className="mt-10 space-y-3">
          <legend className="sr-only">Age attestation</legend>
          <AgeOption
            label="I am 18 years of age or older."
            checked={age === "adult"}
            onSelect={() => setAge("adult")}
          />
          <AgeOption
            label="I am under 18 years of age."
            checked={age === "minor"}
            onSelect={() => setAge("minor")}
          />
          <div className="pt-6 text-center">
            <button
              className="btn btn-primary"
              disabled={!hydrated || !age}
              onClick={() => {
                if (age === "minor") {
                  router.push("/minor-support");
                  return;
                }
                setStep("email");
              }}
              type="button"
            >
              Continue
            </button>
          </div>
        </fieldset>
      )}

      {step === "email" && (
        <form
          className="mt-10 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            requestOtp();
          }}
        >
          <Row
            label="Email address"
            hint="We will send a 6-digit code to this address."
            htmlFor="email"
          >
            <input
              className="field"
              id="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
            />
          </Row>
          {error && <FormError message={error} />}
          <div className="pt-4 text-center">
            <button
              className="btn btn-primary"
              disabled={loading || !hydrated || !email}
              type="submit"
            >
              {loading ? "Sending…" : "Send verification code"}
            </button>
          </div>
        </form>
      )}

      {step === "otp" && (
        <form
          className="mt-10 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            verify();
          }}
        >
          <p className="muted text-center text-sm leading-[1.7]">
            We sent a 6-digit code to{" "}
            <span className="font-mono text-[var(--foreground)]">{email}</span>.
          </p>
          <Row
            label="6-digit code"
            hint="Check your inbox and spam folder. Codes expire in 10 minutes."
            htmlFor="otp"
          >
            <input
              className="field font-mono text-center text-2xl tracking-[0.4em]"
              id="otp"
              inputMode="numeric"
              maxLength={6}
              onChange={(event) =>
                setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              required
              value={otp}
              autoComplete="one-time-code"
            />
          </Row>
          {error && <FormError message={error} />}
          <div className="pt-4 text-center">
            <button
              className="btn btn-primary"
              disabled={loading || !hydrated || otp.length !== 6}
              type="submit"
            >
              {loading ? "Verifying…" : "Continue"}
            </button>
          </div>
          <p className="muted pt-4 text-center text-sm leading-[1.7]">
            Didn&rsquo;t get the code?{" "}
            <button
              type="button"
              onClick={() => setStep("email")}
              className="link-underline text-[var(--foreground)]"
            >
              Use a different email
            </button>
            .
          </p>
        </form>
      )}
    </div>
  );
}

function StepHeader({ step }: { step: Step }) {
  const labels: Record<Step, { label: string; title: string }> = {
    age: { label: "Step 01 of 03", title: "First, confirm your age." },
    email: { label: "Step 02 of 03", title: "Your email address." },
    otp: { label: "Step 03 of 03", title: "Enter the code we sent." },
  };
  const { label, title } = labels[step];
  return (
    <div className="text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
        {label}
      </p>
      <h2 className="font-display mt-3 text-[24px] font-normal leading-[1.22] tracking-tight md:text-[32px] md:leading-[1.18]">
        {title}
      </h2>
    </div>
  );
}

function AgeOption({
  label,
  checked,
  onSelect,
}: {
  label: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-[14px] border p-4 transition-colors ${
        checked
          ? "border-[var(--teal)] bg-[var(--teal-soft)]"
          : "border-[var(--hairline)] bg-white hover:border-[var(--border)]"
      }`}
    >
      <input
        type="radio"
        checked={checked}
        onChange={onSelect}
        className="mt-[3px] h-4 w-4 accent-[var(--teal)]"
      />
      <span className="font-display text-[16px] leading-[1.4] tracking-tight text-[var(--foreground)] md:text-[18px]">
        {label}
      </span>
    </label>
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

function FormError({ message }: { message: string }) {
  return (
    <p className="text-center text-sm font-semibold text-[var(--rose)]">
      {message}
    </p>
  );
}
