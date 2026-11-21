import { randomUUID } from "node:crypto";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { sendLabReportEmail } from "@/lib/email";
import {
  isoDate,
  LAB_REPORT_CHANNELS,
  LAB_REPORT_OUTCOMES,
  labMemory,
  type LabChokepointKind,
  type LabReportChannel,
  type LabReportOutcome,
  type LabServiceKind,
  type MemoryLabReport,
} from "@/lib/lab/lab-store";
import { getLabChokepoint } from "@/lib/lab/lab-chokepoints";
import { listLabServices, type LabServiceView } from "@/lib/lab/lab-services";
import { getLabProvider } from "@/lib/lab/infra/store";
import { fillLabBulkReportTemplate, fillLabReportTemplate } from "@/lib/lab/report-templates";
import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";

/*
 * E2 (docs/lab/charter.md): chokepoint reports. A draft is rendered from the
 * per-kind template filled with the service's data; the analyst reviews it,
 * may edit the text, and then either sends it by email (Resend, the lab
 * sender) or copies it into the provider's web form — the send is recorded
 * either way, and the outcome is recorded when the provider replies or does
 * not. Every step is audited; audit data carries ids and counts only, never
 * a service name, address or the report text.
 */

const REPORT_COLUMNS = [
  "id", "chokepointId", "templateKind", "channel", "subject", "body", "status",
  "toAddress", "sentAt", "sentById", "providerReference", "outcome", "outcomeAt", "createdAt",
  "bulkProviderName", "bulkAbuseContact", "bulkServiceIds",
] as const;

export type LabReportView = {
  id: string;
  /** Null on a bulk report, which lists several services instead. */
  chokepointId: string | null;
  /** The chokepoint, joined in for the console list. */
  chokepointKind: LabChokepointKind;
  provider: string;
  abuseContact: string;
  /** Null on a bulk report; each listed service is in bulkServiceIds. */
  serviceId: string | null;
  /** "N services" on a bulk report. */
  serviceName: string;
  templateKind: LabChokepointKind;
  channel: LabReportChannel | null;
  subject: string;
  body: string;
  status: "DRAFT" | "SENT";
  toAddress: string | null;
  sentAt: string | null;
  sentById: string | null;
  providerReference: string | null;
  outcome: LabReportOutcome | null;
  outcomeAt: string | null;
  createdAt: string;
  /** WP115 bulk reports: the provider's name and the draft's contact, copied at draft time. */
  bulkProviderName: string | null;
  bulkAbuseContact: string | null;
  bulkServiceIds: string[];
};

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

export const labReportDraftSchema = z
  .object({ chokepointId: z.string().min(1).max(64) })
  .strict();

export const labReportEditSchema = z
  .object({
    subject: z.string().trim().min(1).max(500),
    body: z.string().trim().min(1).max(20000),
  })
  .strict();

export const labReportSendSchema = z
  .object({
    channel: z.enum(LAB_REPORT_CHANNELS),
    to: z.string().trim().email().max(320).optional(),
  })
  .strict()
  .refine((value) => value.channel !== "EMAIL" || typeof value.to === "string", "email_address_required");

export const labReportOutcomeSchema = z
  .object({
    outcome: z.enum(LAB_REPORT_OUTCOMES),
    outcomeAt: z.coerce.date().optional(),
    providerReference: z.string().trim().max(200).optional(),
  })
  .strict();

type ReportRow = {
  id: string;
  chokepointId: string | null;
  templateKind: LabChokepointKind;
  channel: LabReportChannel | null;
  subject: string;
  body: string;
  status: "DRAFT" | "SENT";
  toAddress: string | null;
  sentAt: Date | string | null;
  sentById: string | null;
  providerReference: string | null;
  outcome: LabReportOutcome | null;
  outcomeAt: Date | string | null;
  createdAt: Date | string;
  bulkProviderName: string | null;
  bulkAbuseContact: string | null;
  bulkServiceIds: string[] | null;
};

type ReportContext = {
  chokepointId: string | null;
  chokepointKind: LabChokepointKind;
  provider: string;
  abuseContact: string;
  serviceId: string | null;
  serviceName: string;
  serviceKind: LabServiceKind;
  serviceUrls: string[];
  evidenceNotes: string | null;
};

async function contextFor(chokepointId: string): Promise<ReportContext | null> {
  const chokepoint = await getLabChokepoint(chokepointId);
  if (!chokepoint) return null;
  return {
    chokepointId,
    chokepointKind: chokepoint.kind,
    provider: chokepoint.provider,
    abuseContact: chokepoint.abuseContact,
    serviceId: chokepoint.serviceId,
    serviceName: chokepoint.service.name,
    serviceKind: chokepoint.service.kind,
    serviceUrls: chokepoint.service.urls,
    evidenceNotes: chokepoint.evidenceNotes,
  };
}

const MISSING_CONTEXT: ReportContext = {
  chokepointId: null,
  chokepointKind: "HOST",
  provider: "—",
  abuseContact: "—",
  serviceId: null,
  serviceName: "—",
  serviceKind: "WEBSITE",
  serviceUrls: [],
  evidenceNotes: null,
};

/** The context of a report whose chokepoint no longer resolves (deleted service or chokepoint). */
function missingContextFor(report: LabReportView): ReportContext {
  return {
    ...MISSING_CONTEXT,
    chokepointKind: report.chokepointKind,
    provider: report.provider,
    abuseContact: report.abuseContact,
    serviceId: report.serviceId,
    serviceName: report.serviceName,
  };
}

/**
 * A bulk report's context comes from the report row itself: the provider
 * name and contact copied at draft time, and how many services it lists.
 */
function bulkContextFor(row: ReportRow): ReportContext {
  const ids = row.bulkServiceIds ?? [];
  return {
    ...MISSING_CONTEXT,
    chokepointKind: row.templateKind,
    provider: row.bulkProviderName ?? "—",
    abuseContact: row.bulkAbuseContact ?? "—",
    serviceId: null,
    serviceName: ids.length === 1 ? "1 service" : `${ids.length} services`,
  };
}

function toView(row: ReportRow, context: ReportContext): LabReportView {
  return {
    id: row.id,
    chokepointId: row.chokepointId,
    chokepointKind: context.chokepointKind,
    provider: context.provider,
    abuseContact: context.abuseContact,
    serviceId: context.serviceId,
    serviceName: context.serviceName,
    templateKind: row.templateKind,
    channel: row.channel,
    subject: row.subject,
    body: row.body,
    status: row.status,
    toAddress: row.toAddress,
    sentAt: isoDate(row.sentAt),
    sentById: row.sentById,
    providerReference: row.providerReference,
    outcome: row.outcome,
    outcomeAt: isoDate(row.outcomeAt),
    createdAt: isoDate(row.createdAt) ?? new Date().toISOString(),
    bulkProviderName: row.bulkProviderName ?? null,
    bulkAbuseContact: row.bulkAbuseContact ?? null,
    bulkServiceIds: row.bulkServiceIds ?? [],
  };
}

export async function listLabReports(): Promise<LabReportView[]> {
  let rows: ReportRow[];
  if (isDevNoDb()) {
    rows = [...labMemory().reports.values()];
  } else if (usesWorkerKysely()) {
    rows = await getWorkerDb().selectFrom("LabReport").select([...REPORT_COLUMNS]).execute();
  } else {
    const { db } = await import("@/lib/db");
    rows = await db.labReport.findMany();
  }
  const contexts = new Map<string, ReportContext>();
  for (const row of rows) {
    if (!row.chokepointId || contexts.has(row.chokepointId)) continue;
    const context = await contextFor(row.chokepointId);
    if (context) contexts.set(row.chokepointId, context);
  }
  return rows
    .map((row) => {
      if (!row.chokepointId) return toView(row, bulkContextFor(row));
      const context = contexts.get(row.chokepointId);
      if (context) return toView(row, context);
      return toView(row, { ...MISSING_CONTEXT, chokepointKind: row.templateKind });
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getLabReport(id: string): Promise<LabReportView | null> {
  const reports = await listLabReports();
  return reports.find((report) => report.id === id) ?? null;
}

/**
 * Drafts a report for one chokepoint: the per-kind template filled from the
 * service's stored data. The analyst reviews the text in the console before
 * anything is sent; nothing leaves the site at this step.
 */
export async function draftLabReport(
  input: z.infer<typeof labReportDraftSchema>,
  actorId: string,
): Promise<{ ok: true; report: LabReportView } | { ok: false; error: "invalid_payload" | "chokepoint_not_found" }> {
  const parsed = labReportDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_payload" };
  const context = await contextFor(parsed.data.chokepointId);
  if (!context) return { ok: false, error: "chokepoint_not_found" };
  const filled = fillLabReportTemplate(context.chokepointKind, {
    serviceName: context.serviceName,
    serviceKind: context.serviceKind,
    serviceUrls: context.serviceUrls,
    provider: context.provider,
    evidenceNotes: context.evidenceNotes,
    reportDate: new Date().toISOString().slice(0, 10),
  });
  const now = new Date();
  let view: LabReportView;
  if (isDevNoDb()) {
    const row: MemoryLabReport = {
      id: randomUUID(),
      chokepointId: context.chokepointId,
      templateKind: context.chokepointKind,
      channel: null,
      subject: filled.subject,
      body: filled.body,
      status: "DRAFT",
      toAddress: null,
      sentAt: null,
      sentById: null,
      providerReference: null,
      outcome: null,
      outcomeAt: null,
      bulkProviderName: null,
      bulkAbuseContact: null,
      bulkServiceIds: [],
      createdAt: now,
      updatedAt: now,
    };
    labMemory().reports.set(row.id, row);
    view = toView(row, context);
  } else if (usesWorkerKysely()) {
    const inserted = await getWorkerDb().insertInto("LabReport")
      .values({
        id: randomUUID(),
        chokepointId: context.chokepointId,
        templateKind: context.chokepointKind,
        channel: null,
        subject: filled.subject,
        body: filled.body,
        status: "DRAFT",
        toAddress: null,
        sentAt: null,
        sentById: null,
        providerReference: null,
        outcome: null,
        outcomeAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning([...REPORT_COLUMNS])
      .executeTakeFirstOrThrow();
    view = toView(inserted, context);
  } else {
    const { db } = await import("@/lib/db");
    const created = await db.labReport.create({
      data: {
        chokepointId: context.chokepointId,
        templateKind: context.chokepointKind,
        subject: filled.subject,
        body: filled.body,
      },
    });
    view = toView(created, context);
  }
  await writeAuditLog({
    eventType: "LAB_REPORT_DRAFTED",
    entityType: "LabReport",
    entityId: view.id,
    actorId,
    data: { chokepointId: context.chokepointId, templateKind: context.chokepointKind },
  });
  return { ok: true, report: view };
}

export const labBulkReportDraftSchema = z
  .object({
    providerId: z.string().trim().min(1).max(64),
    /** The services the report lists; two at least, or it is a single report. */
    serviceIds: z.array(z.string().trim().min(1).max(64)).min(2).max(50),
    /** Required unless the verified provider row carries an abuse email. */
    abuseContact: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

/**
 * WP115 (research-tools-spec.md): drafts ONE report to one provider that
 * lists every selected service depending on it — the multi-service variant
 * of draftLabReport. Same verified-contact rule as promoting a finding: the
 * directory's email is used only when the provider row is verified, and an
 * unverified row never fills anything by itself. The draft is reviewed,
 * edited, sent and immutably recorded exactly like a single report.
 */
export async function draftBulkLabReport(
  input: z.infer<typeof labBulkReportDraftSchema>,
  actorId: string,
): Promise<
  | { ok: true; report: LabReportView }
  | { ok: false; error: "invalid_payload" | "provider_not_found" | "service_not_found" | "abuse_contact_required" }
> {
  const parsed = labBulkReportDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_payload" };
  const provider = await getLabProvider(parsed.data.providerId);
  if (!provider) return { ok: false, error: "provider_not_found" };

  const services = await listLabServices();
  const listed: LabServiceView[] = [];
  for (const id of parsed.data.serviceIds) {
    const service = services.find((entry) => entry.id === id);
    if (!service) return { ok: false, error: "service_not_found" };
    if (!listed.some((entry) => entry.id === service.id)) listed.push(service);
  }
  if (listed.length < 2) return { ok: false, error: "invalid_payload" };

  const directoryContact = provider.verifiedAt !== null && provider.abuseEmail ? provider.abuseEmail : null;
  const abuseContact = parsed.data.abuseContact ?? directoryContact;
  if (!abuseContact) return { ok: false, error: "abuse_contact_required" };

  const filled = fillLabBulkReportTemplate(provider.kind, {
    provider: provider.name,
    services: listed.map((service) => ({ name: service.name, kind: service.kind, urls: service.urls })),
    reportDate: new Date().toISOString().slice(0, 10),
  });
  const bulkServiceIds = listed.map((service) => service.id);
  const now = new Date();
  let view: LabReportView;
  if (isDevNoDb()) {
    const row: MemoryLabReport = {
      id: randomUUID(),
      chokepointId: null,
      templateKind: provider.kind,
      channel: null,
      subject: filled.subject,
      body: filled.body,
      status: "DRAFT",
      toAddress: null,
      sentAt: null,
      sentById: null,
      providerReference: null,
      outcome: null,
      outcomeAt: null,
      bulkProviderName: provider.name,
      bulkAbuseContact: abuseContact,
      bulkServiceIds,
      createdAt: now,
      updatedAt: now,
    };
    labMemory().reports.set(row.id, row);
    view = toView(row, bulkContextFor(row));
  } else if (usesWorkerKysely()) {
    const inserted = await getWorkerDb().insertInto("LabReport")
      .values({
        id: randomUUID(),
        chokepointId: null,
        templateKind: provider.kind,
        channel: null,
        subject: filled.subject,
        body: filled.body,
        status: "DRAFT",
        toAddress: null,
        sentAt: null,
        sentById: null,
        providerReference: null,
        outcome: null,
        outcomeAt: null,
        bulkProviderName: provider.name,
        bulkAbuseContact: abuseContact,
        bulkServiceIds,
        createdAt: now,
        updatedAt: now,
      })
      .returning([...REPORT_COLUMNS])
      .executeTakeFirstOrThrow();
    view = toView(inserted, bulkContextFor(inserted));
  } else {
    const { db } = await import("@/lib/db");
    const created = await db.labReport.create({
      data: {
        chokepointId: null,
        templateKind: provider.kind,
        subject: filled.subject,
        body: filled.body,
        bulkProviderName: provider.name,
        bulkAbuseContact: abuseContact,
        bulkServiceIds,
      },
    });
    view = toView(created, bulkContextFor(created));
  }
  await writeAuditLog({
    eventType: "LAB_REPORT_DRAFTED",
    entityType: "LabReport",
    entityId: view.id,
    actorId,
    data: { bulk: true, providerId: provider.id, serviceCount: bulkServiceIds.length, templateKind: provider.kind },
  });
  return { ok: true, report: view };
}

type ReportUpdateValues = {
  subject?: string;
  body?: string;
  status?: "DRAFT" | "SENT";
  channel?: LabReportChannel;
  toAddress?: string | null;
  sentAt?: Date | null;
  sentById?: string | null;
  providerReference?: string | null;
  outcome?: LabReportOutcome | null;
  outcomeAt?: Date | null;
  updatedAt: Date;
};

/** The live context of an updated row: its chokepoint's, its own bulk fields, or the fallback. */
async function refreshedContext(updated: ReportRow, current: LabReportView): Promise<ReportContext> {
  if (!updated.chokepointId) return bulkContextFor(updated);
  return (await contextFor(updated.chokepointId)) ?? missingContextFor(current);
}

async function updateReportRow(id: string, values: ReportUpdateValues): Promise<ReportRow> {
  if (isDevNoDb()) {
    const row = labMemory().reports.get(id);
    if (!row) throw new Error("report_not_found");
    Object.assign(row, values);
    return row;
  }
  const { updatedAt, ...rest } = values;
  if (usesWorkerKysely()) {
    return getWorkerDb().updateTable("LabReport")
      .set({ ...rest, updatedAt })
      .where("id", "=", id)
      .returning([...REPORT_COLUMNS])
      .executeTakeFirstOrThrow();
  }
  const { db } = await import("@/lib/db");
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) data[key] = value;
  }
  return db.labReport.update({ where: { id }, data: data as never });
}

/** Edits a draft's subject and body. Refused once the report has been sent: what went out is the record. */
export async function editLabReportDraft(
  id: string,
  input: z.infer<typeof labReportEditSchema>,
  actorId: string,
): Promise<{ ok: true; report: LabReportView } | { ok: false; error: "invalid_payload" | "report_not_found" | "report_already_sent" }> {
  const parsed = labReportEditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_payload" };
  const current = await getLabReport(id);
  if (!current) return { ok: false, error: "report_not_found" };
  if (current.status !== "DRAFT") return { ok: false, error: "report_already_sent" };
  const updated = await updateReportRow(id, {
    subject: parsed.data.subject,
    body: parsed.data.body,
    updatedAt: new Date(),
  });
  await writeAuditLog({
    eventType: "LAB_REPORT_UPDATED",
    entityType: "LabReport",
    entityId: id,
    actorId,
    data: { chokepointId: current.chokepointId },
  });
  return { ok: true, report: toView(updated, await refreshedContext(updated, current)) };
}

/**
 * Sends a reviewed report: by email through the existing Resend sender (the
 * lab sender address, idempotent per report so a retry never emails the
 * provider twice), or records that the analyst submitted the provider's web
 * form with the copied text. The stored text is what was sent; a sent
 * report never changes.
 */
export async function sendLabReport(
  id: string,
  input: z.infer<typeof labReportSendSchema>,
  actorId: string,
): Promise<
  | { ok: true; report: LabReportView; messageId: string | null }
  | { ok: false; error: "invalid_payload" | "report_not_found" | "report_already_sent" | "email_send_failed" }
> {
  const parsed = labReportSendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_payload" };
  const current = await getLabReport(id);
  if (!current) return { ok: false, error: "report_not_found" };
  if (current.status !== "DRAFT") return { ok: false, error: "report_already_sent" };
  const now = new Date();
  let messageId: string | null = null;
  if (parsed.data.channel === "EMAIL") {
    try {
      const sent = await sendLabReportEmail(parsed.data.to!, current.subject, current.body, `lab-report/${id}`);
      messageId = sent.id ?? null;
    } catch (err) {
      if (err instanceof Error && err.message === "email_already_sent") return { ok: false, error: "report_already_sent" };
      return { ok: false, error: "email_send_failed" };
    }
  }
  const updated = await updateReportRow(id, {
    status: "SENT",
    channel: parsed.data.channel,
    toAddress: parsed.data.channel === "EMAIL" ? parsed.data.to! : null,
    sentAt: now,
    sentById: actorId,
    updatedAt: now,
  });
  await writeAuditLog({
    eventType: "LAB_REPORT_SENT",
    entityType: "LabReport",
    entityId: id,
    actorId,
    data: { channel: parsed.data.channel, chokepointId: current.chokepointId },
  });
  return { ok: true, report: toView(updated, await refreshedContext(updated, current)), messageId };
}

/** Records the provider's reply (or silence) on a sent report. */
export async function recordLabReportOutcome(
  id: string,
  input: z.infer<typeof labReportOutcomeSchema>,
  actorId: string,
): Promise<
  | { ok: true; report: LabReportView }
  | { ok: false; error: "invalid_payload" | "report_not_found" | "report_not_sent" }
> {
  const parsed = labReportOutcomeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_payload" };
  const current = await getLabReport(id);
  if (!current) return { ok: false, error: "report_not_found" };
  if (current.status !== "SENT") return { ok: false, error: "report_not_sent" };
  const updated = await updateReportRow(id, {
    outcome: parsed.data.outcome,
    outcomeAt: parsed.data.outcomeAt ?? new Date(),
    providerReference: parsed.data.providerReference ?? current.providerReference,
    updatedAt: new Date(),
  });
  await writeAuditLog({
    eventType: "LAB_REPORT_OUTCOME_RECORDED",
    entityType: "LabReport",
    entityId: id,
    actorId,
    data: { outcome: parsed.data.outcome, chokepointId: current.chokepointId },
  });
  return { ok: true, report: toView(updated, await refreshedContext(updated, current)) };
}
