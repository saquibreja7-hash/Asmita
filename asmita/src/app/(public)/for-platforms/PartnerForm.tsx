"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { csrfFetch } from "@/lib/client-csrf";
import {
  PARTNER_INTERESTS,
  PLATFORM_TYPES,
  USER_BASES,
  normaliseDomain,
  type PartnerInterest,
} from "@/lib/platform-partners-shared";

type Fields = {
  organisationName: string;
  platformName: string;
  website: string;
  platformType: string;
  userBase: string;
  contactName: string;
  contactRole: string;
  contactEmail: string;
  contactPhone: string;
  message: string;
};

const EMPTY: Fields = {
  organisationName: "",
  platformName: "",
  website: "",
  platformType: "",
  userBase: "",
  contactName: "",
  contactRole: "",
  contactEmail: "",
  contactPhone: "",
  message: "",
};

const FIELD_ERRORS: Record<string, string> = {
  organisationName: "Enter the name of your company or organisation.",
  platformName: "Enter the name of the platform or service.",
  website: "Enter your platform's domain, for example example.in.",
  platformType: "Choose the kind of platform.",
  userBase: "Choose roughly how many users you have in India.",
  contactName: "Enter your name.",
  contactRole: "Enter your role.",
  contactEmail: "Enter a work email address we can reply to.",
  contactPhone: "Enter a phone number with digits only, or leave it empty.",
  interests: "Choose at least one way you would like to work with us.",
  message: "Remove links from the message. Put your domain in the website field.",
  authorised: "Confirm that you can speak for this platform.",
};

export function PartnerForm() {
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [interests, setInterests] = useState<PartnerInterest[]>(["FINGERPRINT_ALERTS", "TAKEDOWN_CHANNEL"]);
  const [authorised, setAuthorised] = useState(false);
  const [fax, setFax] = useState("");
  const [errorField, setErrorField] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const set = (key: keyof Fields) => (value: string) => setFields((current) => ({ ...current, [key]: value }));

  function toggleInterest(key: PartnerInterest, on: boolean) {
    setInterests((current) => (on ? [...new Set([...current, key])] : current.filter((item) => item !== key)));
  }

  function localError(): string | null {
    if (fields.organisationName.trim().length < 2) return "organisationName";
    if (fields.platformName.trim().length < 2) return "platformName";
    if (!normaliseDomain(fields.website)) return "website";
    if (!fields.platformType) return "platformType";
    if (!fields.userBase) return "userBase";
    if (fields.contactName.trim().length < 2) return "contactName";
    if (fields.contactRole.trim().length < 2) return "contactRole";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.contactEmail.trim())) return "contactEmail";
    if (fields.contactPhone.trim() && !/^\+?[0-9 ()-]{7,20}$/.test(fields.contactPhone.trim())) return "contactPhone";
    if (interests.length === 0) return "interests";
    if (!authorised) return "authorised";
    return null;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const problem = localError();
    if (problem) {
      setErrorField(problem);
      setError(FIELD_ERRORS[problem] ?? "Check the form and try again.");
      document.getElementById(`partner-${problem}`)?.focus();
      return;
    }
    setErrorField(null);
    setSubmitting(true);
    const response = await csrfFetch("/api/partners", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...fields,
        contactPhone: fields.contactPhone.trim() || undefined,
        message: fields.message.trim() || undefined,
        interests,
        authorised: true,
        fax: fax || undefined,
      }),
    }).catch(() => null);
    setSubmitting(false);
    if (response?.ok) {
      setSent(true);
      return;
    }
    const payload = ((await response?.json().catch(() => ({}))) ?? {}) as { error?: string; field?: string };
    if (payload.field) setErrorField(payload.field);
    setError(
      payload.error === "already_received"
        ? "We have already received a request for this domain today. We will be in touch."
        : payload.error === "rate_limited"
          ? "Too many requests from this network. Please try again in an hour."
          : payload.field && FIELD_ERRORS[payload.field]
            ? FIELD_ERRORS[payload.field]
            : "We could not send the form just now. Please try again in a moment.",
    );
  }

  if (sent) {
    return (
      <div className="partner-form mt-10 text-center" role="status" aria-live="polite" aria-atomic="true">
        <p className="font-display text-[26px] leading-[1.35] tracking-tight text-[var(--ink)] md:text-[32px]">
          Thank you. We have your request.
        </p>
        <p className="muted mx-auto mt-4 max-w-md text-base leading-[1.75]">
          Someone from the Asmita team will write to {fields.contactEmail.trim()} to confirm who you are and agree the details. Nothing is shared with your
          platform until that is done.
        </p>
      </div>
    );
  }

  const invalid = (name: string) => (errorField === name ? true : undefined);

  return (
    <form className="partner-form mt-10 space-y-10" onSubmit={submit} noValidate>
      <fieldset className="space-y-6">
        <legend className="partner-legend">Your platform</legend>
        <div className="grid gap-6 md:grid-cols-2">
          <Field id="organisationName" label="Company or organisation">
            <input className="field" id="partner-organisationName" autoComplete="organization" value={fields.organisationName} onChange={(e) => set("organisationName")(e.target.value)} aria-invalid={invalid("organisationName")} maxLength={120} />
          </Field>
          <Field id="platformName" label="Platform or service name">
            <input className="field" id="partner-platformName" value={fields.platformName} onChange={(e) => set("platformName")(e.target.value)} aria-invalid={invalid("platformName")} maxLength={120} />
          </Field>
        </div>
        <Field id="website" label="Website domain" hint="The main domain of the service, for example example.in.">
          <input className="field" id="partner-website" inputMode="url" autoComplete="url" placeholder="example.in" value={fields.website} onChange={(e) => set("website")(e.target.value)} aria-invalid={invalid("website")} maxLength={300} />
        </Field>
        <div className="grid gap-6 md:grid-cols-2">
          <Field id="platformType" label="Kind of platform">
            <select className="field" id="partner-platformType" value={fields.platformType} onChange={(e) => set("platformType")(e.target.value)} aria-invalid={invalid("platformType")}>
              <option value="">Choose one</option>
              {Object.entries(PLATFORM_TYPES).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </Field>
          <Field id="userBase" label="Monthly users in India">
            <select className="field" id="partner-userBase" value={fields.userBase} onChange={(e) => set("userBase")(e.target.value)} aria-invalid={invalid("userBase")}>
              <option value="">Choose one</option>
              {Object.entries(USER_BASES).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4" aria-describedby="partner-interests-hint">
        <legend className="partner-legend">How would you like to work with us?</legend>
        <p id="partner-interests-hint" className="muted text-sm leading-[1.6]">Choose any that fit. You can change this when we talk.</p>
        <div className="grid gap-3 sm:grid-cols-2" id="partner-interests" tabIndex={-1}>
          {(Object.entries(PARTNER_INTERESTS) as [PartnerInterest, string][]).map(([value, label]) => (
            <label key={value} className="partner-choice">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]"
                checked={interests.includes(value)}
                onChange={(e) => toggleInterest(value, e.target.checked)}
              />
              <span className="text-[15px] leading-[1.5] text-[var(--ink)]">{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-6">
        <legend className="partner-legend">Who should we talk to?</legend>
        <div className="grid gap-6 md:grid-cols-2">
          <Field id="contactName" label="Your name">
            <input className="field" id="partner-contactName" autoComplete="name" value={fields.contactName} onChange={(e) => set("contactName")(e.target.value)} aria-invalid={invalid("contactName")} maxLength={100} />
          </Field>
          <Field id="contactRole" label="Your role" hint="For example Grievance Officer or Head of Trust & Safety.">
            <input className="field" id="partner-contactRole" autoComplete="organization-title" value={fields.contactRole} onChange={(e) => set("contactRole")(e.target.value)} aria-invalid={invalid("contactRole")} maxLength={100} />
          </Field>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Field id="contactEmail" label="Work email">
            <input className="field" id="partner-contactEmail" type="email" autoComplete="email" value={fields.contactEmail} onChange={(e) => set("contactEmail")(e.target.value)} aria-invalid={invalid("contactEmail")} maxLength={254} />
          </Field>
          <Field id="contactPhone" label="Phone" optional>
            <input className="field" id="partner-contactPhone" type="tel" autoComplete="tel" value={fields.contactPhone} onChange={(e) => set("contactPhone")(e.target.value)} aria-invalid={invalid("contactPhone")} maxLength={20} />
          </Field>
        </div>
        <Field id="message" label="Anything we should know" optional hint="Please do not include links to content here.">
          <textarea className="field min-h-32 leading-[1.65]" id="partner-message" value={fields.message} onChange={(e) => set("message")(e.target.value)} aria-invalid={invalid("message")} maxLength={1500} />
        </Field>
      </fieldset>

      {/* Hidden from people and screen readers; bots fill it in. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-px w-px overflow-hidden">
        <label htmlFor="partner-fax">Fax</label>
        <input id="partner-fax" tabIndex={-1} autoComplete="off" value={fax} onChange={(e) => setFax(e.target.value)} />
      </div>

      <label className="partner-choice" htmlFor="partner-authorised">
        <input
          id="partner-authorised"
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]"
          checked={authorised}
          onChange={(e) => setAuthorised(e.target.checked)}
          aria-invalid={invalid("authorised")}
        />
        <span className="text-[15px] leading-[1.55] text-[var(--ink)]">
          I can speak for this platform, and I agree that Asmita may contact me about the partner programme.
        </span>
      </label>

      {error && (
        <p className="text-center text-sm font-medium text-[var(--danger)]" role="alert" aria-live="assertive">
          {error}
        </p>
      )}

      <div className="text-center">
        <button className="btn btn-primary btn-arrow !m-0" type="submit" disabled={submitting}>
          {submitting ? "Sending…" : "Request to join"}
        </button>
        <p className="muted mx-auto mt-4 max-w-md text-xs leading-[1.7]">
          We use these details only to talk to you about the partner programme. Your name, email, phone and message are stored encrypted.
        </p>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  optional,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={`partner-${id}`} className="block text-[15px] font-medium text-[var(--ink)]">
        {label}
        {optional && <span className="muted ml-2 text-xs font-normal">Optional</span>}
      </label>
      {hint && <p className="muted mt-1 text-sm leading-[1.55]">{hint}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}
