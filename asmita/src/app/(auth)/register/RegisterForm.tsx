"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/client-csrf";

export function RegisterForm() {
  const router = useRouter();
  const [step, setStep] = useState<"age" | "email" | "otp">("age");
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
    const response = await csrfFetch("/api/auth/request-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    if (!response.ok) {
      setError("Please wait before requesting another code.");
      return;
    }
    setStep("otp");
  }

  async function verify() {
    setLoading(true);
    setError("");
    const response = await csrfFetch("/api/auth/verify-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, otp, ageOver18: age === "adult" }),
    });
    setLoading(false);
    if (!response.ok) {
      setError("The code did not match. Please try again.");
      return;
    }
    router.push(age === "minor" ? "/minor-support" : "/submit");
  }

  if (step === "age") {
    return (
      <form className="panel mt-8 max-w-lg space-y-5 p-6">
        <fieldset className="space-y-3">
          <legend className="text-sm font-bold">Age attestation</legend>
          <label className="flex gap-3 rounded-md border border-[var(--border)] p-3">
            <input checked={age === "adult"} onChange={() => setAge("adult")} type="radio" />
            <span>I confirm I am 18 or older.</span>
          </label>
          <label className="flex gap-3 rounded-md border border-[var(--border)] p-3">
            <input checked={age === "minor"} onChange={() => setAge("minor")} type="radio" />
            <span>I am under 18.</span>
          </label>
        </fieldset>
        <button
          className="btn btn-primary w-full"
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
      </form>
    );
  }

  return step === "email" ? (
    <form className="panel mt-8 max-w-lg p-6">
      <label className="text-sm font-bold" htmlFor="email">
        Email address
      </label>
      <input
        className="field mt-2"
        id="email"
        name="email"
        onChange={(event) => setEmail(event.target.value)}
        required
        type="email"
        value={email}
      />
      {error ? <p className="mt-3 text-sm font-bold text-[var(--rose)]">{error}</p> : null}
      <button className="btn btn-primary mt-5 w-full" disabled={loading || !hydrated} onClick={requestOtp} type="button">
        Send verification code
      </button>
    </form>
  ) : (
    <form className="panel mt-8 max-w-lg space-y-5 p-6">
      <p className="font-bold">We sent a code to your email.</p>
      <label className="block text-sm font-bold" htmlFor="otp">
        6-digit code
        <input
          className="field mt-2"
          id="otp"
          inputMode="numeric"
          maxLength={6}
          onChange={(event) => setOtp(event.target.value)}
          required
          value={otp}
        />
      </label>
      {error ? <p className="text-sm font-bold text-[var(--rose)]">{error}</p> : null}
      <button className="btn btn-primary w-full" disabled={loading || !hydrated || otp.length !== 6} onClick={verify} type="button">
        Continue
      </button>
    </form>
  );
}
