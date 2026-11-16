/** Byte caps while streaming and after decompression (decompression bombs). */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";
import { brotliCompressSync, deflateRawSync, deflateSync, gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CrawlError } from "../../src/errors.ts";
import { decode, readCapped, SafeFetcher } from "../../src/net/safe-fetch.ts";
import { loopbackTestPolicy } from "../support/test-policy.ts";

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof CrawlError ? e.code : `other:${String(e)}`;
  }
};

const MB = 1024 * 1024;

describe("decode()", () => {
  const zeros = Buffer.alloc(50 * MB); // 50 MB of zeros compresses to ~50 KB
  it("rejects a gzip bomb once the inflated size passes the cap", async () => {
    const bomb = gzipSync(zeros);
    expect(bomb.length).toBeLessThan(MB);
    expect(await code(decode(bomb, "gzip", 2 * MB))).toBe("body_too_large");
  });
  it("rejects brotli and deflate bombs too", async () => {
    expect(await code(decode(brotliCompressSync(zeros), "br", 2 * MB))).toBe("body_too_large");
    expect(await code(decode(deflateSync(zeros), "deflate", 2 * MB))).toBe("body_too_large");
    expect(await code(decode(deflateRawSync(zeros), "deflate", 2 * MB))).toBe("body_too_large");
  });
  it("round-trips normal bodies for every supported encoding", async () => {
    const text = Buffer.from("hello world ".repeat(1000));
    expect((await decode(gzipSync(text), "gzip", MB)).equals(text)).toBe(true);
    expect((await decode(gzipSync(text), "x-gzip", MB)).equals(text)).toBe(true);
    expect((await decode(brotliCompressSync(text), "br", MB)).equals(text)).toBe(true);
    expect((await decode(deflateSync(text), "deflate", MB)).equals(text)).toBe(true);
    expect((await decode(deflateRawSync(text), "deflate", MB)).equals(text)).toBe(true);
    expect((await decode(text, undefined, MB)).equals(text)).toBe(true);
    expect((await decode(text, "identity", MB)).equals(text)).toBe(true);
  });
  it("refuses stacked, unknown and corrupt encodings", async () => {
    expect(await code(decode(Buffer.from("x"), "gzip, br", MB))).toBe("unsupported_encoding");
    expect(await code(decode(Buffer.from("x"), "compress", MB))).toBe("unsupported_encoding");
    expect(await code(decode(Buffer.from("definitely not gzip"), "gzip", MB))).toBe("decompression_failed");
  });
});

describe("readCapped()", () => {
  it("stops reading as soon as the cap is exceeded", async () => {
    let produced = 0;
    const stream = Readable.from(
      (function* () {
        for (let i = 0; i < 100; i++) {
          produced++;
          yield Buffer.alloc(64 * 1024);
        }
      })(),
    );
    expect(await code(readCapped(stream, 256 * 1024))).toBe("body_too_large");
    expect(produced).toBeLessThan(10);
  });
  it("returns the exact bytes under the cap", async () => {
    const out = await readCapped(Readable.from([Buffer.from("ab"), Buffer.from("cd")]), 4);
    expect(out.toString()).toBe("abcd");
  });
});

describe("caps over HTTP", () => {
  let server: Server;
  let port: number;
  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === "/declared") {
        res.writeHead(200, { "content-type": "image/png", "content-length": String(20 * MB) });
        res.end(); // the declared length alone must trip the cap
        return;
      }
      if (req.url === "/chunked") {
        res.writeHead(200, { "content-type": "image/png" });
        const chunk = Buffer.alloc(MB, 1);
        let n = 0;
        const pump = () => {
          while (n < 30 && !res.destroyed) {
            n++;
            if (!res.write(chunk)) return res.once("drain", pump);
          }
          res.end();
        };
        pump();
        return;
      }
      if (req.url === "/gzip-bomb") {
        const bomb = gzipSync(Buffer.alloc(100 * MB));
        res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip", "content-length": String(bomb.length) });
        res.end(bomb);
        return;
      }
      if (req.url === "/stall") {
        res.writeHead(200, { "content-type": "text/html" });
        res.write("<html>"); // then nothing: body idle timeout
        return;
      }
      if (req.url === "/no-headers") return; // never answers: headers timeout
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => {
    server.closeAllConnections();
    return new Promise<void>((r) => server.close(() => r()));
  });

  const fetcher = () =>
    new SafeFetcher(loopbackTestPolicy(["caps.test"], port), {
      userAgent: "AsmitaCrawler/0.1 (test)",
      connectTimeoutMs: 1000,
      headersTimeoutMs: 500,
      bodyTimeoutMs: 500,
      totalTimeoutMs: 3000,
      maxRedirects: 5,
    });

  it("enforces declared, streamed and decompressed caps and timeouts", async () => {
    const f = fetcher();
    const get = (path: string, maxBytes: number) => f.fetch(`http://caps.test:${port}${path}`, { kind: "image", maxBytes, accept: "*/*" });
    expect(await code(get("/declared", 10 * MB))).toBe("body_too_large");
    expect(await code(get("/chunked", 10 * MB))).toBe("body_too_large");
    expect(await code(get("/gzip-bomb", 2 * MB))).toBe("body_too_large");
    expect(await code(get("/stall", MB))).toBe("body_timeout");
    expect(await code(get("/no-headers", MB))).toBe("headers_timeout");
    expect(await code(get("/missing", MB))).toBe("http_status");
    await f.close();
  });
});
