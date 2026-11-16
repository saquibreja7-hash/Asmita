/**
 * The TLS path with a pinned IP: the socket dials the validated IP literal,
 * while SNI, the certificate hostname check and the Host header all use the
 * original hostname. Certificates come from an in-memory test CA trusted
 * only through the fetcher's testOnlyTrustedCa option (verification stays on).
 */
import { createServer, type Server } from "node:https";
import type { AddressInfo } from "node:net";
import type { TLSSocket } from "node:tls";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CrawlError } from "../../src/errors.ts";
import { productionPolicy, type NetPolicy } from "../../src/net/policy.ts";
import { SafeFetcher } from "../../src/net/safe-fetch.ts";
import { createTestCa, selfSignedLeaf } from "../support/test-pki.ts";

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof CrawlError ? e.code : `other:${String(e)}`;
  }
};

type Seen = { servername: string | false | null | undefined; host: string | undefined; path: string | undefined; remote: string | undefined };

async function tlsServer(key: string, cert: string, seen: Seen[]): Promise<{ server: Server; port: number }> {
  const server = createServer({ key, cert }, (req, res) => {
    const sock = req.socket as TLSSocket;
    seen.push({ servername: sock.servername, host: req.headers.host, path: req.url, remote: sock.remoteAddress });
    if (req.url === "/to-private") {
      res.writeHead(302, { location: "https://10.0.0.1/secret" });
      return res.end();
    }
    if (req.url === "/to-metadata") {
      res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
      return res.end();
    }
    if (req.url === "/to-mapped") {
      res.writeHead(302, { location: "https://[::ffff:192.168.0.1]/" });
      return res.end();
    }
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("tls ok");
  });
  // Failed handshakes never reach the request handler.
  server.on("tlsClientError", () => undefined);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { server, port: (server.address() as AddressInfo).port };
}

const seenGood: Seen[] = [];
const seenWrong: Seen[] = [];
const seenSelf: Seen[] = [];
let ca: ReturnType<typeof createTestCa>;
let good: { server: Server; port: number };
let wrong: { server: Server; port: number };
let self: { server: Server; port: number };
const resolverCalls: string[] = [];

/** secure.test, wrongname.test, selfsigned.test -> 127.0.0.1 (the stand-in "public" IP). */
function policy(): NetPolicy {
  const prod = productionPolicy();
  const ports = new Set([good.port, wrong.port, self.port]);
  return {
    resolve: async (host) => {
      resolverCalls.push(host);
      if (["secure.test", "wrongname.test", "selfsigned.test"].includes(host)) return [{ address: "127.0.0.1", family: 4 }];
      throw Object.assign(new Error("nx"), { code: "ENOTFOUND" });
    },
    isAddressAllowed: (a) => a === "127.0.0.1" || prod.isAddressAllowed(a),
    isPortAllowed: (p, proto) => ports.has(p) || prod.isPortAllowed(p, proto),
  };
}

const fetcher = (trusted: string | undefined) =>
  new SafeFetcher(policy(), {
    userAgent: "AsmitaCrawler/0.1 (test)",
    connectTimeoutMs: 2000,
    headersTimeoutMs: 2000,
    bodyTimeoutMs: 2000,
    totalTimeoutMs: 4000,
    maxRedirects: 5,
    testOnlyTrustedCa: trusted,
  });
const get = (f: SafeFetcher, url: string) => f.fetch(url, { kind: "html", maxBytes: 1024, accept: "*/*" });

beforeAll(async () => {
  ca = createTestCa();
  const goodLeaf = ca.issue(["secure.test"]);
  const otherLeaf = ca.issue(["other.test"]); // trusted CA, wrong name
  const selfLeaf = selfSignedLeaf("selfsigned.test"); // right name, untrusted issuer
  good = await tlsServer(goodLeaf.key, goodLeaf.cert, seenGood);
  wrong = await tlsServer(otherLeaf.key, otherLeaf.cert, seenWrong);
  self = await tlsServer(selfLeaf.key, selfLeaf.cert, seenSelf);
});

afterAll(async () => {
  for (const s of [good, wrong, self]) {
    s?.server.closeAllConnections();
    await new Promise<void>((r) => s?.server.close(() => r()));
  }
});

describe("TLS with a pinned IP", () => {
  it("succeeds when the certificate matches the hostname; SNI and Host carry the hostname, the socket the IP", async () => {
    const f = fetcher(ca.cert);
    resolverCalls.length = 0;
    const res = await get(f, `https://secure.test:${good.port}/hello`);
    expect(res.body.toString()).toBe("tls ok");
    expect(seenGood.at(-1)).toEqual({
      servername: "secure.test", // SNI is the hostname, not 127.0.0.1
      host: `secure.test:${good.port}`,
      path: "/hello",
      remote: "127.0.0.1",
    });
    // secure.test does not exist in real DNS, so the socket can only have been
    // opened to the address our resolver validated (resolved once, by us).
    expect(resolverCalls).toEqual(["secure.test"]);
    await f.close();
  });

  it("rejects a trusted certificate issued for a different name", async () => {
    const f = fetcher(ca.cert);
    expect(await code(get(f, `https://wrongname.test:${wrong.port}/`))).toBe("tls_failed");
    expect(seenWrong).toHaveLength(0); // no request was sent
    await f.close();
  });

  it("rejects a certificate from an untrusted issuer even when the name matches", async () => {
    const f = fetcher(ca.cert);
    expect(await code(get(f, `https://selfsigned.test:${self.port}/`))).toBe("tls_failed");
    expect(seenSelf).toHaveLength(0);
    await f.close();
  });

  it("does not trust the test CA unless it is injected", async () => {
    const f = fetcher(undefined); // system trust store, as in production
    expect(await code(get(f, `https://secure.test:${good.port}/`))).toBe("tls_failed");
    await f.close();
  });

  it("refuses redirects from the HTTPS site to private and metadata addresses", async () => {
    const f = fetcher(ca.cert);
    const before = seenGood.length;
    expect(await code(get(f, `https://secure.test:${good.port}/to-private`))).toBe("blocked_address");
    expect(await code(get(f, `https://secure.test:${good.port}/to-metadata`))).toBe("blocked_address");
    expect(await code(get(f, `https://secure.test:${good.port}/to-mapped`))).toBe("blocked_address");
    // Only the three redirecting requests reached the fixture; no hop followed.
    expect(seenGood.length - before).toBe(3);
    await f.close();
  });
});
