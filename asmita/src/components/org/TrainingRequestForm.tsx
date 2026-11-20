"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { csrfFetch } from "@/lib/client-csrf";
import { t, type Locale } from "@/lib/i18n";
import {
  AUDIENCE_SIZES,
  INDIAN_STATE_OPTIONS,
  TRAINING_AUDIENCES,
  TRAINING_MODES,
  type TrainingAudience,
} from "@/lib/org-forms";

// The training booking request (56.6), one client of the shared org forms
// pipeline: POST /api/org/submissions with kind=TRAINING_REQUEST.

type Fields = {
  organizationName: string;
  audienceType: string;
  contactName: string;
  role: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  audienceSize: string;
  preferredMonths: string;
  language: string;
  languageOther: string;
  mode: string;
  message: string;
};

const EMPTY: Fields = {
  organizationName: "",
  audienceType: "",
  contactName: "",
  role: "",
  email: "",
  phone: "",
  city: "",
  state: "",
  audienceSize: "",
  preferredMonths: "",
  language: "",
  languageOther: "",
  mode: "",
  message: "",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9 ()-]{7,20}$/;

const AUDIENCE_KEYS = Object.keys(TRAINING_AUDIENCES) as TrainingAudience[];
type SizeKey = keyof typeof AUDIENCE_SIZES;
const SIZE_KEYS = Object.keys(AUDIENCE_SIZES) as SizeKey[];
type ModeKey = keyof typeof TRAINING_MODES;
const MODE_KEYS = Object.keys(TRAINING_MODES) as ModeKey[];

export function TrainingRequestForm({ locale }: { locale: Locale }) {
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [fax, setFax] = useState("");
  const [errorField, setErrorField] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const set = (key: keyof Fields) => (value: string) => setFields((current) => ({ ...current, [key]: value }));

  function localError(): string | null {
    if (fields.organizationName.trim().length < 2) return "organizationName";
    if (!fields.audienceType) return "audienceType";
    if (fields.contactName.trim().length < 2) return "contactName";
    if (fields.role.trim().length < 2) return "role";
    if (!EMAIL.test(fields.email.trim())) return "email";
    if (fields.phone.trim() && !PHONE.test(fields.phone.trim())) return "phone";
    if (fields.city.trim().length < 2) return "city";
    if (!fields.state) return "state";
    if (!fields.audienceSize) return "audienceSize";
    if (fields.preferredMonths.trim().length < 2) return "preferredMonths";
    if (!fields.language) return "language";
    if (!fields.mode) return "mode";
    return null;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const problem = localError();
    if (problem) {
      setErrorField(problem);
      setError(t(locale, errorMessageKey(problem) ?? "org.training.f.errorGeneric"));
      document.getElementById(`training-${problem}`)?.focus();
      return;
    }
    setErrorField(null);
    setSubmitting(true);
    const response = await csrfFetch("/api/org/submissions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "TRAINING_REQUEST",
        organizationName: fields.organizationName.trim(),
        audienceType: fields.audienceType,
        contactName: fields.contactName.trim(),
        role: fields.role.trim(),
        email: fields.email.trim(),
        phone: fields.phone.trim() || undefined,
        city: fields.city.trim(),
        state: fields.state,
        audienceSize: fields.audienceSize,
        preferredMonths: fields.preferredMonths.trim(),
        language: fields.language,
        languageOther: fields.language === "Other" ? fields.languageOther.trim() || undefined : undefined,
        mode: fields.mode,
        message: fields.message.trim() || undefined,
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
    const key = payload.field && errorMessageKey(payload.field);
    setError(
      payload.error === "already_received"
        ? t(locale, "org.training.f.errorAlready")
        : payload.error === "rate_limited"
          ? t(locale, "org.training.f.errorRate")
          : key
            ? t(locale, key)
            : t(locale, "org.training.f.errorGeneric"),
    );
  }

  if (sent) {
    return (
      <div className="mt-10 text-center" role="status" aria-live="polite" aria-atomic="true">
        <p className="font-display text-[26px] leading-[1.35] tracking-tight text-[var(--ink)] md:text-[32px]">
          {t(locale, "org.training.f.successTitle")}
        </p>
        <p className="muted mx-auto mt-4 max-w-md text-base leading-[1.75]">{t(locale, "org.training.f.successBody")}</p>
      </div>
    );
  }

  const invalid = (name: string) => (errorField === name ? true : undefined);

  return (
    <form className="mt-10 space-y-10" onSubmit={submit} noValidate>
      <fieldset className="space-y-6">
        <legend className="eyebrow">{t(locale, "org.training.f.sectionSession")}</legend>
        <Field id="organizationName" label={t(locale, "org.training.f.org")} locale={locale}>
          <input className="field" id="training-organizationName" autoComplete="organization" value={fields.organizationName} onChange={(e) => set("organizationName")(e.target.value)} aria-invalid={invalid("organizationName")} maxLength={120} />
        </Field>
        <Field id="audienceType" label={t(locale, "org.training.f.type")} locale={locale}>
          <select className="field" id="training-audienceType" value={fields.audienceType} onChange={(e) => set("audienceType")(e.target.value)} aria-invalid={invalid("audienceType")}>
            <option value="">{t(locale, "org.volunteer.f.select")}</option>
            {AUDIENCE_KEYS.map((key) => (
              <option key={key} value={key}>
                {TRAINING_AUDIENCES[key]}
              </option>
            ))}
          </select>
        </Field>
        <Field id="audienceSize" label={t(locale, "org.training.f.size")} locale={locale}>
          <select className="field" id="training-audienceSize" value={fields.audienceSize} onChange={(e) => set("audienceSize")(e.target.value)} aria-invalid={invalid("audienceSize")}>
            <option value="">{t(locale, "org.volunteer.f.select")}</option>
            {SIZE_KEYS.map((key) => (
              <option key={key} value={key}>
                {AUDIENCE_SIZES[key]}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid gap-6 md:grid-cols-2">
          <Field id="preferredMonths" label={t(locale, "org.training.f.months")} hint={t(locale, "org.training.f.monthsHint")} locale={locale}>
            <input className="field" id="training-preferredMonths" value={fields.preferredMonths} onChange={(e) => set("preferredMonths")(e.target.value)} aria-invalid={invalid("preferredMonths")} maxLength={80} />
          </Field>
          <Field id="language" label={t(locale, "org.training.f.language")} locale={locale}>
            <select className="field" id="training-language" value={fields.language} onChange={(e) => set("language")(e.target.value)} aria-invalid={invalid("language")}>
              <option value="">{t(locale, "org.volunteer.f.select")}</option>
              <option value="English">English</option>
              <option value="Hindi">हिंदी</option>
              <option value="English or Hindi">English or Hindi</option>
              <option value="Other">{locale === "hi" ? "अन्य" : "Other"}</option>
            </select>
          </Field>
        </div>
        {fields.language === "Other" && (
          <Field id="languageOther" label={t(locale, "org.training.f.languageOther")} locale={locale}>
            <input className="field" id="training-languageOther" value={fields.languageOther} onChange={(e) => set("languageOther")(e.target.value)} maxLength={40} />
          </Field>
        )}
        <Field id="mode" label={t(locale, "org.training.f.mode")} locale={locale}>
          <select className="field" id="training-mode" value={fields.mode} onChange={(e) => set("mode")(e.target.value)} aria-invalid={invalid("mode")}>
            <option value="">{t(locale, "org.volunteer.f.select")}</option>
            {MODE_KEYS.map((key) => (
              <option key={key} value={key}>
                {TRAINING_MODES[key as ModeKey]}
              </option>
            ))}
          </select>
        </Field>
      </fieldset>

      <fieldset className="space-y-6">
        <legend className="eyebrow">{t(locale, "org.training.f.sectionContact")}</legend>
        <div className="grid gap-6 md:grid-cols-2">
          <Field id="contactName" label={t(locale, "org.training.f.contact")} locale={locale}>
            <input className="field" id="training-contactName" autoComplete="name" value={fields.contactName} onChange={(e) => set("contactName")(e.target.value)} aria-invalid={invalid("contactName")} maxLength={120} />
          </Field>
          <Field id="role" label={t(locale, "org.training.f.role")} locale={locale}>
            <input className="field" id="training-role" autoComplete="organization-title" value={fields.role} onChange={(e) => set("role")(e.target.value)} aria-invalid={invalid("role")} maxLength={120} />
          </Field>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Field id="email" label={t(locale, "org.training.f.email")} locale={locale}>
            <input className="field" id="training-email" type="email" autoComplete="email" value={fields.email} onChange={(e) => set("email")(e.target.value)} aria-invalid={invalid("email")} maxLength={254} />
          </Field>
          <Field id="phone" label={t(locale, "org.training.f.phone")} optional locale={locale}>
            <input className="field" id="training-phone" type="tel" autoComplete="tel" value={fields.phone} onChange={(e) => set("phone")(e.target.value)} aria-invalid={invalid("phone")} maxLength={20} />
          </Field>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Field id="city" label={t(locale, "org.training.f.city")} locale={locale}>
            <input className="field" id="training-city" autoComplete="address-level2" value={fields.city} onChange={(e) => set("city")(e.target.value)} aria-invalid={invalid("city")} maxLength={120} />
          </Field>
          <Field id="state" label={t(locale, "org.training.f.state")} locale={locale}>
            <select className="field" id="training-state" value={fields.state} onChange={(e) => set("state")(e.target.value)} aria-invalid={invalid("state")}>
              <option value="">{t(locale, "org.volunteer.f.selectState")}</option>
              {INDIAN_STATE_OPTIONS.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field id="message" label={t(locale, "org.training.f.message")} optional locale={locale}>
          <textarea className="field min-h-28 leading-[1.65]" id="training-message" value={fields.message} onChange={(e) => set("message")(e.target.value)} maxLength={1500} />
        </Field>
      </fieldset>

      {/* Hidden from people and screen readers; bots fill it in. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-px w-px overflow-hidden">
        <label htmlFor="training-fax">Fax</label>
        <input id="training-fax" tabIndex={-1} autoComplete="off" value={fax} onChange={(e) => setFax(e.target.value)} />
      </div>

      {error && (
        <p className="text-center text-sm font-medium text-[var(--danger)]" role="alert" aria-live="assertive">
          {error}
        </p>
      )}

      <div className="text-center">
        <button className="btn btn-primary btn-arrow !m-0" type="submit" disabled={submitting}>
          {submitting ? t(locale, "org.training.f.sending") : t(locale, "org.training.f.submit")}
        </button>
        <p className="muted mx-auto mt-4 max-w-md text-xs leading-[1.7]">{t(locale, "org.training.f.privacyNote")}</p>
      </div>
    </form>
  );
}

function errorMessageKey(field: string): Parameters<typeof t>[1] | null {
  const keys: Record<string, Parameters<typeof t>[1]> = {
    organizationName: "org.training.f.err.org",
    audienceType: "org.training.f.err.type",
    contactName: "org.training.f.err.contact",
    role: "org.training.f.err.role",
    email: "org.training.f.err.email",
    phone: "org.training.f.err.phone",
    city: "org.training.f.err.city",
    state: "org.training.f.err.state",
    audienceSize: "org.training.f.err.size",
    preferredMonths: "org.training.f.err.months",
    language: "org.training.f.err.language",
    mode: "org.training.f.err.mode",
  };
  return keys[field] ?? null;
}

function Field({
  id,
  label,
  hint,
  optional,
  locale,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  optional?: boolean;
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={`training-${id}`} className="block text-[15px] font-medium text-[var(--ink)]">
        {label}
        {optional && <span className="muted ml-2 text-xs font-normal">{t(locale, "org.training.f.optional")}</span>}
      </label>
      {hint && <p className="muted mt-1 text-sm leading-[1.55]">{hint}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}
