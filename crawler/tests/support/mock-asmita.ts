/**
 * A mock of the Asmita crawler API (GET pool, GET sources, POST findings),
 * on 127.0.0.1. Records every request so tests can assert on what the
 * crawler sent, including the Authorization header.
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Finding, Pool, Source } from "../../src/asmita/client.ts";

export type MockRequest = { method: string; path: string; authorization: string | undefined; body: unknown };

export type MockAsmitaOptions = {
  key: string;
  pool: Pool;
  sources: Source[];
  /** Override status for a route ("pool" | "sources" | "findings"), e.g. 503. */
  status?: Partial<Record<"pool" | "sources" | "findings", number>>;
  /** Fail the first N calls of a route with 500. */
  failFirst?: Partial<Record<"pool" | "sources" | "findings", number>>;
};

export class MockAsmita {
  readonly requests: MockRequest[] = [];
  /** Findings accepted (created), by `${fingerprintId}|${imageUrl}`. */
  readonly created = new Map<string, Finding>();
  readonly posted: Finding[] = [];
  private server: Server | null = null;
  private calls: Record<string, number> = {};

  constructor(public opts: MockAsmitaOptions) {}

  get url(): string {
    const a = this.server!.address() as AddressInfo;
    return `http://127.0.0.1:${a.port}`;
  }

  async start(): Promise<this> {
    this.server = createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((r) => this.server!.listen(0, "127.0.0.1", r));
    return this;
  }

  async stop(): Promise<void> {
    await new Promise<void>((r) => this.server?.close(() => r()));
    this.server?.closeAllConnections();
  }

  private async handle(req: IncomingMessage, res: import("node:http").ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    let body: unknown = undefined;
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

    if (route === "pool") return send(200, this.opts.pool);
    if (route === "sources") return send(200, { sources: this.opts.sources });
    const { findings } = body as { runId: string; findings: Finding[] };
    if (!Array.isArray(findings) || findings.length > 50) return send(400, { error: "bad_batch" });
    const known = new Set(this.opts.pool.fingerprints.map((f) => f.id));
    const results = findings.map((f) => {
      this.posted.push(f);
      if (!known.has(f.fingerprintId)) return { status: "rejected", reason: "unknown_fingerprint" };
      const key = `${f.fingerprintId}|${f.imageUrl}`;
      if (this.created.has(key)) return { status: "duplicate" };
      this.created.set(key, f);
      return { status: "created" };
    });
    return send(200, { results });
  }
}
