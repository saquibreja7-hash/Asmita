import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP2 (full-crawler spec): bulk import of crawl sources on the memory path
// and through the admin route. Every entry is reported (created | exists |
// blocked | invalid), duplicates and never-crawl hosts never fail the
// request, each created source is audited, and 1000 hosts import in one
// request. Placeholder hosts only.

vi.mock("@/lib/auth/middleware", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdminPermission: vi.fn() }));

import { requireAdminPermission } from "@/lib/auth/require-admin";
import { createCsrfPair } from "@/lib/csrf";
import { inMemoryAuditLog } from "@/lib/audit";
import { crawlMemory, resetCrawlMemory } from "@/lib/crawl-store";
import { addBlockedCrawlHost } from "@/lib/crawl-blocked-hosts";
import { createCrawlSource, hostFromEntry, importCrawlSources } from "@/lib/crawl-sources";
import * as importRoute from "@/app/api/admin/crawl-sources/import/route";

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

const URL_BASE = "https://asmita.test/api/admin/crawl-sources/import";

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

function sourceByDomain(domain: string) {
  return [...crawlMemory().sources.values()].find((source) => source.domain === domain);
}

function importAuditEntries() {
  return inMemoryAuditLog.filter((entry) => (entry.data as { action?: string } | undefined)?.action === "crawl_source_imported");
}

describe("hostFromEntry", () => {
  it("takes the host of a full URL and leaves a bare host alone", () => {
    expect(hostFromEntry("forum.example.org")).toBe("forum.example.org");
    expect(hostFromEntry("https://forum.example.org/thread/1?x=1#frag")).toBe("forum.example.org");
    expect(hostFromEntry("HTTPS://WWW.Site.example/other")).toBe("www.site.example");
    expect(hostFromEntry("ftp://files.example.org/x")).toBe("files.example.org");
    expect(hostFromEntry("https://")).toBe("");
  });
  it("never repairs a scheme-less string with a path into a host", () => {
    expect(hostFromEntry("example.com/x")).toBe("example.com/x");
    expect(hostFromEntry("")).toBe("");
  });
});

describe("importCrawlSources, memory path", () => {
  it("reports every entry of a mixed list, in order, and creates only the valid new hosts", async () => {
    await addBlockedCrawlHost({ host: "blocked.example.org", reason: "owner request" }, "super-1");
    const { results } = await importCrawlSources({
      hosts: [
        "forum.example.org",
        "https://shop.example.org/list?page=2",
        "forum.example.org",
        "www.gallery.example.net",
        "facebook.com",
        "blocked.example.org",
        "deep.forum.blocked.example.org",
        "10.0.0.1",
        "db.internal",
        "nodots",
      ],
      pageBudget: 500,
      delayMs: 1200,
    }, "super-1");

    expect(results).toHaveLength(10);
    expect(results.map((result) => result.status)).toEqual([
      "created", "created", "exists", "created", "blocked", "blocked", "blocked", "invalid", "invalid", "invalid",
    ]);
    expect(results.map((result) => result.input)).toEqual([
      "forum.example.org", "https://shop.example.org/list?page=2", "forum.example.org", "www.gallery.example.net",
      "facebook.com", "blocked.example.org", "deep.forum.blocked.example.org", "10.0.0.1", "db.internal", "nodots",
    ]);
    expect(results[0].host).toBe("forum.example.org");
    expect(results[3].host).toBe("gallery.example.net");
    expect(results[7].reason).toBe("invalid_domain");
    expect(results[8].reason).toBe("private_domain");

    // Three sources created, one per unique new host, as ADMIN by this admin.
    expect([...crawlMemory().sources.values()]).toHaveLength(3);
    for (const domain of ["forum.example.org", "shop.example.org", "gallery.example.net"]) {
      expect(sourceByDomain(domain), domain).toMatchObject({
        kind: "SITE", origin: "ADMIN", hops: 0, discoveredFromId: null, render: "HTTP",
        pageBudget: 500, delayMs: 1200, enabled: false, approvedBy: "super-1",
        pagesCrawled: 0, lastCrawledAt: null,
      });
    }
  });

  it("starts imported sites enabled only when asked", async () => {
    await importCrawlSources({ hosts: ["a.example.org"], pageBudget: 10, delayMs: 1000, enabled: true }, "super-1");
    expect(sourceByDomain("a.example.org")!.enabled).toBe(true);
    await importCrawlSources({ hosts: ["b.example.org"], pageBudget: 10, delayMs: 1000 }, "super-1");
    expect(sourceByDomain("b.example.org")!.enabled).toBe(false);
  });

  it("defaults an omitted page budget and delay to the env knobs, clamped like the automatic paths", async () => {
    await importCrawlSources({ hosts: ["a.example.org"] }, "super-1");
    expect(sourceByDomain("a.example.org")).toMatchObject({ pageBudget: 2000, delayMs: 1500 });

    vi.stubEnv("CRAWLER_REPORTED_PAGE_BUDGET", "777");
    vi.stubEnv("CRAWLER_DEFAULT_DELAY_MS", "2500");
    await importCrawlSources({ hosts: ["b.example.org"] }, "super-1");
    expect(sourceByDomain("b.example.org")).toMatchObject({ pageBudget: 777, delayMs: 2500 });

    vi.stubEnv("CRAWLER_REPORTED_PAGE_BUDGET", "99999");
    await importCrawlSources({ hosts: ["c.example.org"] }, "super-1");
    expect(sourceByDomain("c.example.org")).toMatchObject({ pageBudget: 10_000, delayMs: 2500 });
  });

  it("reports a host that is already a source as exists, whatever created it, and never touches it", async () => {
    await addBlockedCrawlHost({ host: "reported-blocked.example.org", reason: "owner request" }, "super-1");
    const admin = await createCrawlSource({ domain: "existing.example.org", pageBudget: 10, delayMs: 3000, enabled: true }, "admin-1");
    expect(admin.ok).toBe(true);

    const { results } = await importCrawlSources({ hosts: ["existing.example.org"] }, "super-1");
    expect(results).toEqual([{ input: "existing.example.org", status: "exists", host: "existing.example.org" }]);
    expect(sourceByDomain("existing.example.org")).toMatchObject({ origin: "ADMIN", pageBudget: 10, delayMs: 3000, enabled: true, approvedBy: "admin-1" });
  });

  it("audits one crawl_source_imported entry per created source, nothing for the rest", async () => {
    const before = inMemoryAuditLog.length;
    await importCrawlSources({
      hosts: ["a.example.org", "b.example.org", "facebook.com", "a.example.org", "10.0.0.1"],
      pageBudget: 100,
      delayMs: 900,
      enabled: true,
    }, "super-9");

    const entries = importAuditEntries();
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      expect(entry).toMatchObject({
        eventType: "ADMIN_ACTION", entityType: "CrawlSource", actorId: "super-9",
      });
      expect(entry.data).toMatchObject({ action: "crawl_source_imported", pageBudget: 100, delayMs: 900, enabled: true });
    }
    expect(new Set(entries.map((entry) => (entry.data as { domain: string }).domain)))
      .toEqual(new Set(["a.example.org", "b.example.org"]));
    // Blocked, invalid and repeat entries wrote nothing, and nothing else was audited.
    expect(inMemoryAuditLog.length - before).toBe(2);
  });

  it("imports 1000 hosts in one request, one result each", async () => {
    const hosts = Array.from({ length: 1000 }, (_, index) => `site-${index}.example.org`);
    const { results } = await importCrawlSources({ hosts, pageBudget: 50, delayMs: 600 }, "super-1");
    expect(results).toHaveLength(1000);
    expect(results.every((result) => result.status === "created")).toBe(true);
    expect(crawlMemory().sources.size).toBe(1000);
    expect(importAuditEntries()).toHaveLength(1000);
  });

  it("a second import of the same list reports every host as exists and audits nothing", async () => {
    const hosts = ["a.example.org", "https://b.example.org/x", "facebook.com", "bad host"];
    await importCrawlSources({ hosts }, "super-1");
    const { results } = await importCrawlSources({ hosts }, "super-1");
    expect(results.map((result) => result.status)).toEqual(["exists", "exists", "blocked", "invalid"]);
    expect([...crawlMemory().sources.values()]).toHaveLength(2);
    expect(importAuditEntries()).toHaveLength(2);
  });
});

describe("POST /api/admin/crawl-sources/import", () => {
  it("needs crawler:manage and CSRF, and refuses changes while the crawler is off", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue({ ok: false, status: 403, error: "permission_denied" } as never);
    const refused = await importRoute.POST(request(URL_BASE, "POST", { hosts: ["a.example.org"] }));
    expect(refused.status).toBe(403);
    expect(requireAdminPermission).toHaveBeenCalledWith("crawler:manage");

    vi.mocked(requireAdminPermission).mockResolvedValue(admin("super-1") as never);
    expect((await importRoute.POST(request(URL_BASE, "POST", { hosts: ["a.example.org"] }, false))).status).toBe(403);

    vi.stubEnv("ENABLE_CRAWLER", "false");
    const off = await importRoute.POST(request(URL_BASE, "POST", { hosts: ["a.example.org"] }));
    expect(off.status).toBe(503);
    expect(await off.json()).toEqual({ error: "crawler_disabled" });
    expect(crawlMemory().sources.size).toBe(0);
  });

  it("refuses malformed bodies", async () => {
    vi.stubEnv("ENABLE_CRAWLER", "true");
    const bodies = [
      { hosts: [] },
      { hosts: Array.from({ length: 1001 }, (_, index) => `site-${index}.example.org`) },
      { hosts: ["a.example.org"], extra: 1 },
      { hosts: "a.example.org" },
      {},
    ];
    for (const body of bodies) {
      const response = await importRoute.POST(request(URL_BASE, "POST", body));
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_payload" });
    }
    expect(crawlMemory().sources.size).toBe(0);
  });

  it("imports a mixed list and returns one result per entry", async () => {
    const response = await importRoute.POST(request(URL_BASE, "POST", {
      hosts: ["forum.example.org", "https://shop.example.org/x", "forum.example.org", "facebook.com", "10.0.0.1"],
      pageBudget: 300,
      delayMs: 1100,
    }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { results: Array<{ status: string; host?: string }> };
    expect(body.results.map((result) => result.status)).toEqual(["created", "created", "exists", "blocked", "invalid"]);
    expect(sourceByDomain("forum.example.org")).toMatchObject({ origin: "ADMIN", pageBudget: 300, delayMs: 1100, approvedBy: "super-1" });
  });

  it("takes 1000 hosts in one request", async () => {
    const response = await importRoute.POST(request(URL_BASE, "POST", {
      hosts: Array.from({ length: 1000 }, (_, index) => `site-${index}.example.org`),
    }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { results: Array<{ status: string }> };
    expect(body.results).toHaveLength(1000);
    expect(body.results.every((result) => result.status === "created")).toBe(true);
    expect(crawlMemory().sources.size).toBe(1000);
  });
});
