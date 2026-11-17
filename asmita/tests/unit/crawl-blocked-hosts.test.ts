import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP2 (full-crawler spec): the admin-managed never-crawl list — CRUD on the
// memory path, through the admin route, and its effect on the automatic
// paths (a blocked host and its subdomains never become a source). Every
// change is audited; reads work with the crawler off, changes do not.
// Placeholder hosts only.

vi.mock("@/lib/auth/middleware", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdminPermission: vi.fn() }));

import { requireAdminPermission } from "@/lib/auth/require-admin";
import { createCsrfPair } from "@/lib/csrf";
import { inMemoryAuditLog } from "@/lib/audit";
import { crawlMemory, resetCrawlMemory } from "@/lib/crawl-store";
import { addBlockedCrawlHost, listBlockedCrawlHosts, removeBlockedCrawlHost } from "@/lib/crawl-blocked-hosts";
import { ensureCrawlSourceForReportedHost } from "@/lib/crawl-sources";
import * as blockedRoute from "@/app/api/admin/crawl-blocked-hosts/route";

function admin(sub: string, adminRole = "SUPER_ADMIN") {
  return { ok: true as const, session: { sub, role: "ADMIN", adminRole, mfaComplete: true, emailHash: `hash-${sub}`, namespace: "admin", ageOver18: true } };
}

function request(url: string, method = "GET", body?: unknown, csrf = true) {
  const { nonce, token } = createCsrfPair();
  return new Request(url, {
    method,
    headers: { "content-type": "application/json", ...(csrf ? { cookie: `asmita_csrf=${nonce}`, "x-csrf-token": token } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const URL_BASE = "https://asmita.test/api/admin/crawl-blocked-hosts";

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("ENABLE_CRAWLER", "true");
  resetCrawlMemory();
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
  vi.mocked(requireAdminPermission).mockResolvedValue(admin("super-1") as never);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function blockedAudit(action: string) {
  return inMemoryAuditLog.filter((entry) => entry.eventType === "ADMIN_ACTION" && (entry.data as { action?: string })?.action === action);
}

describe("blocked host management, memory path", () => {
  it("adds a normalized host with its reason and audits it", async () => {
    const outcome = await addBlockedCrawlHost({ host: "WWW.Bad.example.org.", reason: "  owner request  " }, "super-1");
    expect(outcome).toMatchObject({ ok: true, host: { host: "bad.example.org", reason: "owner request", addedBy: "super-1" } });
    expect([...crawlMemory().blockedHosts.keys()]).toEqual(["bad.example.org"]);

    expect(blockedAudit("crawl_blocked_host_added")).toHaveLength(1);
    const entry = blockedAudit("crawl_blocked_host_added")[0];
    expect(entry).toMatchObject({ entityType: "CrawlBlockedHost", actorId: "super-1" });
    expect(entry.data).toEqual({ action: "crawl_blocked_host_added", host: "bad.example.org", reason: "owner request" });
  });

  it("refuses an invalid or private host and a duplicate", async () => {
    expect(await addBlockedCrawlHost({ host: "10.0.0.1", reason: "r" }, "super-1")).toEqual({ ok: false, error: "invalid_domain" });
    expect(await addBlockedCrawlHost({ host: "db.internal", reason: "r" }, "super-1")).toEqual({ ok: false, error: "private_domain" });
    expect(await addBlockedCrawlHost({ host: "bad.example.org", reason: "r" }, "super-1")).toMatchObject({ ok: true });
    expect(await addBlockedCrawlHost({ host: "bad.example.org", reason: "again" }, "super-2")).toEqual({ ok: false, error: "blocked_host_exists" });
    expect([...crawlMemory().blockedHosts.values()]).toHaveLength(1);
    expect(blockedAudit("crawl_blocked_host_added")).toHaveLength(1);
  });

  it("removes by id, audits the removed host, and answers not found for anything else", async () => {
    const added = await addBlockedCrawlHost({ host: "bad.example.org", reason: "owner request" }, "super-1");
    if (!added.ok) throw new Error("setup");
    expect(await removeBlockedCrawlHost(added.host.id, "super-2")).toEqual({ ok: true, host: "bad.example.org" });
    expect(crawlMemory().blockedHosts.size).toBe(0);
    expect(blockedAudit("crawl_blocked_host_removed")).toEqual([expect.objectContaining({
      entityType: "CrawlBlockedHost", entityId: added.host.id, actorId: "super-2",
      data: { action: "crawl_blocked_host_removed", host: "bad.example.org" },
    })]);
    expect(await removeBlockedCrawlHost("missing", "super-1")).toEqual({ ok: false, error: "blocked_host_not_found" });
    expect(blockedAudit("crawl_blocked_host_removed")).toHaveLength(1);
  });

  it("lists blocked hosts sorted by host with ISO dates", async () => {
    await addBlockedCrawlHost({ host: "z.example.org", reason: "b" }, "super-1");
    await addBlockedCrawlHost({ host: "a.example.org", reason: "a" }, "super-2");
    const hosts = await listBlockedCrawlHosts();
    expect(hosts.map((host) => host.host)).toEqual(["a.example.org", "z.example.org"]);
    expect(hosts[0]).toMatchObject({ reason: "a", addedBy: "super-2", createdAt: expect.any(String) });
    expect(new Date(hosts[0].createdAt).toISOString()).toBe(hosts[0].createdAt);
  });
});

describe("a blocked host stops the automatic paths, for it and its subdomains", () => {
  it("never becomes a REPORTED source, and unblocking re-enables it", async () => {
    await addBlockedCrawlHost({ host: "report.example.org", reason: "owner request" }, "super-1");
    expect(await ensureCrawlSourceForReportedHost("report.example.org")).toEqual({ created: false, reason: "never_crawl" });
    expect(await ensureCrawlSourceForReportedHost("deep.forum.report.example.org")).toEqual({ created: false, reason: "never_crawl" });
    expect(crawlMemory().sources.size).toBe(0);

    const blocked = [...crawlMemory().blockedHosts.values()][0];
    await removeBlockedCrawlHost(blocked.id, "super-1");
    expect(await ensureCrawlSourceForReportedHost("report.example.org")).toMatchObject({ created: true });
  });
});

describe("the admin blocked-hosts route", () => {
  it("lists for crawler:manage, and the list reads even while the crawler is off", async () => {
    await addBlockedCrawlHost({ host: "bad.example.org", reason: "owner request" }, "super-1");

    vi.stubEnv("ENABLE_CRAWLER", "false");
    const response = await blockedRoute.GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as { blockedHosts: Array<{ host: string }>; crawlerEnabled: boolean };
    expect(body.crawlerEnabled).toBe(false);
    expect(body.blockedHosts.map((host) => host.host)).toEqual(["bad.example.org"]);

    vi.mocked(requireAdminPermission).mockResolvedValue({ ok: false, status: 403, error: "permission_denied" } as never);
    expect((await blockedRoute.GET()).status).toBe(403);
    expect(requireAdminPermission).toHaveBeenCalledWith("crawler:manage");
  });

  it("refuses every change while the crawler is off, and needs CSRF", async () => {
    vi.stubEnv("ENABLE_CRAWLER", "false");
    const off = await blockedRoute.POST(request(URL_BASE, "POST", { host: "bad.example.org", reason: "r" }));
    expect(off.status).toBe(503);
    expect(await off.json()).toEqual({ error: "crawler_disabled" });
    expect((await blockedRoute.DELETE(request(URL_BASE, "DELETE", { id: "bh-1" }))).status).toBe(503);

    vi.stubEnv("ENABLE_CRAWLER", "true");
    expect((await blockedRoute.POST(request(URL_BASE, "POST", { host: "bad.example.org", reason: "r" }, false))).status).toBe(403);
    expect((await blockedRoute.DELETE(request(URL_BASE, "DELETE", { id: "bh-1" }, false))).status).toBe(403);
    expect(crawlMemory().blockedHosts.size).toBe(0);
  });

  it("adds a host, refuses duplicates and malformed bodies, and audits the change", async () => {
    const created = await blockedRoute.POST(request(URL_BASE, "POST", { host: "WWW.Bad.example.org", reason: "owner request" }));
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ host: { host: "bad.example.org", reason: "owner request", addedBy: "super-1" } });
    expect([...crawlMemory().blockedHosts.keys()]).toEqual(["bad.example.org"]);

    const duplicate = await blockedRoute.POST(request(URL_BASE, "POST", { host: "bad.example.org", reason: "again" }));
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({ error: "blocked_host_exists" });

    expect((await blockedRoute.POST(request(URL_BASE, "POST", { host: "10.0.0.1", reason: "r" }))).status).toBe(400);
    for (const body of [{ host: "bad.example.org" }, { host: "bad.example.org", reason: "" }, { host: "bad.example.org", reason: "r", extra: 1 }, { reason: "r" }]) {
      const response = await blockedRoute.POST(request(URL_BASE, "POST", body));
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_payload" });
    }
    expect(blockedAudit("crawl_blocked_host_added")).toHaveLength(1);
  });

  it("removes an entry by id, answers 404 for anything else, and audits the change", async () => {
    const created = await blockedRoute.POST(request(URL_BASE, "POST", { host: "bad.example.org", reason: "owner request" }));
    const { host } = (await created.json()) as { host: { id: string } };

    const removed = await blockedRoute.DELETE(request(URL_BASE, "DELETE", { id: host.id }));
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ host: "bad.example.org" });
    expect(crawlMemory().blockedHosts.size).toBe(0);
    expect(blockedAudit("crawl_blocked_host_removed")).toHaveLength(1);

    expect((await blockedRoute.DELETE(request(URL_BASE, "DELETE", { id: "missing" }))).status).toBe(404);
    expect((await blockedRoute.DELETE(request(URL_BASE, "DELETE", { id: host.id, extra: 1 }))).status).toBe(400);
    expect(blockedAudit("crawl_blocked_host_removed")).toHaveLength(1);
  });
});
