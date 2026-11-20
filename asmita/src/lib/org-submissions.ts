import { randomUUID } from "node:crypto";
import { z } from "zod";
import { decryptField, encryptField } from "@/lib/encryption";
import { hashEmail } from "@/lib/hash";
import { writeAuditLog } from "@/lib/audit";
import {
  AUDIENCE_SIZES,
  INDIAN_STATE_OPTIONS,
  TRAINING_AUDIENCES,
  TRAINING_MODES,
  VOLUNTEER_HOURS,
  VOLUNTEER_ROLES,
  emailSchema,
  messageSchema,
  phoneSchema,
  shortText,
  stateEnum,
  text,
} from "@/lib/org-forms";

/*
 * The shared public-forms pipeline (docs/org/spec.md, WP56). Every outreach
 * form — volunteer applications, training requests, partner inquiries —
 * validates against the Zod schema registered for its kind, stores one
 * OrgSubmission row with the whole form payload encrypted at rest, and
 * notifies the organization inbox. WP57 adds more partner kinds to the same
 * registry. Security (CSRF, body cap, rate limits, honeypot) lives in the
 * route: src/app/api/org/submissions/route.ts.
 */

export const ORG_SUBMISSION_KINDS = ["VOLUNTEER", "TRAINING_REQUEST", "PARTNER_INQUIRY"] as const;
export type OrgSubmissionKind = (typeof ORG_SUBMISSION_KINDS)[number];

export const ORG_SUBMISSION_STATUSES = ["NEW", "IN_REVIEW", "ACCEPTED", "DECLINED", "CLOSED"] as const;
export type OrgSubmissionStatus = (typeof ORG_SUBMISSION_STATUSES)[number];

const honeypot = { fax: z.string().max(200).optional() };
const stateField = z.string().refine((value) => INDIAN_STATE_OPTIONS.includes(value), "unknown_state");
void stateEnum;

export const volunteerSchema = z
  .object({
    name: shortText,
    email: emailSchema,
    phone: phoneSchema,
    city: shortText,
    state: stateField,
    languages: z.array(text(2, 30)).min(1).max(20),
    languagesOther: text(2, 40).optional(),
    roles: z.array(
      z.enum(Object.keys(VOLUNTEER_ROLES) as [keyof typeof VOLUNTEER_ROLES, ...(keyof typeof VOLUNTEER_ROLES)[]]),
    )
      .min(1)
      .max(3),
    hours: z.enum(Object.keys(VOLUNTEER_HOURS) as [keyof typeof VOLUNTEER_HOURS, ...(keyof typeof VOLUNTEER_HOURS)[]]),
    experience: z.string().trim().min(20).max(1500),
    heardFrom: text(2, 120).optional(),
    adult: z.literal(true),
    consent: z.literal(true),
    ...honeypot,
  })
  .strict();

export const trainingRequestSchema = z
  .object({
    organizationName: shortText,
    audienceType: z.enum(Object.keys(TRAINING_AUDIENCES) as [keyof typeof TRAINING_AUDIENCES, ...(keyof typeof TRAINING_AUDIENCES)[]]),
    contactName: shortText,
    role: shortText,
    email: emailSchema,
    phone: phoneSchema,
    city: shortText,
    state: stateField,
    audienceSize: z.enum(Object.keys(AUDIENCE_SIZES) as [keyof typeof AUDIENCE_SIZES, ...(keyof typeof AUDIENCE_SIZES)[]]),
    preferredMonths: text(2, 80),
    language: z.enum(["English", "Hindi", "English or Hindi", "Other"] as const),
    languageOther: text(2, 40).optional(),
    mode: z.enum(Object.keys(TRAINING_MODES) as [keyof typeof TRAINING_MODES, ...(keyof typeof TRAINING_MODES)[]]),
    message: messageSchema,
    ...honeypot,
  })
  .strict();

export const partnerInquirySchema = z
  .object({
    organizationName: shortText,
    organizationType: z.enum(["NGO", "LEGAL", "LAW_ENFORCEMENT", "ACADEMIC", "PLATFORM", "OTHER"] as const),
    website: z.string().trim().url().max(300).optional(),
    contactName: shortText,
    role: shortText,
    email: emailSchema,
    phone: phoneSchema,
    city: shortText,
    state: stateField,
    message: z.string().trim().min(10).max(1500),
    ...honeypot,
  })
  .strict();

export type OrgFormDefinition = {
  kind: OrgSubmissionKind;
  schema: z.ZodType;
  /** Tab label in the admin console. */
  adminTitle: string;
  /** Ordered field rows for the admin detail view and the CSV export. */
  detailRows: (payload: Record<string, unknown>) => { label: string; value: string }[];
  /** Email to the organization inbox (subject and body). */
  inboxSubject: (payload: Record<string, unknown>) => string;
  /** Short acknowledgement to the applicant. */
  ackSubject: string;
  ackLines: string[];
};

const show = (value: unknown) => (value === undefined || value === null || value === "" ? "Not given" : String(value));
const list = (value: unknown) => (Array.isArray(value) ? value.map(String).join(", ") : show(value));
const labelled =
  (labels: Record<string, string>, order: string[]) =>
  (payload: Record<string, unknown>) =>
    order.map((key) => ({ label: labels[key] ?? key, value: list(payload[key]) }));

export const ORG_FORMS: Record<OrgSubmissionKind, OrgFormDefinition> = {
  VOLUNTEER: {
    kind: "VOLUNTEER",
    schema: volunteerSchema,
    adminTitle: "Volunteer applications",
    detailRows: labelled(
      {
        name: "Name",
        email: "Email",
        phone: "Phone",
        city: "City",
        state: "State",
        languages: "Languages",
        languagesOther: "Other language",
        roles: "Roles of interest",
        hours: "Time available",
        experience: "Experience",
        heardFrom: "Heard about us via",
      },
      ["name", "email", "phone", "city", "state", "languages", "languagesOther", "roles", "hours", "experience", "heardFrom"],
    ),
    inboxSubject: (payload) => `New volunteer application: ${show(payload.name)}`,
    ackSubject: "We have your volunteer application",
    ackLines: [
      "Thank you for offering your time. We read every application.",
      "If your skills match a current need, we will write to you about a short call.",
      "Volunteers never see survivors' case details.",
    ],
  },
  TRAINING_REQUEST: {
    kind: "TRAINING_REQUEST",
    schema: trainingRequestSchema,
    adminTitle: "Training requests",
    detailRows: labelled(
      {
        organizationName: "Organization",
        audienceType: "Programme",
        contactName: "Contact",
        role: "Role",
        email: "Email",
        phone: "Phone",
        city: "City",
        state: "State",
        audienceSize: "Audience size",
        preferredMonths: "Preferred months",
        language: "Language",
        languageOther: "Other language",
        mode: "Format",
        message: "Message",
      },
      [
        "organizationName",
        "audienceType",
        "contactName",
        "role",
        "email",
        "phone",
        "city",
        "state",
        "audienceSize",
        "preferredMonths",
        "language",
        "languageOther",
        "mode",
        "message",
      ],
    ),
    inboxSubject: (payload) => `Training request: ${show(payload.organizationName)}`,
    ackSubject: "We have your training request",
    ackLines: [
      "Thank you for asking about a session. We will reply about dates and details.",
      "Sessions are delivered online or in person, in English or Hindi.",
    ],
  },
  PARTNER_INQUIRY: {
    kind: "PARTNER_INQUIRY",
    schema: partnerInquirySchema,
    adminTitle: "Partner inquiries",
    detailRows: labelled(
      {
        organizationName: "Organization",
        organizationType: "Type",
        website: "Website",
        contactName: "Contact",
        role: "Role",
        email: "Email",
        phone: "Phone",
        city: "City",
        state: "State",
        message: "Message",
      },
      ["organizationName", "organizationType", "website", "contactName", "role", "email", "phone", "city", "state", "message"],
    ),
    inboxSubject: (payload) => `Partner inquiry: ${show(payload.organizationName)}`,
    ackSubject: "We have your partnership inquiry",
    ackLines: [
      "Thank you for writing. We will reply to discuss what a partnership could look like.",
      "We never share survivor data with anyone without the survivor's choice.",
    ],
  },
};

export type OrgSubmission = {
  id: string;
  kind: OrgSubmissionKind;
  status: OrgSubmissionStatus;
  payload: Record<string, unknown>;
  email: string;
  emailHash: string;
  internalNotes: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// Local development and tests without a database keep submissions here, capped.
export const orgSubmissions: OrgSubmission[] = [];
const MAX_MEMORY_SUBMISSIONS = 500;

function devNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

function remember(submission: OrgSubmission) {
  orgSubmissions.push(submission);
  if (orgSubmissions.length > MAX_MEMORY_SUBMISSIONS) {
    orgSubmissions.splice(0, orgSubmissions.length - MAX_MEMORY_SUBMISSIONS);
  }
}

const open = (value: string | null) => {
  if (!value) return undefined;
  try {
    return decryptField(value);
  } catch {
    return "[could not decrypt]";
  }
};

function rowToSubmission(row: Record<string, unknown>): OrgSubmission {
  let payload: Record<string, unknown> = {};
  const decrypted = open(row.payload as string);
  if (decrypted) {
    try {
      payload = JSON.parse(decrypted) as Record<string, unknown>;
    } catch {
      payload = { raw: decrypted };
    }
  }
  return {
    id: row.id as string,
    kind: row.kind as OrgSubmissionKind,
    status: row.status as OrgSubmissionStatus,
    payload,
    email: payload.email != null ? String(payload.email) : (open((row as { email?: string }).email ?? null) ?? ""),
    emailHash: row.emailHash as string,
    internalNotes: (row.internalNotes as string | null) ?? null,
    closedAt: row.closedAt ? new Date(row.closedAt as string).toISOString() : null,
    createdAt: new Date(row.createdAt as string).toISOString(),
    updatedAt: new Date(row.updatedAt as string).toISOString(),
  };
}

/** Validate and store one form response. The route has already run CSRF, rate limits and the honeypot. */
export async function recordOrgSubmission(kind: OrgSubmissionKind, fields: Record<string, unknown>): Promise<{ id: string; emailHash: string }> {
  const emailHash = hashEmail(String(fields.email ?? ""));
  const payload = encryptField(JSON.stringify(fields));
  const now = new Date().toISOString();
  const { fax, ...rest } = fields;
  void fax;
  const submission: OrgSubmission = {
    id: randomUUID(),
    kind,
    status: "NEW",
    payload: rest,
    email: String(rest.email ?? ""),
    emailHash,
    internalNotes: null,
    closedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  if (devNoDb()) {
    remember(submission);
  } else {
    const { db } = await import("@/lib/db");
    await db.orgSubmission.create({ data: { id: submission.id, kind, status: "NEW", payload, emailHash } });
  }
  return { id: submission.id, emailHash };
}

export async function listOrgSubmissions(options: { kind?: OrgSubmissionKind; status?: OrgSubmissionStatus } = {}): Promise<OrgSubmission[]> {
  if (devNoDb()) {
    return orgSubmissions
      .filter(
        (entry) => (!options.kind || entry.kind === options.kind) && (!options.status || entry.status === options.status),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const { db } = await import("@/lib/db");
  const rows = await db.orgSubmission.findMany({
    where: { ...(options.kind ? { kind: options.kind } : {}), ...(options.status ? { status: options.status } : {}) },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(rowToSubmission);
}

export async function getOrgSubmission(id: string): Promise<OrgSubmission | null> {
  if (devNoDb()) return orgSubmissions.find((entry) => entry.id === id) ?? null;
  const { db } = await import("@/lib/db");
  const row = await db.orgSubmission.findUnique({ where: { id } });
  return row ? rowToSubmission(row) : null;
}

export async function setOrgSubmissionStatus(
  id: string,
  status: OrgSubmissionStatus,
  actorId: string,
): Promise<{ ok: true } | { ok: false; error: "submission_not_found" }> {
  // Closing the record (done, or declined) starts its retention clock.
  const closedAt = status === "CLOSED" || status === "DECLINED" ? new Date() : null;
  if (devNoDb()) {
    const current = orgSubmissions.find((entry) => entry.id === id);
    if (!current) return { ok: false, error: "submission_not_found" };
    current.status = status;
    if (closedAt) current.closedAt = closedAt.toISOString();
    current.updatedAt = new Date().toISOString();
  } else {
    const { db } = await import("@/lib/db");
    const existing = await db.orgSubmission.findUnique({ where: { id }, select: { closedAt: true } });
    if (!existing) return { ok: false, error: "submission_not_found" };
    const data: { status: string; closedAt?: Date | null } = { status };
    if (closedAt) data.closedAt = closedAt;
    await db.orgSubmission.update({ where: { id }, data });
  }
  await writeAuditLog({
    eventType: "ORG_SUBMISSION_STATUS_CHANGED",
    entityType: "OrgSubmission",
    entityId: id,
    actorId,
    data: { status },
  });
  return { ok: true };
}

export async function addOrgSubmissionNote(
  id: string,
  note: string,
  actorId: string,
): Promise<{ ok: true; notes: string | null } | { ok: false; error: "submission_not_found" }> {
  const stamped = `${new Date().toISOString()} — ${note}`;
  let notes: string | null;
  if (devNoDb()) {
    const current = orgSubmissions.find((entry) => entry.id === id);
    if (!current) return { ok: false, error: "submission_not_found" };
    current.internalNotes = current.internalNotes ? `${current.internalNotes}\n${stamped}` : stamped;
    current.updatedAt = new Date().toISOString();
    notes = current.internalNotes;
  } else {
    const { db } = await import("@/lib/db");
    const existing = await db.orgSubmission.findUnique({ where: { id }, select: { internalNotes: true } });
    if (!existing) return { ok: false, error: "submission_not_found" };
    notes = existing.internalNotes ? `${existing.internalNotes}\n${stamped}` : stamped;
    await db.orgSubmission.update({ where: { id }, data: { internalNotes: notes } });
  }
  await writeAuditLog({
    eventType: "ORG_SUBMISSION_NOTED",
    entityType: "OrgSubmission",
    entityId: id,
    actorId,
    data: { noteLength: note.length },
  });
  return { ok: true, notes };
}

/** CSV of the filtered list. Personal fields are included: the export goes to the organization's own admin. */
export async function exportOrgSubmissionsCsv(
  options: { kind?: OrgSubmissionKind; status?: OrgSubmissionStatus },
  actorId: string,
): Promise<string> {
  const rows = await listOrgSubmissions(options);
  // Uniform columns across kinds, so a mixed export stays one table. The
  // admin detail view carries the full field list per kind.
  const header = ["id", "kind", "status", "createdAt", "closedAt", "contact", "email", "city", "state"];
  const lines = [header.join(",")];
  for (const row of rows) {
    const payload = row.payload as Record<string, unknown>;
    const contact = payload.name ?? payload.contactName ?? "";
    const cell = (value: unknown) => csvCell(value == null ? "" : String(value));
    lines.push(
      [row.id, row.kind, row.status, row.createdAt, row.closedAt ?? "", contact, row.email, payload.city ?? "", payload.state ?? ""]
        .map(cell)
        .join(","),
    );
  }
  await writeAuditLog({
    eventType: "ORG_SUBMISSION_EXPORTED",
    entityType: "OrgSubmission",
    actorId,
    data: { kind: options.kind ?? "ALL", status: options.status ?? "ALL", count: rows.length },
  });
  return `${lines.join("\n")}\n`;
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
