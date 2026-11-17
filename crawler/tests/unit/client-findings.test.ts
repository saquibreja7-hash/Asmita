/** Asmita API client (status handling, retries, schema, redirects) and the findings sink. */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AsmitaClient, type Finding, type Pool } from "../../src/asmita/client.ts";
import { CrawlError } from "../../src/errors.ts";
import { FindingsSink } from "../../src/findings.ts";
import { Logger } from "../../src/log.ts";
import { RunMetrics } from "../../src/metrics.ts";
import { randomFingerprint } from "../support/synthetic.ts";

const KEY = "unit-test-key-abcdefghijklmnopqrstuvwxyz";
type Reply = { status: number; body?: unknown; headers?: Record<string, string> };

let server: Server;
let base: string;
let replies: Reply[] = [];
const seen: { path: string; auth: string | undefined }[] = [];
let redirectTargetHit = false;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/elsewhere") {
      redirectTargetHit = true;
      res.writeHead(200).end("{}");
      return;
    }
    seen.push({ path: req.url ?? "", auth: req.headers.authorization });
    req.resume();
    req.on("end", () => {
      const r = replies.shift() ?? { status: 500 };
      res.writeHead(r.status, { "content-type": "application/json", ...r.headers });
      res.end(r.body === undefined ? "" : typeof r.body === "string" ? r.body : JSON.stringify(r.body));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const client = (attempts = 3) =>
  new AsmitaClient({ baseUrl: base, serviceKey: KEY, userAgent: "AsmitaCrawler/0.1 (test)", timeoutMs: 2000, attempts, baseDelayMs: 1, maxDelayMs: 5 });

const pool = (): Pool => ({
  version: "v1",
  generatedAt: "2026-11-16T10:00:00Z",
  threshold: 31,
  fingerprints: [{ id: "f1", pdq: randomFingerprint(1), quality: 100 }],
});

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof CrawlError ? e.code : `other:${String(e)}`;
  }
};

describe("AsmitaClient", () => {
  it("sends the bearer key and parses a valid pool", async () => {
    replies = [{ status: 200, body: pool() }];
    const c = client();
    const p = await c.getPool();
    expect(p.fingerprints).toHaveLength(1);
    expect(seen.at(-1)).toEqual({ path: "/api/crawler/pool", auth: `Bearer ${KEY}` });
    await c.close();
  });
  it("503 means switched off: no retry", async () => {
    replies = [{ status: 503 }, { status: 200, body: pool() }];
    const before = seen.length;
    expect(await code(client().getPool())).toBe("api_disabled");
    expect(seen.length - before).toBe(1);
    replies = [];
  });
  it("401/403 are fatal: no retry", async () => {
    replies = [{ status: 401 }];
    expect(await code(client().getSources())).toBe("api_unauthorized");
    replies = [{ status: 403 }];
    expect(await code(client().getSources())).toBe("api_unauthorized");
  });
  it("retries 500 and 429, then succeeds", async () => {
    replies = [{ status: 500 }, { status: 429, headers: { "retry-after": "0" } }, { status: 200, body: { sources: [] } }];
    expect(await client().getSources()).toEqual([]);
  });
  it("gives up after the attempt budget", async () => {
    replies = [{ status: 502 }, { status: 502 }];
    expect(await code(client(2).getSources())).toBe("api_http_status");
  });
  it("400 is a bug and 413 asks for a smaller batch: neither is retried by the client", async () => {
    replies = [{ status: 400 }, { status: 200, body: { sources: [] } }];
    const before = seen.length;
    expect(await code(client().getSources())).toBe("api_bad_request");
    expect(seen.length - before).toBe(1);
    replies = [{ status: 413 }];
    expect(await code(client().getSources())).toBe("api_payload_too_large");
    replies = [];
  });
  it("refuses redirects and never follows them with the key", async () => {
    replies = [{ status: 302, headers: { location: `${base}/elsewhere` } }];
    expect(await code(client().getPool())).toBe("api_redirect");
    expect(redirectTargetHit).toBe(false);
  });
  it("rejects responses that do not match the contract", async () => {
    const bad: unknown[] = [
      "not json",
      { ...pool(), fingerprints: [{ id: "f1", pdq: randomFingerprint(1).toUpperCase(), quality: 100 }] },
      { ...pool(), fingerprints: [{ id: "f1", pdq: "abc", quality: 100 }] },
      { ...pool(), threshold: 31.5 },
      { ...pool(), generatedAt: "yesterday" },
    ];
    for (const body of bad) {
      replies = [{ status: 200, body }];
      expect(await code(client().getPool())).toBe("api_bad_response");
    }
    replies = [{ status: 200, body: { sources: [{ id: "s", kind: "feed", domain: "x.example", pageBudget: 1, delayMs: 0 }] } }];
    expect(await code(client().getSources())).toBe("api_bad_response");
  });
  it("accepts a lower pool threshold (the matcher caps it at 31 anyway)", async () => {
    replies = [{ status: 200, body: { ...pool(), threshold: 20 } }];
    expect((await client().getPool()).threshold).toBe(20);
  });
  it("posts at most 50 findings and requires one result per finding", async () => {
    const f = (i: number): Finding => ({
      fingerprintId: "f1",
      pageUrl: `https://site.example/p${i}`,
      imageUrl: `https://site.example/i${i}.jpg`,
      distance: 0,
      quality: 100,
      observedAt: "2026-11-16T10:00:00Z",
      sourceId: "s1",
    });
    expect(await code(client().postFindings("run", Array.from({ length: 51 }, (_, i) => f(i))))).toBe("internal");
    replies = [{ status: 200, body: { results: [{ status: "created" }] } }];
    expect(await code(client().postFindings("run", [f(1), f(2)]))).toBe("api_bad_response");
    replies = [{ status: 200, body: { results: [{ status: "accepted" }, { status: "rejected", reason: "page_not_in_source" }] } }];
    expect(await client().postFindings("run", [f(1), f(2)])).toEqual([{ status: "accepted" }, { status: "rejected", reason: "page_not_in_source" }]);
    // Rollout compatibility: the old statuses still parse, as "accepted".
    replies = [{ status: 200, body: { results: [{ status: "created" }, { status: "duplicate" }] } }];
    expect(await client().postFindings("run", [f(1), f(2)])).toEqual([{ status: "accepted" }, { status: "accepted" }]);
    replies = [{ status: 200, body: { results: [{ status: "pending" }, { status: "accepted" }] } }];
    expect(await code(client().postFindings("run", [f(1), f(2)]))).toBe("api_bad_response");
  });
  it("reports discovery hosts to the right path, and never an empty or oversized batch", async () => {
    // An empty list is not sent at all.
    const before = seen.length;
    expect(await client().reportDiscoveries("s1", "run", [])).toBe(0);
    expect(seen.length).toBe(before);
    // More than the contract's 200 hosts is our bug: refused locally.
    const many = Array.from({ length: 201 }, (_, i) => `h${i}.example`);
    expect(await code(client().reportDiscoveries("s1", "run", many))).toBe("internal");
    expect(seen.length).toBe(before);
    // A valid report carries the strict body and parses the accepted count.
    replies = [{ status: 200, body: { accepted: 2 } }];
    expect(await client().reportDiscoveries("s1", "run-7", ["a.example", "b.example"])).toBe(2);
    expect(seen.at(-1)!.path).toBe("/api/crawler/discoveries");
    // A response without the accepted count is not the contract.
    replies = [{ status: 200, body: { stored: 2 } }];
    expect(await code(client().reportDiscoveries("s1", "run-7", ["a.example"]))).toBe("api_bad_response");
  });
});

describe("FindingsSink", () => {
  const ok = (f: Finding[]) => f.map(() => ({ status: "accepted" as const }));
  const mk = (i: number, id = "f1"): Finding => ({
    fingerprintId: id,
    pageUrl: `https://site.example/p${i}`,
    imageUrl: `https://site.example/i${i}.jpg`,
    distance: 1,
    quality: 90,
    observedAt: "2026-11-16T10:00:00Z",
    sourceId: "s1",
  });
  const silent = new Logger({ sink: () => undefined });

  it("posts full batches of 50 as they fill and the rest on final flush", async () => {
    const batches: number[] = [];
    const m = new RunMetrics();
    const sink = new FindingsSink("run", async (_r, f) => (batches.push(f.length), f.map(() => ({ status: "accepted" as const }))), m, silent);
    for (let i = 0; i < 120; i++) sink.add(mk(i));
    await sink.flush(false);
    expect(batches).toEqual([50, 50]);
    await sink.flush(true);
    expect(batches).toEqual([50, 50, 20]);
    expect(m.findingsAccepted).toBe(120);
  });

  it("keeps a failed batch and delivers it on the next flush", async () => {
    let fail = true;
    const delivered: Finding[] = [];
    const m = new RunMetrics();
    const sink = new FindingsSink(
      "run",
      async (_r, f) => {
        if (fail) throw new CrawlError("api_http_status", { status: 500 });
        delivered.push(...f);
        return f.map(() => ({ status: "accepted" as const }));
      },
      m,
      silent,
    );
    for (let i = 0; i < 3; i++) sink.add(mk(i));
    await sink.flush(true);
    expect(sink.pending).toBe(3);
    fail = false;
    await sink.flush(true);
    expect(delivered.map((f) => f.pageUrl)).toEqual([0, 1, 2].map((i) => `https://site.example/p${i}`));
    sink.finish();
    expect(m.findingsUnsent).toBe(0);
  });

  it("purges queued findings for fingerprints that left the pool", async () => {
    const posted: Finding[] = [];
    const m = new RunMetrics();
    const sink = new FindingsSink("run", async (_r, f) => (posted.push(...f), f.map(() => ({ status: "accepted" as const }))), m, silent);
    sink.add(mk(1, "keep"));
    sink.add(mk(2, "withdrawn"));
    sink.add(mk(3, "keep"));
    sink.purge((id) => id !== "withdrawn");
    await sink.flush(true);
    expect(posted.map((f) => f.fingerprintId)).toEqual(["keep", "keep"]);
    expect(m.findingsWithdrawn).toBe(1);
  });

  it("stops posting once the API reports the crawler switched off", async () => {
    let calls = 0;
    const m = new RunMetrics();
    const sink = new FindingsSink(
      "run",
      async () => {
        calls++;
        throw new CrawlError("api_disabled");
      },
      m,
      silent,
    );
    for (let i = 0; i < 120; i++) sink.add(mk(i));
    await sink.flush(true);
    expect(calls).toBe(1);
    expect(sink.disabled).toBe(true);
    sink.finish();
    expect(m.findingsUnsent).toBe(120);
  });

  it("drops findings that would fail server validation before queueing", () => {
    const m = new RunMetrics();
    const sink = new FindingsSink("run", async (_r, f) => ok(f), m, silent);
    sink.add({ ...mk(1), distance: 32 });
    sink.add({ ...mk(2), distance: 1.5 });
    sink.add({ ...mk(3), observedAt: "2026-11-16 10:00" });
    sink.add({ ...mk(4), imageUrl: "data:image/png;base64,AAAA" });
    sink.add({ ...mk(5), pageUrl: `https://site.example/${"x".repeat(300_000)}` }); // over the body limit
    sink.add({ ...mk(6), ...({ extra: true } as object) });
    sink.add(mk(7));
    expect(m.findingsInvalid).toBe(6);
    expect(sink.pending).toBe(1);
  });

  it("cuts batches by size as well as count", async () => {
    const sizes: number[] = [];
    const m = new RunMetrics();
    const sink = new FindingsSink("run", async (r, f) => (sizes.push(Buffer.byteLength(JSON.stringify({ runId: r, findings: f }))), ok(f)), m, silent);
    const long = (i: number): Finding => ({ ...mk(i), pageUrl: `https://site.example/${"p".repeat(1900)}${i}`, imageUrl: `https://site.example/${"i".repeat(1900)}${i}` });
    for (let i = 0; i < 49; i++) sink.add(long(i));
    await sink.flush(true);
    expect(sizes.every((n) => n <= 256 * 1024)).toBe(true);
    expect(m.findingsAccepted).toBe(49);
  });

  it("splits a batch on 413 and resends both halves", async () => {
    const sizes: number[] = [];
    const m = new RunMetrics();
    const sink = new FindingsSink(
      "run",
      async (_r, f) => {
        if (f.length > 10) throw new CrawlError("api_payload_too_large", { status: 413 });
        sizes.push(f.length);
        return ok(f);
      },
      m,
      silent,
    );
    for (let i = 0; i < 40; i++) sink.add(mk(i));
    await sink.flush(true);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(40);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(10);
    expect(m.findingsAccepted).toBe(40);
    expect(m.findingsUnsent).toBe(0);
  });

  it("drops a batch the server calls malformed (400) without retrying it", async () => {
    let calls = 0;
    const m = new RunMetrics();
    const sink = new FindingsSink(
      "run",
      async () => {
        calls++;
        throw new CrawlError("api_bad_request", { status: 400 });
      },
      m,
      silent,
    );
    sink.add(mk(1));
    await sink.flush(true);
    await sink.flush(true);
    expect(calls).toBe(1);
    expect(m.findingsFailed).toBe(1);
    expect(m.errors.api_bad_request).toBe(1);
  });

  it("counts rejections by reason and withdraws fingerprints not accepted", async () => {
    const withdrawn: string[] = [];
    const m = new RunMetrics();
    const reasons = ["fingerprint_not_accepted", "invalid_url", "page_not_in_source", "something_new"];
    let first = true;
    const posted: string[] = [];
    const sink = new FindingsSink(
      "run",
      async (_r, f) => {
        posted.push(...f.map((x) => x.fingerprintId));
        if (!first) return ok(f);
        first = false;
        return f.map((_, i) => ({ status: "rejected" as const, reason: reasons[i] }));
      },
      m,
      silent,
      (id) => withdrawn.push(id),
    );
    sink.add(mk(1, "gone"));
    sink.add(mk(2, "a"));
    sink.add(mk(3, "b"));
    sink.add(mk(4, "c"));
    await sink.flush(true);
    sink.add(mk(5, "gone")); // refused: withdrawn ids are never queued again
    sink.add(mk(6, "a"));
    expect(withdrawn).toEqual(["gone"]);
    expect(m.rejectedByReason).toEqual({ fingerprint_not_accepted: 1, invalid_url: 1, page_not_in_source: 1, other: 1 });
    await sink.flush(true);
    expect(posted.slice(4)).toEqual(["a"]);
    expect(m.findingsWithdrawn).toBe(1);
  });
});
