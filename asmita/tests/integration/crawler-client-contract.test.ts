import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The REAL crawler client (crawler/src/asmita/client.ts, its own Zod schemas
// and undici agent) against the REAL Next route handlers for
// /api/crawler/{pool,sources,findings}, over a loopback HTTP server, on the
// memory backend. If either side changes its shapes, this fails instead of
// the crawler silently dropping findings in production.
//
// The client needs the crawler's own dependencies (npm ci in crawler/). CI
// installs them and this test then must run; locally it is skipped with a
// message when they are missing. Placeholder data only.

const crawlerDeps = existsSync(join(process.cwd(), "..", "crawler", "node_modules", "undici"));
const mustRun = process.env.CI === "true";
if (!crawlerDeps && !mustRun) console.warn("crawler-client-contract: skipped, run `npm ci` in crawler/ to enable it");

describe.skipIf(!crawlerDeps && !mustRun)("crawler client <-> app routes (real code on both sides)", () => {
  let server: Server;
  let baseUrl: string;
  let key: string;
  let sourceId: string;
  // Loaded by path at run time so asmita's type-check does not compile the
  // crawler (it has its own); the shapes below are the ones this test uses.
  type PoolEntry = { id: string; pdq: string; quality: number } | { id: string; kind: "video"; frames: string[] };
  type Client = {
    getPool(): Promise<{ fingerprints: PoolEntry[] }>;
    getSources(): Promise<unknown[]>;
    postFindings(runId: string, findings: unknown[]): Promise<Array<{ status: string; reason?: string }>>;
    close(): Promise<void>;
  };
  type ClientModule = {
    AsmitaClient: new (config: Record<string, unknown>) => Client;
    REJECT_REASONS: readonly string[];
  };
  const CLIENT_PATH = join(process.cwd(), "..", "crawler", "src", "asmita", "client.ts");
  const loadClient = () => import(/* @vite-ignore */ CLIENT_PATH) as Promise<ClientModule>;
  let AsmitaClient: ClientModule["AsmitaClient"];

  async function toRequest(req: IncomingMessage): Promise<Request> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) if (typeof value === "string") headers.set(name, value);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    return new Request(`http://127.0.0.1${req.url}`, { method: req.method, headers, ...(body ? { body } : {}) });
  }

  async function route(req: IncomingMessage, res: ServerResponse) {
    const request = await toRequest(req);
    const path = new URL(request.url).pathname;
    let response: Response;
    if (path === "/api/crawler/pool" && req.method === "GET") response = await (await import("@/app/api/crawler/pool/route")).GET(request);
    else if (path === "/api/crawler/sources" && req.method === "GET") response = await (await import("@/app/api/crawler/sources/route")).GET(request);
    else if (path === "/api/crawler/findings" && req.method === "POST") response = await (await import("@/app/api/crawler/findings/route")).POST(request);
    else response = new Response("not found", { status: 404 });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  }

  const client = () =>
    new AsmitaClient({ baseUrl, serviceKey: key, userAgent: "AsmitaCrawlerTest/1.0", timeoutMs: 5000, attempts: 1, baseDelayMs: 1, maxDelayMs: 1 });

  beforeAll(async () => {
    ({ AsmitaClient } = await loadClient());
    server = createServer((req, res) => void route(req, res).catch(() => { res.writeHead(500); res.end(); }));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("ENABLE_CRAWLER", "true");
    const { resetCrawlMemory, crawlMemory } = await import("@/lib/crawl-store");
    const { issueCrawlServiceKey } = await import("@/lib/crawler-auth");
    const { createCrawlSource } = await import("@/lib/crawl-sources");
    const { recordCrawlConsent } = await import("@/lib/crawl-consent");
    const { encryptField } = await import("@/lib/encryption");
    const store = await import("@/lib/store");
    resetCrawlMemory();
    store.cases.clear();
    ({ key } = await issueCrawlServiceKey("contract test"));
    const source = await createCrawlSource({ domain: "forum.example.com", pageBudget: 50, delayMs: 1000, enabled: true }, "admin-1");
    if (!source.ok) throw new Error("source");
    sourceId = source.source.id;
    const record = await store.createCase("user-contract");
    crawlMemory().fingerprints.set("hs-c", { id: "hs-c", caseId: record.id, hashEncrypted: encryptField("9".repeat(64)), quality: 90, status: "APPROVED", crawlPoolId: null });
    await recordCrawlConsent({ caseId: record.id, signedPdfEncrypted: "enc", hashSubmissionIds: ["hs-c"], templateId: "t", templateDigest: "d" });
    // A video fingerprint on its own case (video-fingerprints spec WP20): the
    // pool must serve it as its own entry, and a finding against its pool id
    // is stored like an image finding. (On one case a second fingerprint
    // matching the same copy location merges into the same finding row, so
    // the video gets its own case here to prove storage end to end.)
    const videoCase = await store.createCase("user-contract-video");
    crawlMemory().fingerprints.set("hs-v", {
      id: "hs-v", caseId: videoCase.id, hashEncrypted: encryptField("5".repeat(64)), quality: 95, status: "APPROVED", crawlPoolId: null,
      algorithm: "VPDQ",
      videoFramesEncrypted: encryptField(JSON.stringify([
        { hash: "4".repeat(64), quality: 80, t: 0 },
        { hash: "5".repeat(64), quality: 95, t: 1 },
      ])),
    });
    await recordCrawlConsent({ caseId: videoCase.id, signedPdfEncrypted: "enc", hashSubmissionIds: ["hs-v"], templateId: "t", templateDigest: "d" });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("the pool and sources responses pass the crawler's own schemas", async () => {
    const c = client();
    try {
      const pool = await c.getPool();
      // One image entry in the pre-WP20 shape and one video entry (WP20),
      // sorted by the random pool ids.
      const sorted = [...pool.fingerprints].sort((a, b) => a.id.localeCompare(b.id));
      expect(sorted).toHaveLength(2);
      expect(sorted).toContainEqual({ id: expect.stringMatching(/^fp_/), pdq: "9".repeat(64), quality: 90 });
      expect(sorted).toContainEqual({ id: expect.stringMatching(/^fp_/), kind: "video", frames: ["4".repeat(64), "5".repeat(64)] });
      const sources = await c.getSources();
      // origin/hops/render are the crawler v2 source fields (WP1 in the app,
      // read by the crawler since WP7): an admin-created source reads as
      // origin "admin", hops 0, render "http".
      expect(sources).toEqual([
        { id: sourceId, kind: "site", domain: "forum.example.com", pageBudget: 50, delayMs: 1000, origin: "admin", hops: 0, render: "http" },
      ]);
    } finally {
      await c.close();
    }
  });

  it("a finding the client sends is stored, and every per-item answer passes the client's schema", async () => {
    const c = client();
    try {
      const pool = await c.getPool();
      const imageId = pool.fingerprints.find((f) => "pdq" in f)!.id;
      const videoId = pool.fingerprints.find((f) => "kind" in f)!.id;
      const finding = {
        fingerprintId: imageId,
        pageUrl: "https://forum.example.com/thread/contract",
        imageUrl: "https://cdn.example.net/contract.jpg",
        distance: 3,
        quality: 90,
        observedAt: new Date().toISOString(),
        sourceId,
      };
      const results = await c.postFindings("run-contract", [
        finding,
        finding,
        { ...finding, pageUrl: "https://elsewhere.example.org/x" },
        { ...finding, fingerprintId: "fp_unknown" },
        // A video match: the same contract, the video submission's pool id.
        { ...finding, fingerprintId: videoId },
      ]);
      expect(results).toEqual([
        { status: "accepted" },
        { status: "accepted" },
        { status: "rejected", reason: "page_not_in_source" },
        { status: "rejected", reason: "fingerprint_not_accepted" },
        { status: "accepted" },
      ]);
      const { REJECT_REASONS } = await loadClient();
      for (const r of results) if (r.reason) expect(REJECT_REASONS).toContain(r.reason);
      const { crawlMemory } = await import("@/lib/crawl-store");
      // The image finding and the video finding are both stored.
      expect(crawlMemory().findings.size).toBe(2);
      expect([...crawlMemory().findings.values()].map((f) => f.hashSubmissionId).sort()).toEqual(["hs-c", "hs-v"]);
    } finally {
      await c.close();
    }
  });

  it("the client reads the switched-off server and a bad key as the codes its exit logic expects", async () => {
    const bad = new AsmitaClient({ baseUrl, serviceKey: "cwk_" + "0".repeat(48), userAgent: "t", timeoutMs: 5000, attempts: 1, baseDelayMs: 1, maxDelayMs: 1 });
    await expect(bad.getPool()).rejects.toMatchObject({ code: "api_unauthorized" });
    await bad.close();
    vi.stubEnv("ENABLE_CRAWLER", "false");
    const c = client();
    await expect(c.getPool()).rejects.toMatchObject({ code: "api_disabled" });
    await c.close();
  });
});
