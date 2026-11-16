/**
 * A mock of the Asmita crawler API (GET pool, GET sources, POST findings),
 * on 127.0.0.1. Records every request so tests can assert on what the
 * crawler sent, including the Authorization header.
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { z } from "zod";
import type { Finding, Pool, Source } from "../../src/asmita/client.ts";

/**
 * The server's request contract, written out independently of the client's
 * schema so client drift shows up as a 400 in tests.
 */
const ServerFinding = z.strictObject({
  fingerprintId: z.string().min(1),
  pageUrl: z.string().min(1),
  imageUrl: z.string().min(1),
  distance: z.number().int().min(0).max(31),
  quality: z.number().min(0).max(100),
  observedAt: z.iso.datetime({ offset: true }),
  sourceId: z.string().min(1),
});
const ServerEnvelope = z.strictObject({
  runId: z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/),
  findings: z.array(z.unknown()).min(1).max(50),
});
const BODY_LIMIT = 256 * 1024;

export type MockRequest = { method: string; path: string; authorization: string | undefined; body: unknown };

export type MockAsmitaOptions = {
  key: string;
  pool: Pool;
  sources: Source[];
  /** Override status for a route ("pool" | "sources" | "findings"), e.g. 503. */
  status?: Partial<Record<"pool" | "sources" | "findings", number>>;
  /** Fail the first N calls of a route with 500. */
  failFirst?: Partial<Record<"pool" | "sources" | "findings", number>>;
  /** Pool served from the second pool request on (simulates a re-sync change). */
  poolAfterFirst?: Pool;
  /** Fingerprint ids the server answers "fingerprint_not_accepted" for. */
  notAccepted?: string[];
  /** Body size limit for POST /findings (default 256 KiB, 413 above). */
  bodyLimit?: number;
};

export class MockAsmita {
  readonly requests: MockRequest[] = [];
  /** Findings accepted (created), by `${fingerprintId}|${imageUrl}`. */
  readonly created = new Map<string, Finding>();
  readonly posted: Finding[] = [];
  readonly bodySizes: number[] = [];
  readonly badRequests: string[] = [];
  private server: Server | null = null;
  private calls: Record<string, number> = {};

  constructor(public opts: MockAsmitaOptions) {}

  get url(): string {
    const a = this.server!.address() as AddressInfo;
    return `http://127.0.0.1:${a.port}`;
  }

  async start(port = 0): Promise<this> {
    this.server = createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((r) => this.server!.listen(port, "127.0.0.1", r));
    return this;
  }

  async stop(): Promise<void> {
    await new Promise<void>((r) => this.server?.close(() => r()));
    this.server?.closeAllConnections();
  }

  private async handle(req: IncomingMessage, res: import("node:http").ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const rawBuf = Buffer.concat(chunks);
    this.bodySizes.push(rawBuf.length);
    const raw = rawBuf.toString("utf8");
    let body: unknown;
    try {
      body = raw ? JSON.parse(raw) : undefined;
    } catch {
      body = raw;
    }
    const path = (req.url ?? "").split("?")[0]!;
    this.requests.push({ method: req.method ?? "", path, authorization: req.headers.authorization, body });
    const send = (status: number, json?: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(json === undefined ? "" : JSON.stringify(json));
    };
    const route =
      req.method === "GET" && path === "/api/crawler/pool"
        ? "pool"
        : req.method === "GET" && path === "/api/crawler/sources"
          ? "sources"
          : req.method === "POST" && path === "/api/crawler/findings"
            ? "findings"
            : null;
    if (!route) return send(404, { error: "not_found" });
    if (req.headers.authorization !== `Bearer ${this.opts.key}`) return send(401, { error: "unauthorized" });
    const override = this.opts.status?.[route];
    if (override) return send(override, { error: "override" });
    this.calls[route] = (this.calls[route] ?? 0) + 1;
    if ((this.opts.failFirst?.[route] ?? 0) >= this.calls[route]) return send(500, { error: "flaky" });

    if (route === "pool") {
      const later = this.opts.poolAfterFirst;
      return send(200, later && this.calls.pool! > 1 ? later : this.opts.pool);
    }
    if (route === "sources") return send(200, { sources: this.opts.sources });
    if (Buffer.byteLength(raw) > (this.opts.bodyLimit ?? BODY_LIMIT)) return send(413, { error: "payload_too_large" });
    const env = ServerEnvelope.safeParse(body);
    if (!env.success) {
      this.badRequests.push("envelope");
      return send(400, { error: "invalid_body" });
    }
    const known = new Set((this.opts.poolAfterFirst ?? this.opts.pool).fingerprints.map((f) => f.id));
    const notAccepted = new Set(this.opts.notAccepted ?? []);
    const sourceIds = new Set(this.opts.sources.map((s) => s.id));
    const results = env.data.findings.map((item) => {
      const parsed = ServerFinding.safeParse(item);
      if (!parsed.success) return { status: "rejected", reason: "invalid_finding" };
      const f = parsed.data;
      this.posted.push(f);
      if (/^data:/i.test(f.imageUrl) || /^data:/i.test(f.pageUrl)) return { status: "rejected", reason: "media_payload_rejected" };
      if (!/^https?:\/\//.test(f.imageUrl) || !/^https?:\/\//.test(f.pageUrl)) return { status: "rejected", reason: "invalid_url" };
      if (!sourceIds.has(f.sourceId)) return { status: "rejected", reason: "unknown_source" };
      if (!known.has(f.fingerprintId) || notAccepted.has(f.fingerprintId)) return { status: "rejected", reason: "fingerprint_not_accepted" };
      const key = `${f.fingerprintId}|${f.imageUrl}`;
      if (this.created.has(key)) return { status: "duplicate" };
      this.created.set(key, f);
      return { status: "created" };
    });
    return send(200, { results });
  }
}
