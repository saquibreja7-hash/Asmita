import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP142 (review-console-spec.md): internal case notes, on the memory
// backend. The cases:note permission is enforced in the library, the body is
// encrypted at rest, anything address-like is refused, the list is newest
// first with soft-deleted notes hidden, and the author-or-SUPER_ADMIN soft
// delete writes CASE_NOTE_DELETED while the audit data never carries the
// note text. Placeholder ids and invented hosts throughout.

vi.mock("@/lib/security-log", () => ({ logSecurityEvent: vi.fn() }));

// WP171: the Prisma branch of the same library, against a mocked client.
// The row's id is the audit event's entityId and the routes' answer, so the
// stored row must carry exactly the id the library generated — Prisma would
// silently mint its own otherwise, and the audit event would point at an id
// no row has.
const prisma = vi.hoisted(() => {
  const db = {
    caseNote: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data),
      updateMany: vi.fn(async () => ({ count: 1 })),
      findUnique: vi.fn(async () => null),
    },
    case: { findUnique: vi.fn(async () => ({ id: "case-1" })) },
  };
  return { db };
});
vi.mock("@/lib/worker-kysely", () => ({ usesWorkerKysely: () => false, getWorkerDb: () => { throw new Error("no worker db"); } }));
vi.mock("@/lib/db", () => ({ db: prisma.db }));

import { inMemoryAuditLog } from "@/lib/audit";
import { cases, createCase } from "@/lib/store";
import { decryptField } from "@/lib/encryption";
import {
  CASE_NOTE_MAX,
  addCaseNote,
  listCaseNotes,
  resetCaseNoteMemory,
  softDeleteCaseNote,
} from "@/lib/case-notes";

const NOW = new Date("2026-11-22T10:00:00Z");
const MINUTE = 60_000;
const ME = "hash-me";
const COLLEAGUE = "hash-colleague";

const SUPPORT = "SUPPORT_AGENT" as const;
const REVIEWER = "CASE_REVIEWER" as const;
const SUPER = "SUPER_ADMIN" as const;

let caseId = "case-1";

function note(input: Partial<Parameters<typeof addCaseNote>[0]> = {}) {
  return addCaseNote({
    caseId,
    body: "Called the helpline desk; she will call back in the evening.",
    authorEmailHash: ME,
    authorId: "admin-1",
    role: SUPPORT,
    now: NOW,
    ...input,
  });
}

beforeEach(async () => {
  vi.stubEnv("DATABASE_URL", "");
  resetCaseNoteMemory();
  cases.clear();
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
  const record = await createCase("user-1");
  caseId = record.id;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("writing a note", () => {
  it("stores the body encrypted, with the author and job link", async () => {
    const result = await note({ jobId: "job-9" });
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.note.body).toBe("Called the helpline desk; she will call back in the evening.");
    expect(result.note.author).toBe("You");
    expect(result.note.canDelete).toBe(true);

    // At rest: encrypted, and it decrypts back to the exact text.
    const stored = await listCaseNotes(caseId, { emailHash: ME, role: SUPPORT });
    // (listCaseNotes returns the decrypted view; the raw row is checked via
    // the audit-free memory below.)
    expect(stored).toHaveLength(1);
    expect(stored[0].jobId).toBe("job-9");
  });

  it("encrypts the body with encryptField before it is stored", async () => {
    const body = "Plain text that must never sit in the clear.";
    await note({ body });
    const { caseNoteRowsForTest } = await import("@/lib/case-notes");
    const raw = caseNoteRowsForTest().at(-1)!;
    expect(raw.bodyEncrypted).not.toContain("Plain text");
    expect(raw.bodyEncrypted).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    expect(decryptField(raw.bodyEncrypted)).toBe(body);
  });

  it("enforces the cases:note permission server-side", async () => {
    // A CASE_REVIEWER cannot write notes; a SUPPORT_AGENT and a SUPER_ADMIN can.
    expect(await note({ role: REVIEWER })).toMatchObject({ ok: false, error: "permission_denied" });
    expect(await note({ role: SUPPORT })).toMatchObject({ ok: true });
    expect(await note({ role: SUPER, body: "Owner checked the case.", authorEmailHash: COLLEAGUE }))
      .toMatchObject({ ok: true });
  });

  it("refuses an empty note, an oversized note and anything address-like", async () => {
    expect(await note({ body: "   " })).toMatchObject({ ok: false, error: "note_required" });
    expect(await note({ body: "a".repeat(CASE_NOTE_MAX + 1) })).toMatchObject({ ok: false, error: "note_too_long" });
    // A survivor's address never enters a note, even encrypted. The URL
    // guard catches scheme-less domains of the common public TLDs too.
    expect(await note({ body: "See https://forum.example.test/post/1" })).toMatchObject({ ok: false, error: "links_not_allowed" });
    expect(await note({ body: "On forum.example.com she reported it" })).toMatchObject({ ok: false, error: "links_not_allowed" });
    expect(await note({ caseId: "case-missing" })).toMatchObject({ ok: false, error: "case_not_found" });
    const stored = await listCaseNotes(caseId, { emailHash: ME, role: SUPPORT });
    expect(stored).toHaveLength(0);
  });

  it("audits the add with ids only, never the note text", async () => {
    await note({ body: "Secret working memory." });
    const event = inMemoryAuditLog.at(-1)!;
    expect(event.eventType).toBe("CASE_NOTE_ADDED");
    expect(event.data).toEqual({ caseId, jobId: undefined });
    expect(JSON.stringify(inMemoryAuditLog)).not.toContain("Secret working memory");
  });
});

describe("reading notes", () => {
  it("lists newest first, hides deleted ones, and never shows an email", async () => {
    await note({ body: "First.", now: NOW });
    await note({ body: "Second.", now: new Date(NOW.getTime() + MINUTE), authorEmailHash: COLLEAGUE });

    const mine = await listCaseNotes(caseId, { emailHash: ME, role: SUPPORT });
    expect(mine.map((row) => row.body)).toEqual(["Second.", "First."]);
    expect(mine[0].author).toBe("Reviewer " + COLLEAGUE.slice(0, 4));
    expect(mine[0].canDelete).toBe(false); // not the author, not SUPER_ADMIN
    expect(mine[1].author).toBe("You");

    const theirs = await listCaseNotes(caseId, { emailHash: COLLEAGUE, role: SUPPORT });
    expect(theirs[0].author).toBe("You");
    expect(JSON.stringify(mine)).not.toContain("@");
  });
});

describe("soft-deleting a note", () => {
  it("lets the author or a SUPER_ADMIN delete, nobody else, and audits ids only", async () => {
    const added = await note({ body: "To be removed." });
    if (!added.ok) throw new Error("expected the note to be added");

    expect(
      await softDeleteCaseNote({ noteId: added.note.id, viewerEmailHash: COLLEAGUE, role: SUPPORT, actorId: "admin-2" }),
    ).toMatchObject({ ok: false, error: "permission_denied" });

    expect(
      await softDeleteCaseNote({ noteId: added.note.id, viewerEmailHash: ME, role: SUPPORT, actorId: "admin-1", now: NOW }),
    ).toMatchObject({ ok: true });
    expect(await listCaseNotes(caseId, { emailHash: ME, role: SUPPORT })).toHaveLength(0);

    const event = inMemoryAuditLog.at(-1)!;
    expect(event.eventType).toBe("CASE_NOTE_DELETED");
    expect(event.data).toEqual({ caseId });
    expect(JSON.stringify(inMemoryAuditLog)).not.toContain("To be removed");

    // A retried delete answers not-found and audits nothing further.
    const before = inMemoryAuditLog.length;
    expect(
      await softDeleteCaseNote({ noteId: added.note.id, viewerEmailHash: ME, role: SUPPORT, actorId: "admin-1" }),
    ).toMatchObject({ ok: false, error: "note_not_found" });
    expect(inMemoryAuditLog.length).toBe(before);
  });

  it("lets a SUPER_ADMIN delete someone else's note", async () => {
    const added = await note({ body: "Someone else wrote this." });
    if (!added.ok) throw new Error("expected the note to be added");
    expect(
      await softDeleteCaseNote({ noteId: added.note.id, viewerEmailHash: "hash-owner", role: SUPER, actorId: "admin-9" }),
    ).toMatchObject({ ok: true });
    expect(await listCaseNotes(caseId, { emailHash: ME, role: SUPER })).toHaveLength(0);
  });
});

describe("the Prisma path", () => {
  it("stores the row with exactly the id the audit event names", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
    const added = await addCaseNote({
      caseId: "case-1",
      body: "One id everywhere.",
      authorEmailHash: ME,
      authorId: "admin-1",
      role: SUPPORT,
      now: NOW,
    });
    expect(added.ok).toBe(true);
    const data = prisma.db.caseNote.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(typeof data.id).toBe("string");
    // WP171 regression: the audit event's entityId is the row the database
    // actually holds, not an id only the library generated.
    expect(data.id).toBe(added.ok ? added.note.id : "");
    expect(inMemoryAuditLog.at(-1)?.entityId).toBe(data.id);
    expect(prisma.db.caseNote.create.mock.calls[0][0].data).not.toHaveProperty("body");
  });
});
