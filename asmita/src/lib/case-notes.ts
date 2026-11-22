import { randomUUID } from "node:crypto";
import { encryptField, decryptField } from "@/lib/encryption";
import { hasAdminPermission, type AdminRole } from "@/lib/auth/admin-permissions";
import { containsUrlLikeText } from "@/lib/url-like-text";
import { writeAuditLog } from "@/lib/audit";
import { reviewerHandle } from "@/lib/review-views";
import { getWorkerDb, usesWorkerKysely } from "@/lib/worker-kysely";

/*
 * Internal case notes (review-console-spec.md WP142 — the redesign doc's
 * Phase 4 notes) on the three backends every Asmita module has: the memory
 * store without DATABASE_URL (dev/tests), Kysely on the Worker (Hyperdrive)
 * and Prisma otherwise.
 *
 * A note is admin-only working memory about a case. It is encrypted with
 * encryptField the moment it is written, it is never sent to a platform or
 * a survivor, it never appears in a notice or an export, and the audit
 * events carry ids only — never the text. A pasted address is refused
 * outright: the console shows masked text, and the reasoned, logged Reveal
 * flow is the only way to see one.
 */

export const CASE_NOTE_MAX = 2000;

export type CaseNoteRow = {
  id: string;
  caseId: string;
  jobId: string | null;
  authorEmailHash: string;
  bodyEncrypted: string;
  createdAt: Date;
  deletedAt: Date | null;
};

/** What the admin views render: decrypted body, author as a handle, never an email. */
export type CaseNoteView = {
  id: string;
  caseId: string;
  jobId: string | null;
  author: string;
  body: string;
  createdAt: string;
  /** The viewer may soft-delete: the author, or a SUPER_ADMIN. */
  canDelete: boolean;
};

type MemoryCaseNote = CaseNoteRow;

// On globalThis, like the store and the review memory: next dev can
// instantiate one module per bundle (page and route), and a plain module
// Map would hold two disconnected stores. One map per server process.
const caseNoteGlobals = globalThis as typeof globalThis & { __asmitaCaseNotes?: Map<string, MemoryCaseNote> };

function caseNoteMemory(): Map<string, MemoryCaseNote> {
  caseNoteGlobals.__asmitaCaseNotes ??= new Map();
  return caseNoteGlobals.__asmitaCaseNotes;
}

/** Test seam: clears the memory notes. */
export function resetCaseNoteMemory(): void {
  caseNoteGlobals.__asmitaCaseNotes = undefined;
}

/** Test seam: the raw memory rows (encrypted), for at-rest assertions. */
export function caseNoteRowsForTest(): CaseNoteRow[] {
  return [...caseNoteMemory().values()];
}

function isDevNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

export type AddCaseNoteResult = { ok: true; note: CaseNoteView } | { ok: false; error: string };

/**
 * Writes one internal note. Permission-checked server-side (cases:note),
 * capped at CASE_NOTE_MAX characters, refused when it carries anything
 * address-like, encrypted before it is stored. The audit event records the
 * ids only.
 */
export async function addCaseNote(input: {
  caseId: string;
  jobId?: string | null;
  body: string;
  authorEmailHash: string;
  authorId: string;
  role: AdminRole;
  now?: Date;
}): Promise<AddCaseNoteResult> {
  const now = input.now ?? new Date();
  if (!hasAdminPermission(input.role, "cases:note")) return { ok: false, error: "permission_denied" };
  const body = input.body.trim();
  if (!body) return { ok: false, error: "note_required" };
  if (body.length > CASE_NOTE_MAX) return { ok: false, error: "note_too_long" };
  if (containsUrlLikeText(body)) return { ok: false, error: "links_not_allowed" };
  if (!(await caseExists(input.caseId))) return { ok: false, error: "case_not_found" };

  const row: CaseNoteRow = {
    id: randomUUID(),
    caseId: input.caseId,
    jobId: input.jobId ?? null,
    authorEmailHash: input.authorEmailHash,
    bodyEncrypted: encryptField(body),
    createdAt: now,
    deletedAt: null,
  };
  if (isDevNoDb()) {
    caseNoteMemory().set(row.id, row);
  } else if (usesWorkerKysely()) {
    await getWorkerDb().insertInto("CaseNote").values(row).execute();
  } else {
    const { db } = await import("@/lib/db");
    await db.caseNote.create({
      data: {
        caseId: row.caseId,
        jobId: row.jobId,
        authorEmailHash: row.authorEmailHash,
        bodyEncrypted: row.bodyEncrypted,
        createdAt: row.createdAt,
      },
    });
  }
  // The audit entry never carries the note text, only the ids.
  await writeAuditLog({
    eventType: "CASE_NOTE_ADDED",
    entityType: "CaseNote",
    entityId: row.id,
    actorId: input.authorId,
    data: { caseId: input.caseId, jobId: row.jobId ?? undefined },
  });
  return { ok: true, note: toView(row, { emailHash: input.authorEmailHash, role: input.role }) };
}

/** The case's notes, newest first, soft-deleted ones hidden. */
export async function listCaseNotes(
  caseId: string,
  viewer: { emailHash: string; role: AdminRole },
  limit = 50,
): Promise<CaseNoteView[]> {
  let rows: CaseNoteRow[];
  if (isDevNoDb()) {
    rows = [...caseNoteMemory().values()]
      .filter((note) => note.caseId === caseId && note.deletedAt === null)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, limit);
  } else if (usesWorkerKysely()) {
    rows = (await getWorkerDb().selectFrom("CaseNote").selectAll()
      .where("caseId", "=", caseId).where("deletedAt", "is", null)
      .orderBy("createdAt", "desc").limit(limit).execute()) as unknown as CaseNoteRow[];
  } else {
    const { db } = await import("@/lib/db");
    rows = (await db.caseNote.findMany({
      where: { caseId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: limit,
    })) as unknown as CaseNoteRow[];
  }
  return rows.map((row) => toView(row, viewer));
}

export type DeleteCaseNoteResult = { ok: true } | { ok: false; error: string };

/**
 * Soft-deletes a note: the author or a SUPER_ADMIN, never anyone else. A
 * retried delete of an already-deleted note changes nothing and audits
 * nothing, so a retry is always safe.
 */
export async function softDeleteCaseNote(input: {
  noteId: string;
  viewerEmailHash: string;
  role: AdminRole;
  actorId: string;
  now?: Date;
}): Promise<DeleteCaseNoteResult> {
  const now = input.now ?? new Date();
  const note = await getCaseNote(input.noteId);
  if (!note || note.deletedAt !== null) return { ok: false, error: "note_not_found" };
  if (note.authorEmailHash !== input.viewerEmailHash && input.role !== "SUPER_ADMIN") {
    return { ok: false, error: "permission_denied" };
  }
  if (isDevNoDb()) {
    const stored = caseNoteMemory().get(input.noteId)!;
    stored.deletedAt = now;
  } else if (usesWorkerKysely()) {
    await getWorkerDb().updateTable("CaseNote").set({ deletedAt: now })
      .where("id", "=", input.noteId).where("deletedAt", "is", null).execute();
  } else {
    const { db } = await import("@/lib/db");
    await db.caseNote.updateMany({ where: { id: input.noteId, deletedAt: null }, data: { deletedAt: now } });
  }
  await writeAuditLog({
    eventType: "CASE_NOTE_DELETED",
    entityType: "CaseNote",
    entityId: input.noteId,
    actorId: input.actorId,
    data: { caseId: note.caseId },
  });
  return { ok: true };
}

async function getCaseNote(noteId: string): Promise<CaseNoteRow | null> {
  if (isDevNoDb()) {
    return caseNoteMemory().get(noteId) ?? null;
  }
  if (usesWorkerKysely()) {
    const row = await getWorkerDb().selectFrom("CaseNote").selectAll().where("id", "=", noteId).executeTakeFirst();
    return row ? (row as unknown as CaseNoteRow) : null;
  }
  const { db } = await import("@/lib/db");
  const row = await db.caseNote.findUnique({ where: { id: noteId } });
  return row ? (row as unknown as CaseNoteRow) : null;
}

async function caseExists(caseId: string): Promise<boolean> {
  if (isDevNoDb()) {
    const { cases } = await import("@/lib/store");
    return cases.has(caseId);
  }
  if (usesWorkerKysely()) {
    const row = await getWorkerDb().selectFrom("Case").select("id").where("id", "=", caseId).executeTakeFirst();
    return Boolean(row);
  }
  const { db } = await import("@/lib/db");
  return Boolean(await db.case.findUnique({ where: { id: caseId }, select: { id: true } }));
}

function toView(row: CaseNoteRow, viewer: { emailHash: string; role: AdminRole }): CaseNoteView {
  return {
    id: row.id,
    caseId: row.caseId,
    jobId: row.jobId,
    author: reviewerHandle(row.authorEmailHash, viewer.emailHash),
    body: decryptField(row.bodyEncrypted),
    createdAt: new Date(row.createdAt).toISOString(),
    canDelete: row.authorEmailHash === viewer.emailHash || viewer.role === "SUPER_ADMIN",
  };
}
