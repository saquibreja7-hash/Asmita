import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP33 (partner programme part 2): src/lib/partner-channel.ts — the partner
// takedown channel. Proves the spec's rules as WP33 touches them: a notice
// copy goes only to the ACTIVE partner with a channel email that owns the
// notice's URL domain, carries the same signed content, and is sent exactly
// once (Rule 1, Rule 6); the crawler-finding alert carries only the case
// reference, the page URL on the partner's own domain and the fingerprint
// id — never the image address, never a fingerprint value (Rule 1) — and
// only to a partner whose written permission to crawl is recorded (Rule 5);
// every send and failure is audited with ids and counts only (Rule 5); a
// channel failure never breaks the action that triggered it. Synthetic data
// only: example.com/example.test domains, random hex, uuid-like ids.

const mocks = vi.hoisted(() => {
  // The Kysely recording fake from partner-admin-kysely.test.ts /
  // partner-feed.test.ts: selects serve the seeded rows through "=" and
  // "in" filters, inserts are recorded (detail.values).
  const kysely = (() => {
    const state = {
      rows: {} as Record<string, Array<Record<string, unknown>>>,
      calls: [] as Array<{ op: string; table: string; detail: Record<string, unknown> }>,
    };
    function builder(op: string, table: string, detail: Record<string, unknown>) {
      const proxy: unknown = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === "execute") return async () => selectRows(table, detail).map((row) => ({ ...row }));
            if (prop === "executeTakeFirst") return async () => {
              const rows = selectRows(table, detail);
              return rows.length > 0 ? { ...rows[0] } : undefined;
            };
            if (prop === "then") return undefined;
            return (...args: unknown[]) => {
              if (prop === "values") detail.values = args[0];
              else if (prop === "select") detail.select = args[0];
              else if (prop === "where") detail.wheres = [...((detail.wheres as unknown[]) ?? []), args];
              return proxy;
            };
          },
        },
      );
      return proxy;
    }
    function selectRows(table: string, detail: Record<string, unknown>) {
      let rows = state.rows[table] ?? [];
      for (const where of (detail.wheres as unknown[][] | undefined) ?? []) {
        const [column, operator, value] = where as [string, string, unknown];
        if (operator === "=") rows = rows.filter((row) => row[column] === value);
        else if (operator === "in" && Array.isArray(value)) rows = rows.filter((row) => value.includes(row[column]));
      }
      return rows;
    }
    function record(op: string, name: string) {
      const table = name.split(" ")[0];
      const detail: Record<string, unknown> = {};
      state.calls.push({ op, table, detail });
      return builder(op, table, detail);
    }
    const db = {
      selectFrom: (name: string) => record("select", name),
      insertInto: (name: string) => record("insert", name),
      updateTable: (name: string) => record("update", name),
      deleteFrom: (name: string) => record("delete", name),
      transaction: () => ({ execute: async (run: (tx: unknown) => Promise<unknown>) => run(db) }),
    };
    return { db, state };
  })();

  // A small Prisma fake whose findFirst honours equality, so the dedup
  // lookup is really answered, and whose create stores rows.
  const prisma = (() => {
    const tables: Record<string, Array<Record<string, unknown>>> = {};
    function matches(row: Record<string, unknown>, where: Record<string, unknown> = {}): boolean {
      return Object.entries(where).every(([key, condition]) => {
        if (condition && typeof condition === "object" && !Array.isArray(condition)) {
          const c = condition as { in?: unknown[] };
          if (c.in) return c.in.includes(row[key]);
          return true;
        }
        return row[key] === condition;
      });
    }
    const delegate = (table: string) => ({
      findMany: async ({ where = {} }: { where?: Record<string, unknown> } = {}) =>
        (tables[table] ?? []).filter((row) => matches(row, where)).map((row) => ({ ...row })),
      findFirst: async ({ where = {} }: { where?: Record<string, unknown> } = {}) =>
        (tables[table] ?? []).find((row) => matches(row, where)) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        (tables[table] ??= []).push({ ...data });
        return { id: data.id };
      },
    });
    const client = new Proxy({} as Record<string, unknown>, {
      get(_target, prop: string) {
        if (prop === "$transaction") return async (fn: (tx: unknown) => Promise<unknown>) => fn(client);
        return delegate(prop);
      },
    });
    return { client, tables };
  })();

  const usesWorkerKysely = vi.fn(() => false);
  const sendNoticeDraft = vi.fn(async () => ({ id: "dev-notice-message" }));
  return { kysely, prisma, usesWorkerKysely, sendNoticeDraft };
});

vi.mock("@/lib/email", () => ({ sendNoticeDraft: mocks.sendNoticeDraft }));
vi.mock("@/lib/db", () => ({ db: mocks.prisma.client }));
vi.mock("@/lib/worker-kysely", () => ({
  usesWorkerKysely: mocks.usesWorkerKysely,
  getWorkerDb: () => mocks.kysely.db,
}));

import { inMemoryAuditLog } from "@/lib/audit";
import { encryptField } from "@/lib/encryption";
import {
  alertPartnerChannelOfFinding,
  copyNoticeToPartnerChannel,
  owningPartner,
  partnerCrawlPermissionMissing,
  partnerFindingAlertEmail,
} from "@/lib/partner-channel";
import { partnerMemory, resetPartnerMemory } from "@/lib/partner-store";

const CHANNEL_EMAIL = "channel@forum.example.com";
const PAGE_URL = "https://forum.example.com/thread/9";
const PDQ = "ab".repeat(32);

function seedPartner(id: string, overrides: Record<string, unknown> = {}) {
  partnerMemory().partners.set(id, {
    id,
    name: `ExampleForum-${id}`,
    primaryDomain: "forum.example.com",
    extraDomains: ["cdn.example.com"],
    status: "ACTIVE",
    channelEmailEncrypted: encryptField(CHANNEL_EMAIL),
    createdFromApplicationId: null,
    crawlPermissionRecordedAt: new Date("2026-11-01T00:00:00.000Z"),
    crawlPermissionRecordedById: null,
    crawlPermissionNote: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as never);
  return id;
}

function sentCalls() {
  return mocks.sendNoticeDraft.mock.calls;
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
  resetPartnerMemory();
  mocks.sendNoticeDraft.mockClear();
  mocks.usesWorkerKysely.mockReturnValue(false);
  mocks.kysely.state.rows = {};
  mocks.kysely.state.calls.length = 0;
  for (const table of Object.keys(mocks.prisma.tables)) delete mocks.prisma.tables[table];
});
afterEach(() => vi.unstubAllEnvs());

describe("which partner owns a host", () => {
  const partners = [
    { id: "p-general", name: "General", status: "ACTIVE", primaryDomain: "example.com", extraDomains: [], channelEmailEncrypted: null, crawlPermissionRecordedAt: null },
    { id: "p-forum", name: "Forum", status: "ACTIVE", primaryDomain: "forum.example.com", extraDomains: ["cdn.example.com"], channelEmailEncrypted: null, crawlPermissionRecordedAt: null },
  ];

  it("matches the exact domain and its subdomains", () => {
    expect(owningPartner("forum.example.com", partners)?.row.id).toBe("p-forum");
    expect(owningPartner("img.forum.example.com", partners)?.row.id).toBe("p-forum");
    expect(owningPartner("cdn.example.com", partners)?.row.id).toBe("p-forum");
    expect(owningPartner("www.example.com", partners)?.row.id).toBe("p-general");
  });

  it("prefers the partner that registered the more specific domain", () => {
    // The general partner owns example.com, the forum partner the exact
    // host: the longest registered domain wins, so the copy never goes to
    // the wrong partner's channel.
    const match = owningPartner("forum.example.com", [
      { ...partners[0]!, crawlPermissionRecordedAt: new Date() },
      partners[1]!,
    ]);
    expect(match?.row.id).toBe("p-forum");
    expect(match?.matchedDomain).toBe("forum.example.com");
  });

  it("never matches a lookalike or a stranger's host", () => {
    // A lookalike suffix is not a subdomain, and a stranger's host is
    // nobody's. (A real subdomain of a registered domain does belong to the
    // partner that registered the domain — that is the DNS reality the
    // longest-match rule follows.)
    expect(owningPartner("forum.example.com.evil.test", partners)).toBeNull();
    expect(owningPartner("forum.example.org", partners)).toBeNull();
    expect(owningPartner("plain.example.net", partners)).toBeNull();
  });
});

describe("the notice copy, memory path", () => {
  it("sends the same signed content to the channel of the partner that owns the URL's domain", async () => {
    seedPartner("p-1");
    const pdf = Buffer.from("%PDF-placeholder");
    const outcome = await copyNoticeToPartnerChannel({
      caseId: "case-1", urlId: "url-1", domain: "forum.example.com",
      subject: "Notice ASMITA-2026-00001", body: "The notice body with the placeholder, never an address.",
      signedNoticePdf: pdf, fingerprintIds: ["hs-1", "hs-2"], actorId: "admin-1",
    });
    expect(outcome).toMatchObject({ sent: true, partnerId: "p-1", messageId: "dev-notice-message" });

    // Exactly one channel send, to the channel email, with the same subject,
    // body and signed PDF as the notice that went to the grievance contact.
    const calls = sentCalls();
    expect(calls).toHaveLength(1);
    const [to, subject, body, attachments, idempotencyKey] = calls[0]! as unknown as [
      string, string, string, { filename: string; content: Buffer }[] | undefined, string,
    ];
    expect(to).toBe(CHANNEL_EMAIL);
    expect(subject).toBe("Notice ASMITA-2026-00001");
    expect(body).toBe("The notice body with the placeholder, never an address.");
    expect(attachments?.[0]?.filename).toBe("notice.pdf");
    expect(attachments?.[0]?.content.equals(pdf)).toBe(true);
    expect(idempotencyKey).toMatch(/^partner-channel:[0-9a-f]{64}$/);

    // One row, kind NOTICE, ids only.
    expect(partnerMemory().channelSends).toHaveLength(1);
    expect(partnerMemory().channelSends[0]).toMatchObject({
      partnerId: "p-1", kind: "NOTICE", urlId: "url-1", caseId: "case-1", messageId: "dev-notice-message",
    });

    // One audit entry, ids and counts only — never the body, never a URL.
    expect(inMemoryAuditLog).toHaveLength(1);
    const [audit] = inMemoryAuditLog;
    expect(audit.eventType).toBe("PARTNER_CHANNEL_SENT");
    expect(audit.entityType).toBe("PlatformPartner");
    expect(audit.entityId).toBe("p-1");
    expect(audit.actorId).toBe("admin-1");
    expect(audit.data).toEqual({
      kind: "notice", messageId: "dev-notice-message", caseId: "case-1", urlId: "url-1", fingerprintIds: ["hs-1", "hs-2"],
    });
  });

  it("never sends a second copy for the same case, link and partner", async () => {
    seedPartner("p-2");
    const input = {
      caseId: "case-2", urlId: "url-2", domain: "forum.example.com", subject: "s", body: "b",
    };
    expect(await copyNoticeToPartnerChannel(input)).toMatchObject({ sent: true });
    expect(await copyNoticeToPartnerChannel(input)).toEqual({ sent: false, reason: "already_sent" });
    // A different link is a different notice and still goes out.
    expect(await copyNoticeToPartnerChannel({ ...input, urlId: "url-3" })).toMatchObject({ sent: true });
    expect(sentCalls()).toHaveLength(2);
    expect(partnerMemory().channelSends).toHaveLength(2);
  });

  it("sends nothing without a partner, to a suspended partner, or without a channel email", async () => {
    expect(await copyNoticeToPartnerChannel({ caseId: "c", urlId: "u", domain: "plain.example.net", subject: "s", body: "b" }))
      .toEqual({ sent: false, reason: "no_partner" });
    // One domain belongs to one partner, so each gate gets its own partner
    // on its own domain.
    seedPartner("p-sus", { primaryDomain: "suspended.example.com", status: "SUSPENDED" });
    expect(await copyNoticeToPartnerChannel({ caseId: "c", urlId: "u", domain: "suspended.example.com", subject: "s", body: "b" }))
      .toEqual({ sent: false, reason: "partner_suspended" });
    seedPartner("p-noemail", { primaryDomain: "noemail.example.com", channelEmailEncrypted: null });
    expect(await copyNoticeToPartnerChannel({ caseId: "c", urlId: "u", domain: "noemail.example.com", subject: "s", body: "b" }))
      .toEqual({ sent: false, reason: "no_channel_email" });
    expect(sentCalls()).toHaveLength(0);
    expect(partnerMemory().channelSends).toHaveLength(0);
    expect(inMemoryAuditLog).toHaveLength(0);
  });

  it("records a send that reached the provider but was never recorded, and audits failures without throwing", async () => {
    // email_already_sent: the email is out; the row is written so every
    // later retry is a no-op.
    mocks.sendNoticeDraft.mockImplementationOnce(async () => {
      throw new Error("email_already_sent");
    });
    seedPartner("p-3");
    expect(await copyNoticeToPartnerChannel({ caseId: "case-3", urlId: "url-3", domain: "forum.example.com", subject: "s", body: "b" }))
      .toMatchObject({ sent: true, alreadySent: true });
    expect(partnerMemory().channelSends).toHaveLength(1);
    expect(partnerMemory().channelSends[0]!.messageId).toMatch(/^unrecorded-/);
    expect(await copyNoticeToPartnerChannel({ caseId: "case-3", urlId: "url-3", domain: "forum.example.com", subject: "s", body: "b" }))
      .toEqual({ sent: false, reason: "already_sent" });
    expect(sentCalls()).toHaveLength(1);

    // A real failure: audited, recorded as a failure, never thrown.
    inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
    mocks.sendNoticeDraft.mockImplementationOnce(async () => {
      throw new Error("email_send_failed:provider down");
    });
    seedPartner("p-4", { primaryDomain: "other.example.com" });
    await expect(copyNoticeToPartnerChannel({
      caseId: "case-4", urlId: "url-4", domain: "other.example.com", subject: "s", body: "b", actorId: "admin-4",
    })).resolves.toEqual({ sent: false, reason: "send_failed" });
    expect(partnerMemory().channelSends).toHaveLength(1); // p-3's row only
    expect(inMemoryAuditLog).toHaveLength(1);
    expect(inMemoryAuditLog[0]).toMatchObject({ eventType: "PARTNER_CHANNEL_FAILED", entityId: "p-4" });
    expect(inMemoryAuditLog[0]!.data).toMatchObject({ kind: "notice", reason: "email_send_failed:provider down", caseId: "case-4" });
  });
});

describe("the crawler-finding alert, memory path", () => {
  const alertInput = {
    findingId: "finding-1",
    caseId: "case-9",
    caseReference: "ASMITA-2026-00099",
    pageUrl: PAGE_URL,
    pageDomain: "forum.example.com",
    fingerprintId: "hs-9",
    reviewerId: "analyst-1",
  };

  it("sends the case reference, the page URL on their domain and the fingerprint id — nothing else", async () => {
    seedPartner("p-5");
    expect(await alertPartnerChannelOfFinding(alertInput)).toMatchObject({ sent: true, partnerId: "p-5" });

    const calls = sentCalls();
    expect(calls).toHaveLength(1);
    const [to, subject, body, attachments, idempotencyKey] = calls[0]! as unknown as [
      string, string, string, unknown, string,
    ];
    expect(to).toBe(CHANNEL_EMAIL);
    expect(subject).toContain("ASMITA-2026-00099");
    expect(body).toContain("ASMITA-2026-00099");
    expect(body).toContain(PAGE_URL);
    expect(body).toContain("hs-9");
    // Rule 1: never the image, never the fingerprint value, never the
    // survivor's data.
    expect(body).not.toContain(PDQ);
    expect(body).not.toContain("https://cdn.example.com/img/9.jpg");
    expect(attachments).toBeUndefined();
    expect(idempotencyKey).toMatch(/^partner-channel:[0-9a-f]{64}$/);

    expect(partnerMemory().channelSends).toHaveLength(1);
    expect(partnerMemory().channelSends[0]).toMatchObject({
      partnerId: "p-5", kind: "FINDING_ALERT", findingId: "finding-1", caseId: "case-9", urlId: null,
    });

    // Ids only in the audit entry — never the page URL.
    const [audit] = inMemoryAuditLog;
    expect(audit.eventType).toBe("PARTNER_CHANNEL_SENT");
    expect(audit.data).toEqual({
      kind: "alert", messageId: "dev-notice-message", findingId: "finding-1", caseId: "case-9",
      fingerprintId: "hs-9", domain: "forum.example.com",
    });
    expect(JSON.stringify(audit.data)).not.toContain("thread/9");
  });

  it("is deduplicated per finding and partner", async () => {
    seedPartner("p-6");
    expect(await alertPartnerChannelOfFinding(alertInput)).toMatchObject({ sent: true });
    expect(await alertPartnerChannelOfFinding(alertInput)).toEqual({ sent: false, reason: "already_sent" });
    expect(await alertPartnerChannelOfFinding({ ...alertInput, findingId: "finding-2" })).toMatchObject({ sent: true });
    expect(sentCalls()).toHaveLength(2);
  });

  it("needs an active partner with a channel email and a recorded crawl permission", async () => {
    // One domain belongs to one partner: each gate gets its own partner on
    // its own domain.
    seedPartner("p-7", { primaryDomain: "gated.example.com", crawlPermissionRecordedAt: null });
    expect(await alertPartnerChannelOfFinding({ ...alertInput, pageDomain: "gated.example.com" }))
      .toEqual({ sent: false, reason: "permission_not_recorded" });
    seedPartner("p-8", { primaryDomain: "suspended.example.com", status: "SUSPENDED" });
    expect(await alertPartnerChannelOfFinding({ ...alertInput, pageDomain: "suspended.example.com" }))
      .toEqual({ sent: false, reason: "partner_suspended" });
    seedPartner("p-9", { primaryDomain: "noemail.example.com", channelEmailEncrypted: null });
    expect(await alertPartnerChannelOfFinding({ ...alertInput, pageDomain: "noemail.example.com" }))
      .toEqual({ sent: false, reason: "no_channel_email" });
    expect(await alertPartnerChannelOfFinding({ ...alertInput, pageDomain: "plain.example.net" }))
      .toEqual({ sent: false, reason: "no_partner" });
    expect(sentCalls()).toHaveLength(0);
    expect(inMemoryAuditLog).toHaveLength(0);
  });

  it("the alert email states that no image is ever sent", () => {
    const email = partnerFindingAlertEmail({
      partnerName: "ExampleForum", caseReference: "ASMITA-2026-00001",
      pageUrl: PAGE_URL, fingerprintId: "hs-1",
    });
    expect(email.subject).toContain("Asmita crawler alert");
    expect(email.body).toContain(PAGE_URL);
    expect(email.body).toContain("No image or video is ever sent to you");
  });
});

describe("the crawl-permission gate, memory path", () => {
  it("a partner's host is gated until the written permission is recorded", async () => {
    seedPartner("p-10", { primaryDomain: "gated.example.com", crawlPermissionRecordedAt: null });
    expect(await partnerCrawlPermissionMissing("gated.example.com")).toBe(true);
    expect(await partnerCrawlPermissionMissing("img.gated.example.com")).toBe(true);
    // The moment the permission is recorded, the host opens up.
    partnerMemory().partners.get("p-10")!.crawlPermissionRecordedAt = new Date("2026-11-01T00:00:00.000Z");
    expect(await partnerCrawlPermissionMissing("gated.example.com")).toBe(false);
    // A stranger's host is never gated by the programme.
    expect(await partnerCrawlPermissionMissing("plain.example.net")).toBe(false);
  });
});

describe("the channel send on the Kysely backend", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
    mocks.usesWorkerKysely.mockReturnValue(true);
    mocks.kysely.state.rows.PlatformPartner = [
      {
        id: "pk-1", name: "ExampleForum", status: "ACTIVE", primaryDomain: "forum.example.com",
        extraDomains: [], channelEmailEncrypted: encryptField(CHANNEL_EMAIL),
        crawlPermissionRecordedAt: new Date("2026-11-01T00:00:00.000Z"),
      },
    ];
  });

  it("looks the partner up, sends once, records the row, and honours the record on a retry", async () => {
    expect(await copyNoticeToPartnerChannel({ caseId: "c", urlId: "u", domain: "forum.example.com", subject: "s", body: "b" }))
      .toMatchObject({ sent: true, partnerId: "pk-1" });
    const insert = mocks.kysely.state.calls.find((call) => call.table === "PartnerChannelSend" && call.op === "insert");
    expect(insert).toBeDefined();
    const row = insert!.detail.values as Record<string, unknown>;
    expect(row).toMatchObject({ partnerId: "pk-1", kind: "NOTICE", urlId: "u", caseId: "c" });
    expect(typeof row.dedupKey).toBe("string");

    // Another isolate would see the recorded row: the send is not repeated.
    mocks.kysely.state.rows.PartnerChannelSend = [{ dedupKey: row.dedupKey }];
    expect(await copyNoticeToPartnerChannel({ caseId: "c", urlId: "u", domain: "forum.example.com", subject: "s", body: "b" }))
      .toEqual({ sent: false, reason: "already_sent" });
    expect(sentCalls()).toHaveLength(1);

    // The permission gate reads the same table.
    mocks.kysely.state.rows.PlatformPartner = [
      { ...mocks.kysely.state.rows.PlatformPartner[0]!, id: "pk-2", crawlPermissionRecordedAt: null },
    ];
    expect(await partnerCrawlPermissionMissing("forum.example.com")).toBe(true);
  });
});

describe("the channel send on the Prisma backend", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
    mocks.usesWorkerKysely.mockReturnValue(false);
    // The Prisma client property is the camelCase model name.
    mocks.prisma.tables.platformPartner = [
      {
        id: "pp-1", name: "ExampleForum", status: "ACTIVE", primaryDomain: "forum.example.com",
        extraDomains: [], channelEmailEncrypted: encryptField(CHANNEL_EMAIL),
        crawlPermissionRecordedAt: new Date("2026-11-01T00:00:00.000Z"),
      },
    ];
  });

  it("records the send and honours it on a retry", async () => {
    expect(await copyNoticeToPartnerChannel({ caseId: "c", urlId: "u", domain: "forum.example.com", subject: "s", body: "b" }))
      .toMatchObject({ sent: true, partnerId: "pp-1" });
    expect(mocks.prisma.tables.partnerChannelSend).toHaveLength(1);
    expect(mocks.prisma.tables.partnerChannelSend[0]).toMatchObject({ partnerId: "pp-1", kind: "NOTICE", urlId: "u", caseId: "c" });
    expect(await copyNoticeToPartnerChannel({ caseId: "c", urlId: "u", domain: "forum.example.com", subject: "s", body: "b" }))
      .toEqual({ sent: false, reason: "already_sent" });
    expect(sentCalls()).toHaveLength(1);

    // The alert path on the same backend.
    expect(await alertPartnerChannelOfFinding({
      findingId: "f-1", caseId: "c", caseReference: "ASMITA-2026-00001",
      pageUrl: PAGE_URL, pageDomain: "forum.example.com", fingerprintId: "hs-1", reviewerId: "analyst-1",
    })).toMatchObject({ sent: true, partnerId: "pp-1" });
    expect(mocks.prisma.tables.partnerChannelSend).toHaveLength(2);
    expect(mocks.prisma.tables.partnerChannelSend[1]).toMatchObject({ kind: "FINDING_ALERT", findingId: "f-1" });
  });
});
