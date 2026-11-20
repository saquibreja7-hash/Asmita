"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { csrfFetch } from "@/lib/client-csrf";
import { t, type Locale } from "@/lib/i18n";
import {
  INDIAN_STATE_OPTIONS,
  VOLUNTEER_HOURS,
  VOLUNTEER_ROLES,
  languageOptions,
  type VolunteerHours,
  type VolunteerRole,
} from "@/lib/org-forms";

// The volunteer application (56.4), one client of the shared org forms
// pipeline: POST /api/org/submissions with kind=VOLUNTEER. Local validation
// mirrors the server schema so people get field-level errors fast.

type Fields = {
  name: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  languagesOther: string;
  hours: string;
  experience: string;
  heardFrom: string;
};

const EMPTY: Fields = {
  name: "",
  email: "",
  phone: "",
  city: "",
  state: "",
  languagesOther: "",
  hours: "",
  experience: "",
  heardFrom: "",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9 ()-]{7,20}$/;

export function VolunteerForm({ locale }: { locale: Locale }) {
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [languages, setLanguages] = useState<string[]>([]);
  const [roles, setRoles] = useState<VolunteerRole[]>([]);
  const [adult, setAdult] = useState(false);
  const [consent, setConsent] = useState(false);
  const [fax, setFax] = useState("");
  const [errorField, setErrorField] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const set = (key: keyof Fields) => (value: string) => setFields((current) => ({ ...current, [key]: value }));

  function localError(): string | null {
    if (fields.name.trim().length < 2) return "name";
    if (!EMAIL.test(fields.email.trim())) return "email";
    if (fields.phone.trim() && !PHONE.test(fields.phone.trim())) return "phone";
    if (fields.city.trim().length < 2) return "city";
    if (!fields.state) return "state";
    if (languages.length === 0) return "languages";
    if (roles.length === 0 || roles.length > 3) return "roles";
    if (!fields.hours) return "hours";
    if (fields.experience.trim().length < 20) return "experience";
    if (!adult) return "adult";
    if (!consent) return "consent";
    return null;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const problem = localError();
    if (problem) {
      setErrorField(problem);
      setError(t(locale, errorMessageKey(problem)));
      document.getElementById(`volunteer-${problem}`)?.focus();
      return;
    }
    setErrorField(null);
    setSubmitting(true);
    const response = await csrfFetch("/api/org/submissions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "VOLUNTEER",
        name: fields.name.trim(),
        email: fields.email.trim(),
        phone: fields.phone.trim() || undefined,
        city: fields.city.trim(),
        state: fields.state,
        languages: languages.includes("Other") && fields.languagesOther.trim() ? [...languages] : languages,
        languagesOther: fields.languagesOther.trim() || undefined,
        roles,
        hours: fields.hours,
        experience: fields.experience.trim(),
        heardFrom: fields.heardFrom.trim() || undefined,
        adult: true,
        consent: true,
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
        ? t(locale, "org.volunteer.f.errorAlready")
        : payload.error === "rate_limited"
          ? t(locale, "org.volunteer.f.errorRate")
          : payload.field && t(locale, errorMessageKey(payload.field))
            ? t(locale, errorMessageKey(payload.field))
            : t(locale, "org.volunteer.f.errorGeneric"),
    );
  }

  if (sent) {
    return (
      <div className="mt-10 text-center" role="status" aria-live="polite" aria-atomic="true">
        <p className="font-display text-[26px] leading-[1.35] tracking-tight text-[var(--ink)] md:text-[32px]">
          {t(locale, "org.volunteer.f.successTitle")}
        </p>
        <p className="muted mx-auto mt-4 max-w-md text-base leading-[1.75]">{t(locale, "org.volunteer.f.successBody")}</p>
      </div>
    );
  }

  const invalid = (name: string) => (errorField === name ? true : undefined);

  return (
    <form className="mt-10 space-y-10" onSubmit={submit} noValidate>
      <fieldset className="space-y-6">
        <legend className="eyebrow">{t(locale, "org.volunteer.f.sectionContact")}</legend>
        <div className="grid gap-6 md:grid-cols-2">
          <Field id="name" label={t(locale, "org.volunteer.f.name")} locale={locale}>
            <input className="field" id="volunteer-name" autoComplete="name" value={fields.name} onChange={(e) => set("name")(e.target.value)} aria-invalid={invalid("name")} maxLength={120} />
          </Field>
          <Field id="email" label={t(locale, "org.volunteer.f.email")} locale={locale}>
            <input className="field" id="volunteer-email" type="email" autoComplete="email" value={fields.email} onChange={(e) => set("email")(e.target.value)} aria-invalid={invalid("email")} maxLength={254} />
          </Field>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Field id="phone" label={t(locale, "org.volunteer.f.phone")} optional locale={locale}>
            <input className="field" id="volunteer-phone" type="tel" autoComplete="tel" value={fields.phone} onChange={(e) => set("phone")(e.target.value)} aria-invalid={invalid("phone")} maxLength={20} />
          </Field>
          <Field id="city" label={t(locale, "org.volunteer.f.city")} locale={locale}>
            <input className="field" id="volunteer-city" autoComplete="address-level2" value={fields.city} onChange={(e) => set("city")(e.target.value)} aria-invalid={invalid("city")} maxLength={120} />
          </Field>
        </div>
        <Field id="state" label={t(locale, "org.volunteer.f.state")} locale={locale}>
          <select className="field" id="volunteer-state" value={fields.state} onChange={(e) => set("state")(e.target.value)} aria-invalid={invalid("state")}>
            <option value="">{t(locale, "org.volunteer.f.selectState")}</option>
            {INDIAN_STATE_OPTIONS.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </Field>
      </fieldset>

      <fieldset className="space-y-4" aria-describedby="volunteer-languages-hint">
        <legend className="eyebrow">{t(locale, "org.volunteer.f.languages")}</legend>
        <div className="grid gap-3 sm:grid-cols-3" id="volunteer-languages" tabIndex={-1}>
          {languageOptions.map((language) => (
            <label key={language} className="partner-choice">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]"
                checked={languages.includes(language)}
                onChange={(e) => setLanguages((current) => (e.target.checked ? [...new Set([...current, language])] : current.filter((entry) => entry !== language)))}
              />
              <span className="text-[15px] leading-[1.5] text-[var(--ink)]">{language}</span>
            </label>
          ))}
        </div>
        {languages.includes("Other") && (
          <Field id="languagesOther" label={t(locale, "org.volunteer.f.languagesOther")} locale={locale}>
            <input className="field" id="volunteer-languagesOther" value={fields.languagesOther} onChange={(e) => set("languagesOther")(e.target.value)} aria-invalid={invalid("languagesOther")} maxLength={40} />
          </Field>
        )}
      </fieldset>

      <fieldset className="space-y-4" aria-describedby="volunteer-roles-hint">
        <legend className="eyebrow">{t(locale, "org.volunteer.f.roles")}</legend>
        <p id="volunteer-roles-hint" className="muted text-sm leading-[1.6]">
          {t(locale, "org.volunteer.f.rolesHint")}
        </p>
        <div className="grid gap-3 sm:grid-cols-2" id="volunteer-roles" tabIndex={-1}>
          {(Object.entries(VOLUNTEER_ROLES) as [VolunteerRole, string][]).map(([value, label]) => (
            <label key={value} className="partner-choice">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]"
                checked={roles.includes(value)}
                onChange={(e) => setRoles((current) => (e.target.checked ? [...new Set([...current, value])] : current.filter((entry) => entry !== value)))}
              />
              <span className="text-[15px] leading-[1.5] text-[var(--ink)]">{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-6">
        <legend className="eyebrow">{t(locale, "org.volunteer.f.sectionAvailability")}</legend>
        <select className="field max-w-sm" id="volunteer-hours" value={fields.hours} onChange={(e) => set("hours")(e.target.value)} aria-invalid={invalid("hours")}>
          <option value="">{t(locale, "org.volunteer.f.select")}</option>
          {(Object.entries(VOLUNTEER_HOURS) as [VolunteerHours, string][]).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Field id="experience" label={t(locale, "org.volunteer.f.experience")} hint={t(locale, "org.volunteer.f.experienceHint")} locale={locale}>
          <textarea
            className="field min-h-32 leading-[1.65]"
            id="volunteer-experience"
            value={fields.experience}
            onChange={(e) => set("experience")(e.target.value)}
            aria-invalid={invalid("experience")}
            maxLength={1500}
          />
        </Field>
        <Field id="heardFrom" label={t(locale, "org.volunteer.f.heard")} optional locale={locale}>
          <input className="field" id="volunteer-heardFrom" value={fields.heardFrom} onChange={(e) => set("heardFrom")(e.target.value)} maxLength={120} />
        </Field>
      </fieldset>

      {/* Hidden from people and screen readers; bots fill it in. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-px w-px overflow-hidden">
        <label htmlFor="volunteer-fax">Fax</label>
        <input id="volunteer-fax" tabIndex={-1} autoComplete="off" value={fax} onChange={(e) => setFax(e.target.value)} />
      </div>

      <div className="space-y-4">
        <label className="partner-choice" htmlFor="volunteer-adult">
          <input id="volunteer-adult" type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]" checked={adult} onChange={(e) => setAdult(e.target.checked)} aria-invalid={invalid("adult")} />
          <span className="text-[15px] leading-[1.55] text-[var(--ink)]">{t(locale, "org.volunteer.f.adult")}</span>
        </label>
        <label className="partner-choice" htmlFor="volunteer-consent">
          <input id="volunteer-consent" type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]" checked={consent} onChange={(e) => setConsent(e.target.checked)} aria-invalid={invalid("consent")} />
          <span className="text-[15px] leading-[1.55] text-[var(--ink)]">{t(locale, "org.volunteer.f.consent")}</span>
        </label>
      </div>

      {error && (
        <p className="text-center text-sm font-medium text-[var(--danger)]" role="alert" aria-live="assertive">
          {error}
        </p>
      )}

      <div className="text-center">
        <button className="btn btn-primary btn-arrow !m-0" type="submit" disabled={submitting}>
          {submitting ? t(locale, "org.volunteer.f.sending") : t(locale, "org.volunteer.f.submit")}
        </button>
        <p className="muted mx-auto mt-4 max-w-md text-xs leading-[1.7]">{t(locale, "org.volunteer.f.privacyNote")}</p>
      </div>
    </form>
  );
}

function errorMessageKey(field: string): Parameters<typeof t>[1] {
  const keys: Record<string, Parameters<typeof t>[1]> = {
    name: "org.volunteer.f.err.name",
    email: "org.volunteer.f.err.email",
    phone: "org.volunteer.f.err.phone",
    city: "org.volunteer.f.err.city",
    state: "org.volunteer.f.err.state",
    languages: "org.volunteer.f.err.languages",
    roles: "org.volunteer.f.err.roles",
    hours: "org.volunteer.f.err.hours",
    experience: "org.volunteer.f.err.experience",
    adult: "org.volunteer.f.err.adult",
    consent: "org.volunteer.f.err.consent",
  };
  return keys[field] ?? "org.volunteer.f.errorGeneric";
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
      <label htmlFor={`volunteer-${id}`} className="block text-[15px] font-medium text-[var(--ink)]">
        {label}
        {optional && <span className="muted ml-2 text-xs font-normal">{t(locale, "org.volunteer.f.optional")}</span>}
      </label>
      {hint && <p className="muted mt-1 text-sm leading-[1.55]">{hint}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}
