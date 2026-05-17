import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/escalation-engine", () => ({
  runDueEscalationsFromDb: vi.fn(),
}));
vi.mock("@/lib/case-ops", () => ({
  hardDeleteDueUsers: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    platform: { findMany: vi.fn() },
    emailDeliveryProof: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/alerts", () => ({
  sendOnCallAlertFireAndForget: vi.fn(),
}));

import { runDueEscalationsFromDb } from "@/lib/escalation-engine";
import { hardDeleteDueUsers } from "@/lib/case-ops";
import { db } from "@/lib/db";
import { sendOnCallAlertFireAndForget } from "@/lib/alerts";

import { GET as sweepRoute } from "@/app/api/cron/sweep-due-jobs/route";
import { GET as maintenanceRoute } from "@/app/api/cron/maintenance/route";

function cronRequest(path: string, secret?: string): import("next/server").NextRequest {
  const headers: Record<string, string> = {};
  if (secret) headers.authorization = `Bearer ${secret}`;
  return new Request(`https://asmita.test${path}`, { headers }) as unknown as import("next/server").NextRequest;
}

describe("/api/cron/* auth", () => {
  const originalSecret = process.env.CRON_SECRET;

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
    vi.clearAllMocks();
  });

  it("sweep returns 503 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const res = await sweepRoute(cronRequest("/api/cron/sweep-due-jobs"));
    expect(res.status).toBe(503);
  });

  it("sweep returns 401 when Authorization header is missing", async () => {
    process.env.CRON_SECRET = "shh";
    const res = await sweepRoute(cronRequest("/api/cron/sweep-due-jobs"));
    expect(res.status).toBe(401);
  });

  it("sweep returns 401 when Authorization header is wrong", async () => {
    process.env.CRON_SECRET = "shh";
    const res = await sweepRoute(cronRequest("/api/cron/sweep-due-jobs", "wrong"));
    expect(res.status).toBe(401);
  });

  it("maintenance returns 401 without secret", async () => {
    process.env.CRON_SECRET = "shh";
    const res = await maintenanceRoute(cronRequest("/api/cron/maintenance"));
    expect(res.status).toBe(401);
  });
});

describe("/api/cron/sweep-due-jobs happy path", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = "shh";
    vi.mocked(runDueEscalationsFromDb).mockResolvedValue({
      swept: 2,
      fired: [{ noticeId: "n-1", level: 1, action: "email_follow_up" }],
      skipped: [],
      errors: [],
    });
    vi.mocked(hardDeleteDueUsers).mockResolvedValue(["user-1"]);
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
    vi.clearAllMocks();
  });

  it("returns a sweep summary and deletes due users", async () => {
    const res = await sweepRoute(cronRequest("/api/cron/sweep-due-jobs", "shh"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.escalations.fired).toHaveLength(1);
    expect(body.deletions.hardDeletedUserIds).toEqual(["user-1"]);
    expect(sendOnCallAlertFireAndForget).not.toHaveBeenCalled();
  });

  it("fires a warning alert when escalations had errors", async () => {
    vi.mocked(runDueEscalationsFromDb).mockResolvedValue({
      swept: 1,
      fired: [],
      skipped: [],
      errors: [{ noticeId: "n-x", error: "boom" }],
    });

    const res = await sweepRoute(cronRequest("/api/cron/sweep-due-jobs", "shh"));
    expect(res.status).toBe(200);
    expect(sendOnCallAlertFireAndForget).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "warning", title: expect.stringContaining("Escalation sweep") }),
    );
  });

  it("returns 500 and fires critical alert when the sweep throws", async () => {
    vi.mocked(runDueEscalationsFromDb).mockRejectedValue(new Error("db down"));

    const res = await sweepRoute(cronRequest("/api/cron/sweep-due-jobs", "shh"));
    expect(res.status).toBe(500);
    expect(sendOnCallAlertFireAndForget).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "critical" }),
    );
  });
});

describe("/api/cron/maintenance happy path", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = "shh";
    vi.mocked(db.platform.findMany).mockResolvedValue([] as never);
    vi.mocked(db.emailDeliveryProof.findMany).mockResolvedValue([] as never);
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
    vi.clearAllMocks();
  });

  it("returns reverification queue + deliverability snapshot", async () => {
    const res = await maintenanceRoute(cronRequest("/api/cron/maintenance", "shh"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reverification).toBeDefined();
    expect(body.deliverability).toBeDefined();
    expect(body.deliverability.healthy).toBe(true);
  });

  it("alerts when a platform is unverified (re-verification due)", async () => {
    vi.mocked(db.platform.findMany).mockResolvedValue([
      {
        id: "p-1",
        name: "ExamplePlatform",
        domainPatterns: ["example.com"],
        tier: "TIER_2",
        noticeBasis: "IT_RULES_2021",
        grievanceEmail: null,
        formUrl: null,
        apiEndpoint: null,
        lastContactVerifiedByHuman: false,
        lastContactVerifiedAt: null,
      },
    ] as never);

    const res = await maintenanceRoute(cronRequest("/api/cron/maintenance", "shh"));
    expect(res.status).toBe(200);
    expect(sendOnCallAlertFireAndForget).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining("GO reverification") }),
    );
  });
});
