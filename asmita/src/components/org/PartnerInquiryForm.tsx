"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { csrfFetch } from "@/lib/client-csrf";
import { t, type Locale } from "@/lib/i18n";
import {
  ACADEMIC_INTERESTS,
  ACADEMIC_PARTNER_TYPES,
  INDIAN_STATE_OPTIONS,
  LEGAL_PARTNER_TYPES,
  LEGAL_PRACTICE_AREAS,
  NGO_PARTNER_TYPES,
  NGO_SERVICES,
  PAN_INDIA,
  POLICE_INTERESTS,
  POLICE_PARTNER_TYPES,
  PRO_BONO_HOURS,
  type PartnerFormType,
} from "@/lib/org-forms";

// The partner inquiry form (docs/org/spec.md, 57.2), one client of the shared
// org forms pipeline: POST /api/org/submissions with kind=PARTNER_<TYPE>.
// Every type page renders this component with its own field block. Local
// validation mirrors the server schema so people get field errors fast.

const KIND_BY_TYPE: Record<PartnerFormType, string> = {
  ngos: "PARTNER_NGO",
  legal: "PARTNER_LEGAL",
  "law-enforcement": "PARTNER_LAW_ENFORCEMENT",
  academic: "PARTNER_ACADEMIC",
};

const TYPE_OPTIONS: Record<PartnerFormType, Record<string, string>> = {
  ngos: NGO_PARTNER_TYPES,
  legal: LEGAL_PARTNER_TYPES,
  "law-enforcement": POLICE_PARTNER_TYPES,
  academic: ACADEMIC_PARTNER_TYPES,
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9 ()-]{7,20}$/;

type Fields = {
  organizationName: string;
  type: string;
  website: string;
  city: string;
  state: string;
  contactName: string;
  role: string;
  email: string;
  phone: string;
  message: string;
  helplineNumber: string;
  barState: string;
  proBonoHours: string;
  unit: string;
  district: string;
  interest: string;
  department: string;
};

const EMPTY: Fields = {
  organizationName: "",
  type: "",
  website: "",
  city: "",
  state: "",
  contactName: "",
  role: "",
  email: "",
  phone: "",
  message: "",
  helplineNumber: "",
  barState: "",
  proBonoHours: "",
  unit: "",
  district: "",
  interest: "",
  department: "",
};

type ErrorKey = Parameters<typeof t>[1];

function errorKey(field: string): ErrorKey {
  const keys: Record<string, ErrorKey> = {
    organizationName: "org.partners.form.err.organizationName",
    type: "org.partners.form.err.type",
    website: "org.partners.form.err.website",
    city: "org.partners.form.err.city",
    state: "org.partners.form.err.state",
    contactName: "org.partners.form.err.contactName",
    role: "org.partners.form.err.role",
    email: "org.partners.form.err.email",
    phone: "org.partners.form.err.phone",
    message: "org.partners.form.err.message",
    areasServed: "org.partners.form.err.areasServed",
    helplineNumber: "org.partners.form.err.phone",
    services: "org.partners.form.err.services",
    barState: "org.partners.form.err.barState",
    practiceAreas: "org.partners.form.err.practiceAreas",
    proBonoHours: "org.partners.form.err.proBonoHours",
    unit: "org.partners.form.err.unit",
    district: "org.partners.form.err.district",
    interest: "org.partners.form.err.interest",
    department: "org.partners.form.err.department",
  };
  return keys[field] ?? "org.partners.form.errorGeneric";
}

function Field({
  id,
  label,
  hint,
  locale: _locale,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  locale: Locale;
  children: ReactNode;
}) {
  void _locale;
  return (
    <div>
      <label htmlFor={id} className="block text-[15px] font-medium text-[var(--ink)]">
        {label}
      </label>
      {hint && <p className="muted mt-1 text-sm leading-[1.55]">{hint}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

export function PartnerInquiryForm({ type, locale }: { type: PartnerFormType; locale: Locale }) {
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [areasServed, setAreasServed] = useState<string[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [practiceAreas, setPracticeAreas] = useState<string[]>([]);
  const [fax, setFax] = useState("");
  const [errorField, setErrorField] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const set = (key: keyof Fields) => (value: string) => setFields((current) => ({ ...current, [key]: value }));

  function toggle(list: string[], setter: (next: string[]) => void, value: string) {
    setter(list.includes(value) ? list.filter((entry) => entry !== value) : [...new Set([...list, value])]);
  }

  function localError(): string | null {
    if (fields.organizationName.trim().length < 2) return "organizationName";
    if (!fields.type) return "type";
    if (fields.website.trim() && !/^https?:\/\/[^\s]+\.[^\s]+/.test(fields.website.trim())) return "website";
    if (fields.city.trim().length < 2) return "city";
    if (!fields.state) return "state";
    if (fields.contactName.trim().length < 2) return "contactName";
    if (fields.role.trim().length < 2) return "role";
    if (!EMAIL.test(fields.email.trim())) return "email";
    if (fields.phone.trim() && !PHONE.test(fields.phone.trim())) return "phone";
    if (type === "ngos") {
      if (areasServed.length === 0) return "areasServed";
      if (fields.helplineNumber.trim() && !PHONE.test(fields.helplineNumber.trim())) return "helplineNumber";
      if (services.length === 0) return "services";
    }
    if (type === "legal") {
      if (fields.barState && !INDIAN_STATE_OPTIONS.includes(fields.barState)) return "barState";
      if (practiceAreas.length === 0) return "practiceAreas";
      if (!fields.proBonoHours) return "proBonoHours";
    }
    if (type === "law-enforcement") {
      if (fields.unit.trim().length < 2) return "unit";
      if (fields.district.trim().length < 2) return "district";
      if (!fields.interest) return "interest";
    }
    if (type === "academic") {
      if (fields.department.trim().length < 2) return "department";
      if (!fields.interest) return "interest";
    }
    if (fields.message.trim().length < 10) return "message";
    return null;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const problem = localError();
    if (problem) {
      setErrorField(problem);
      setError(t(locale, errorKey(problem)));
      document.getElementById(`${type}-${problem}`)?.focus();
      return;
    }
    setErrorField(null);
    setSubmitting(true);
    const payload: Record<string, unknown> = {
      kind: KIND_BY_TYPE[type],
      organizationName: fields.organizationName.trim(),
      type: fields.type,
      website: fields.website.trim() || undefined,
      contactName: fields.contactName.trim(),
      role: fields.role.trim(),
      email: fields.email.trim(),
      phone: fields.phone.trim() || undefined,
      city: fields.city.trim(),
      state: fields.state,
      message: fields.message.trim(),
      fax: fax || undefined,
    };
    if (type === "ngos") {
      payload.areasServed = areasServed;
      payload.helplineNumber = fields.helplineNumber.trim() || undefined;
      payload.services = services;
    }
    if (type === "legal") {
      payload.barState = fields.barState || undefined;
      payload.practiceAreas = practiceAreas;
      payload.proBonoHours = fields.proBonoHours;
    }
    if (type === "law-enforcement") {
      payload.unit = fields.unit.trim();
      payload.district = fields.district.trim();
      payload.interest = fields.interest;
    }
    if (type === "academic") {
      payload.department = fields.department.trim();
      payload.interest = fields.interest;
    }
    const response = await csrfFetch("/api/org/submissions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    setSubmitting(false);
    if (response?.ok) {
      setSent(true);
      return;
    }
    const data = ((await response?.json().catch(() => ({}))) ?? {}) as { error?: string; field?: string };
    if (data.field) setErrorField(data.field);
    setError(
      data.error === "already_received"
        ? t(locale, "org.partners.form.errorAlready")
        : data.error === "rate_limited"
          ? t(locale, "org.partners.form.errorRate")
          : data.field
            ? t(locale, errorKey(data.field))
            : t(locale, "org.partners.form.errorGeneric"),
    );
  }

  if (sent) {
    return (
      <div className="mt-10 text-center" role="status" aria-live="polite" aria-atomic="true">
        <p className="font-display text-[26px] leading-[1.35] tracking-tight text-[var(--ink)] md:text-[32px]">
          {t(locale, "org.partners.form.successTitle")}
        </p>
        <p className="muted mx-auto mt-4 max-w-md text-base leading-[1.75]">{t(locale, "org.partners.form.successBody")}</p>
      </div>
    );
  }

  const invalid = (name: string) => (errorField === name ? true : undefined);
  const typeOptions = Object.entries(TYPE_OPTIONS[type]) as [string, string][];
  const interestOptions: Record<string, string> =
    type === "law-enforcement" ? POLICE_INTERESTS : ACADEMIC_INTERESTS;

  return (
    <form className="mt-10 space-y-10" onSubmit={submit} noValidate>
      <fieldset className="space-y-6">
        <legend className="eyebrow">{t(locale, "org.partners.form.sectionOrg")}</legend>
        <div className="grid gap-6 md:grid-cols-2">
          <Field id={`${type}-organizationName`} label={t(locale, "org.partners.form.orgName")} locale={locale}>
            <input
              className="field"
              id={`${type}-organizationName`}
              autoComplete="organization"
              value={fields.organizationName}
              onChange={(e) => set("organizationName")(e.target.value)}
              aria-invalid={invalid("organizationName")}
              maxLength={120}
            />
          </Field>
          <Field id={`${type}-type`} label={t(locale, "org.partners.form.type")} locale={locale}>
            <select
              className="field"
              id={`${type}-type`}
              value={fields.type}
              onChange={(e) => set("type")(e.target.value)}
              aria-invalid={invalid("type")}
            >
              <option value="">{t(locale, "org.partners.form.select")}</option>
              {typeOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Field id={`${type}-website`} label={t(locale, "org.partners.form.website")} locale={locale}>
            <input
              className="field"
              id={`${type}-website`}
              type="url"
              inputMode="url"
              placeholder="https://"
              value={fields.website}
              onChange={(e) => set("website")(e.target.value)}
              aria-invalid={invalid("website")}
              maxLength={300}
            />
          </Field>
          <Field id={`${type}-city`} label={t(locale, "org.partners.form.city")} locale={locale}>
            <input
              className="field"
              id={`${type}-city`}
              autoComplete="address-level2"
              value={fields.city}
              onChange={(e) => set("city")(e.target.value)}
              aria-invalid={invalid("city")}
              maxLength={120}
            />
          </Field>
        </div>
        <Field id={`${type}-state`} label={t(locale, "org.partners.form.state")} locale={locale}>
          <select
            className="field"
            id={`${type}-state`}
            value={fields.state}
            onChange={(e) => set("state")(e.target.value)}
            aria-invalid={invalid("state")}
          >
            <option value="">{t(locale, "org.partners.form.selectState")}</option>
            {INDIAN_STATE_OPTIONS.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </Field>

        {type === "ngos" && (
          <>
            <Field
              id={`${type}-areasServed`}
              label={t(locale, "org.partners.form.areasServed")}
              hint={t(locale, "org.partners.form.areasHint")}
              locale={locale}
            >
              <div
                className="max-h-64 overflow-y-auto rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--surface-muted)] p-4"
                id={`${type}-areasServed`}
                tabIndex={-1}
              >
                <div className="grid gap-2 sm:grid-cols-3">
                  {[PAN_INDIA, ...INDIAN_STATE_OPTIONS].map((state) => (
                    <label key={state} className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand)]"
                        checked={areasServed.includes(state)}
                        onChange={() => toggle(areasServed, setAreasServed, state)}
                      />
                      <span className="text-sm leading-[1.5] text-[var(--ink)]">{state}</span>
                    </label>
                  ))}
                </div>
              </div>
            </Field>
            <Field id={`${type}-helplineNumber`} label={t(locale, "org.partners.form.helpline")} locale={locale}>
              <input
                className="field"
                id={`${type}-helplineNumber`}
                type="tel"
                value={fields.helplineNumber}
                onChange={(e) => set("helplineNumber")(e.target.value)}
                aria-invalid={invalid("helplineNumber")}
                maxLength={20}
              />
            </Field>
            <Field id={`${type}-services`} label={t(locale, "org.partners.form.services")} locale={locale}>
              <div className="grid gap-3 sm:grid-cols-2" id={`${type}-services`} tabIndex={-1}>
                {(Object.entries(NGO_SERVICES) as [string, string][]).map(([value, label]) => (
                  <label key={value} className="partner-choice">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]"
                      checked={services.includes(value)}
                      onChange={() => toggle(services, setServices, value)}
                    />
                    <span className="text-[15px] leading-[1.5] text-[var(--ink)]">{label}</span>
                  </label>
                ))}
              </div>
            </Field>
          </>
        )}

        {type === "legal" && (
          <>
            <Field id={`${type}-barState`} label={t(locale, "org.partners.form.barState")} locale={locale}>
              <select
                className="field"
                id={`${type}-barState`}
                value={fields.barState}
                onChange={(e) => set("barState")(e.target.value)}
                aria-invalid={invalid("barState")}
              >
                <option value="">{t(locale, "org.partners.form.selectState")}</option>
                {INDIAN_STATE_OPTIONS.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </Field>
            <Field id={`${type}-practiceAreas`} label={t(locale, "org.partners.form.practiceAreas")} locale={locale}>
              <div className="grid gap-3 sm:grid-cols-2" id={`${type}-practiceAreas`} tabIndex={-1}>
                {(Object.entries(LEGAL_PRACTICE_AREAS) as [string, string][]).map(([value, label]) => (
                  <label key={value} className="partner-choice">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]"
                      checked={practiceAreas.includes(value)}
                      onChange={() => toggle(practiceAreas, setPracticeAreas, value)}
                    />
                    <span className="text-[15px] leading-[1.5] text-[var(--ink)]">{label}</span>
                  </label>
                ))}
              </div>
            </Field>
            <Field id={`${type}-proBonoHours`} label={t(locale, "org.partners.form.proBonoHours")} locale={locale}>
              <select
                className="field max-w-sm"
                id={`${type}-proBonoHours`}
                value={fields.proBonoHours}
                onChange={(e) => set("proBonoHours")(e.target.value)}
                aria-invalid={invalid("proBonoHours")}
              >
                <option value="">{t(locale, "org.partners.form.select")}</option>
                {(Object.entries(PRO_BONO_HOURS) as [string, string][]).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}

        {type === "law-enforcement" && (
          <div className="grid gap-6 md:grid-cols-2">
            <Field id={`${type}-unit`} label={t(locale, "org.partners.form.unit")} locale={locale}>
              <input
                className="field"
                id={`${type}-unit`}
                value={fields.unit}
                onChange={(e) => set("unit")(e.target.value)}
                aria-invalid={invalid("unit")}
                maxLength={120}
              />
            </Field>
            <Field id={`${type}-district`} label={t(locale, "org.partners.form.district")} locale={locale}>
              <input
                className="field"
                id={`${type}-district`}
                value={fields.district}
                onChange={(e) => set("district")(e.target.value)}
                aria-invalid={invalid("district")}
                maxLength={120}
              />
            </Field>
          </div>
        )}

        {(type === "law-enforcement" || type === "academic") && (
          <Field id={`${type}-interest`} label={t(locale, "org.partners.form.interest")} locale={locale}>
            <select
              className="field max-w-sm"
              id={`${type}-interest`}
              value={fields.interest}
              onChange={(e) => set("interest")(e.target.value)}
              aria-invalid={invalid("interest")}
            >
              <option value="">{t(locale, "org.partners.form.select")}</option>
              {(Object.entries(interestOptions) as [string, string][]).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        )}

        {type === "academic" && (
          <Field id={`${type}-department`} label={t(locale, "org.partners.form.department")} locale={locale}>
            <input
              className="field"
              id={`${type}-department`}
              value={fields.department}
              onChange={(e) => set("department")(e.target.value)}
              aria-invalid={invalid("department")}
              maxLength={120}
            />
          </Field>
        )}
      </fieldset>

      <fieldset className="space-y-6">
        <legend className="eyebrow">{t(locale, "org.partners.form.sectionContact")}</legend>
        <div className="grid gap-6 md:grid-cols-2">
          <Field id={`${type}-contactName`} label={t(locale, "org.partners.form.contactName")} locale={locale}>
            <input
              className="field"
              id={`${type}-contactName`}
              autoComplete="name"
              value={fields.contactName}
              onChange={(e) => set("contactName")(e.target.value)}
              aria-invalid={invalid("contactName")}
              maxLength={120}
            />
          </Field>
          <Field id={`${type}-role`} label={t(locale, "org.partners.form.role")} locale={locale}>
            <input
              className="field"
              id={`${type}-role`}
              value={fields.role}
              onChange={(e) => set("role")(e.target.value)}
              aria-invalid={invalid("role")}
              maxLength={120}
            />
          </Field>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Field id={`${type}-email`} label={t(locale, "org.partners.form.email")} locale={locale}>
            <input
              className="field"
              id={`${type}-email`}
              type="email"
              autoComplete="email"
              value={fields.email}
              onChange={(e) => set("email")(e.target.value)}
              aria-invalid={invalid("email")}
              maxLength={254}
            />
          </Field>
          <Field id={`${type}-phone`} label={t(locale, "org.partners.form.phone")} locale={locale}>
            <input
              className="field"
              id={`${type}-phone`}
              type="tel"
              autoComplete="tel"
              value={fields.phone}
              onChange={(e) => set("phone")(e.target.value)}
              aria-invalid={invalid("phone")}
              maxLength={20}
            />
          </Field>
        </div>
        <Field
          id={`${type}-message`}
          label={t(locale, "org.partners.form.message")}
          hint={t(locale, "org.partners.form.messageHint")}
          locale={locale}
        >
          <textarea
            className="field min-h-32 leading-[1.65]"
            id={`${type}-message`}
            value={fields.message}
            onChange={(e) => set("message")(e.target.value)}
            aria-invalid={invalid("message")}
            maxLength={1500}
          />
        </Field>
      </fieldset>

      {/* Hidden from people and screen readers; bots fill it in. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-px w-px overflow-hidden">
        <label htmlFor={`${type}-fax`}>Fax</label>
        <input id={`${type}-fax`} tabIndex={-1} autoComplete="off" value={fax} onChange={(e) => setFax(e.target.value)} />
      </div>

      {error && (
        <p className="text-center text-sm font-medium text-[var(--danger)]" role="alert" aria-live="assertive">
          {error}
        </p>
      )}

      <div className="text-center">
        <button className="btn btn-primary btn-arrow !m-0" type="submit" disabled={submitting}>
          {submitting ? t(locale, "org.partners.form.sending") : t(locale, "org.partners.form.submit")}
        </button>
        <p className="muted mx-auto mt-4 max-w-md text-xs leading-[1.7]">{t(locale, "org.partners.form.privacyNote")}</p>
      </div>
    </form>
  );
}
