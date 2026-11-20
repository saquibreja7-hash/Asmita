import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP33 (partner programme part 2): the notice copy through the dispatch
// route (POST /api/notices/dispatch, the survivor-signed email path).
// Proves the spec's rule as WP33 touches it: when the notice's URL is on
// a domain an ACTIVE platform partner with a channel email owns, the
// channel receives a copy of the dispatched notice — the same subject,
// body and signed PDF that went to the verified grievance contact, never
// instead of it — exactly once per case, link and partner (Rule 1, Rule 6);
// platforms outside the programme see no change in the response. Synthetic
// data only: forum.example.com hosts, a placeholder signed PDF.

const mocks = vi.hoisted(() => ({
  sendNoticeDraft: vi.fn(async () => ({ id: "dev-notice-message" })),
}));

vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendNoticeDraft: mocks.sendNoticeDraft,
}));

vi.mock("@/lib/db", () => ({
  db: {
    submittedUrl: { findFirst: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    noticeTemplate: { findFirst: vi.fn(), findUnique: vi.fn() },
    hashSubmission: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdminPermission: vi.fn(),
}));

import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { inMemoryAuditLog } from "@/lib/audit";
import { createCsrfPair } from "@/lib/csrf";
import { encryptField } from "@/lib/encryption";
import { dispatchedNotices } from "@/lib/notice-dispatch";
import { partnerMemory, resetPartnerMemory } from "@/lib/partner-store";
import { POST } from "@/app/api/notices/dispatch/route";

const okAdmin = {
  ok: true as const,
  session: {
    sub: "admin-1",
    role: "ADMIN" as const,
    ageOver18: true,
    emailHash: "hash-admin",
    namespace: "admin" as const,
    adminRole: "SUPER_ADMIN" as const,
  },
};

const reviewedTemplate = {
  id: "template-1",
  platformId: null,
  templateType: "IT_RULES_2021",
  subjectTemplate: "Notice {{caseReference}}",
  bodyTemplate: "Case {{caseReference}} for {{platformName}} at {{url}} declaration {{declarationReference}}",
  reviewedByLegal: true,
  isActive: true,
  version: 1,
};

function dispatchableUrl(domain: string) {
  return {
    id: `url-${domain}`,
    caseId: "case-1",
    urlEncrypted: encryptField(`https://${domain}/reported`),
    submittedAt: new Date(),
    domain,
    status: "NOTICE_QUEUED",
    signedNoticePdf: encryptField(Buffer.from("%PDF-placeholder").toString("base64")),
    signedHashSubmissionIds: [],
    case: { referenceNumber: "ASMITA-2026-00001" },
    platform: {
      id: "platform-1",
      name: "Example Forum",
      noticeBasis: "IT_RULES_2021",
      grievanceEmail: "go@forum.example.com",
      lastContactVerifiedByHuman: true,
      isActive: true,
    },
  };
}

function csrfPost(body: unknown) {
  const { nonce, token } = createCsrfPair();
  return new Request("https://asmita.test/api/notices/dispatch", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `asmita_csrf=${nonce}`,
      "x-csrf-token": token,
    },
    body: JSON.stringify(body),
  });
}

function seedPartner(id: string) {
  partnerMemory().partners.set(id, {
    id,
    name: "ExampleForum",
    primaryDomain: "forum.example.com",
    extraDomains: [],
    status: "ACTIVE",
    channelEmailEncrypted: encryptField("channel@forum.example.com"),
    createdFromApplicationId: null,
    crawlPermissionRecordedAt: null,
    crawlPermissionRecordedById: null,
    crawlPermissionNote: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as never);
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
  dispatchedNotices.clear();
  resetPartnerMemory();
  mocks.sendNoticeDraft.mockClear();
  vi.mocked(requireAdminPermission).mockResolvedValue(okAdmin);
  vi.mocked(db.noticeTemplate.findFirst).mockResolvedValue(reviewedTemplate as never);
});
afterEach(() => vi.unstubAllEnvs());

describe("the partner channel copy on POST /api/notices/dispatch", () => {
  it("sends the same signed notice to the partner channel, in addition to the grievance contact", async () => {
    seedPartner("p-route");
    vi.mocked(db.submittedUrl.findFirst).mockResolvedValue(dispatchableUrl("forum.example.com") as never);

    const response = await POST(csrfPost({ caseId: "case-1", urlId: "url-forum.example.com" }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { dispatched: boolean; transport: string; partnerChannel?: { sent: boolean; partnerId: string } };
    expect(body.dispatched).toBe(true);
    expect(body.transport).toBe("email");
    expect(body.partnerChannel).toMatchObject({ sent: true, partnerId: "p-route" });

    // Two emails: the notice to the verified grievance contact, then the
    // same signed content to the partner's channel.
    const calls = mocks.sendNoticeDraft.mock.calls;
    expect(calls).toHaveLength(2);
    const [grievanceTo, grievanceSubject, grievanceBody, grievanceAttachments, grievanceKey] =
      calls[0]! as unknown as [string, string, string, { filename: string; content: Buffer }[], string];
    const [channelTo, channelSubject, channelBody, channelAttachments, channelKey] =
      calls[1]! as unknown as [string, string, string, { filename: string; content: Buffer }[], string];
    expect(grievanceTo).toBe("go@forum.example.com");
    expect(channelTo).toBe("channel@forum.example.com");
    expect(channelSubject).toBe(grievanceSubject);
    expect(channelBody).toBe(grievanceBody);
    expect(channelAttachments?.[0]?.filename).toBe("notice.pdf");
    expect(channelAttachments?.[0]?.content.equals(grievanceAttachments![0]!.content)).toBe(true);
    expect(grievanceKey).toMatch(/^notice:[0-9a-f]{64}$/);
    expect(channelKey).toMatch(/^partner-channel:[0-9a-f]{64}$/);
    expect(channelKey).not.toBe(grievanceKey);

    // The channel copy is audited, ids only.
    const channelAudit = inMemoryAuditLog.find((entry) => entry.eventType === "PARTNER_CHANNEL_SENT");
    expect(channelAudit).toBeDefined();
    expect(channelAudit!.entityId).toBe("p-route");
    expect(channelAudit!.data).toMatchObject({ kind: "notice", caseId: "case-1", urlId: "url-forum.example.com" });
  });

  it("never sends a second copy for the same notice", async () => {
    seedPartner("p-route");
    vi.mocked(db.submittedUrl.findFirst).mockResolvedValue(dispatchableUrl("forum.example.com") as never);

    await POST(csrfPost({ caseId: "case-1", urlId: "url-forum.example.com" }));
    const second = await POST(csrfPost({ caseId: "case-1", urlId: "url-forum.example.com" }));
    const body = (await second.json()) as { dispatched: boolean; partnerChannel?: { sent: boolean; reason?: string } };
    expect(body.dispatched).toBe(false); // the grievance contact was deduplicated
    expect(body.partnerChannel).toEqual({ sent: false, reason: "already_sent" });
    expect(mocks.sendNoticeDraft).toHaveBeenCalledTimes(2); // one per recipient, once
  });

  it("changes nothing for a platform outside the programme", async () => {
    vi.mocked(db.submittedUrl.findFirst).mockResolvedValue(dispatchableUrl("plain.example.net") as never);
    const response = await POST(csrfPost({ caseId: "case-1", urlId: "url-plain.example.net" }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { partnerChannel?: unknown };
    expect(body.partnerChannel).toBeUndefined();
    expect(mocks.sendNoticeDraft).toHaveBeenCalledTimes(1);
    expect(inMemoryAuditLog.find((entry) => entry.eventType === "PARTNER_CHANNEL_SENT")).toBeUndefined();
  });
});
