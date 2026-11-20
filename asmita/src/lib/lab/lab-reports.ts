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
import { fillLabReportTemplate } from "@/lib/lab/report-templates";
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
] as const;

export type LabReportView = {
  id: string;
  chokepointId: string;
  /** The chokepoint, joined in for the console list. */
  chokepointKind: LabChokepointKind;
  provider: string;
  abuseContact: string;
  serviceId: string;
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
  chokepointId: string;
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
};

type ReportContext = {
  chokepointId: string;
  chokepointKind: LabChokepointKind;
  provider: string;
  abuseContact: string;
  serviceId: string;
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
  chokepointId: "—",
  chokepointKind: "HOST",
  provider: "—",
  abuseContact: "—",
  serviceId: "—",
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
    if (!contexts.has(row.chokepointId)) {
      const context = await contextFor(row.chokepointId);
      if (context) contexts.set(row.chokepointId, context);
    }
  }
  return rows
    .map((row) => {
      const context = contexts.get(row.chokepointId);
      if (context) return toView(row, context);
      const fallback = { ...MISSING_CONTEXT, chokepointKind: row.templateKind };
      return toView(row, fallback);
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
  return { ok: true, report: toView(updated, (await contextFor(current.chokepointId)) ?? missingContextFor(current)) };
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
  return { ok: true, report: toView(updated, (await contextFor(current.chokepointId)) ?? missingContextFor(current)), messageId };
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
  return { ok: true, report: toView(updated, (await contextFor(current.chokepointId)) ?? missingContextFor(current)) };
}
