/**
 * SSRF guard: address classification, URL checks, resolve-all-then-pin,
 * redirects re-validated, credentials and ports. No test touches the real
 * internet: public addresses are only classified, never connected to.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CrawlError } from "../../src/errors.ts";
import { isBlockedAddress } from "../../src/net/ip.ts";
import { checkUrl, productionPolicy, resolveAllowed, type NetPolicy } from "../../src/net/policy.ts";
import { SafeFetcher } from "../../src/net/safe-fetch.ts";
import { fakeDnsPolicy } from "../support/test-policy.ts";

const code = async (p: Promise<unknown> | (() => unknown)): Promise<string> => {
  try {
    await (typeof p === "function" ? p() : p);
    return "ok";
  } catch (e) {
    return e instanceof CrawlError ? e.code : `non-crawl-error:${String(e)}`;
  }
};

describe("address classification", () => {
  const blocked = [
    "0.0.0.0", "10.1.2.3", "100.64.0.1", "100.100.100.200", "127.0.0.1", "127.255.255.254", "169.254.169.254",
    "172.16.0.1", "172.31.255.255", "192.0.0.1", "192.0.2.1", "192.168.1.1", "198.18.0.1", "198.51.100.1",
    "203.0.113.1", "224.0.0.1", "239.255.255.250", "240.0.0.1", "255.255.255.255",
    "::", "::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:8.8.8.8", "::127.0.0.1", "64:ff9b::7f00:1",
    "64:ff9b::808:808", "100::1", "fc00::1", "fd00:ec2::254", "fe80::1", "fec0::1", "ff02::1",
    "2001::1", "2001:db8::1", "2002:7f00:1::1", "3fff::1", "[::1]", "fe80::1%eth0", "not-an-ip", "",
  ];
  const allowed = ["8.8.8.8", "1.1.1.1", "93.184.215.14", "172.32.0.1", "100.128.0.1", "2606:4700:4700::1111", "2a00:1450::1"];
  it.each(blocked)("blocks %s", (ip) => expect(isBlockedAddress(ip)).toBe(true));
  it.each(allowed)("allows %s", (ip) => expect(isBlockedAddress(ip)).toBe(false));
});

describe("URL checks before any network activity", () => {
  const policy = productionPolicy(async () => {
    throw new Error("no DNS in this test");
  });
  const table: [string, string][] = [
    ["http://2130706433/", "blocked_address"], // decimal 127.0.0.1
    ["http://0177.0.0.1/", "blocked_address"], // octal
    ["http://0x7f.0.0.1/", "blocked_address"], // hex
    ["http://0x7f000001/", "blocked_address"],
    ["http://127.1/", "blocked_address"], // short form
    ["http://[::1]/", "blocked_address"],
    ["http://[::ffff:127.0.0.1]/", "blocked_address"],
    ["http://[::ffff:a9fe:a9fe]/", "blocked_address"], // mapped 169.254.169.254
    ["http://[64:ff9b::a9fe:a9fe]/", "blocked_address"], // NAT64 metadata
    ["http://[fd00:ec2::254]/", "blocked_address"], // AWS IPv6 metadata
    ["http://169.254.169.254/latest/meta-data/", "blocked_address"],
    ["http://100.100.100.200/", "blocked_address"],
    ["http://0/", "blocked_address"],
    ["http://user:pass@example.com/", "url_credentials"],
    ["http://user@example.com/", "url_credentials"],
    ["http://example.com:8080/", "blocked_port"],
    ["https://example.com:80/", "blocked_port"],
    ["http://example.com:443/", "blocked_port"],
    ["http://example.com:22/", "blocked_port"],
    ["ftp://example.com/", "blocked_scheme"],
    ["file:///etc/passwd", "blocked_scheme"],
    ["gopher://example.com/", "blocked_scheme"],
    ["data:image/png;base64,AAAA", "blocked_scheme"],
    ["javascript:alert(1)", "blocked_scheme"],
    ["not a url", "invalid_url"],
    ["http://8.8.8.8/", "ok"],
    ["https://example.com/", "ok"],
    ["http://example.com:80/x", "ok"],
  ];
  it.each(table)("%s -> %s", async (url, want) => {
    expect(await code(() => checkUrl(url, policy))).toBe(want);
  });
});

describe("resolution: every address must be allowed", () => {
  it("refuses a host with one private record among public ones", async () => {
    const p = fakeDnsPolicy({ "mixed.example": ["8.8.8.8", "10.0.0.5"] });
    expect(await code(resolveAllowed("mixed.example", p))).toBe("blocked_address");
  });
  it("refuses hosts resolving to loopback, metadata, mapped and NAT64 addresses", async () => {
    const p = fakeDnsPolicy({
      a: ["127.0.0.1"],
      b: ["169.254.169.254"],
      c: ["::ffff:10.0.0.1"],
      d: ["64:ff9b::a00:1"],
      e: ["fd00:ec2::254"],
    });
    for (const h of ["a", "b", "c", "d", "e"]) expect(await code(resolveAllowed(h, p))).toBe("blocked_address");
  });
  it("accepts a host whose records are all public and returns one of them", async () => {
    const p = fakeDnsPolicy({ "ok.example": ["2606:4700::1", "8.8.4.4"] });
    expect(await resolveAllowed("ok.example", p)).toEqual({ address: "8.8.4.4", family: 4 });
  });
  it("maps a name that does not exist and empty answers to distinct DNS codes (WP13)", async () => {
    const p = fakeDnsPolicy({ empty: [] });
    expect(await code(resolveAllowed("missing", p))).toBe("dns_not_found"); // ENOTFOUND: permanent
    expect(await code(resolveAllowed("empty", p))).toBe("dns_failed"); // an empty answer is not "not found"
  });
});

describe("SafeFetcher connects only to the address it validated", () => {
  let server: Server;
  let port: number;
  const hits: { host: string | undefined; path: string | undefined }[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      hits.push({ host: req.headers.host, path: req.url });
      if (req.url === "/to-private") {
        res.writeHead(302, { location: "http://10.0.0.1/secret" });
        return res.end();
      }
      if (req.url === "/to-mapped") {
        res.writeHead(302, { location: "http://[::ffff:169.254.169.254]/" });
        return res.end();
      }
      if (req.url === "/to-rebind") {
        res.writeHead(302, { location: `http://rebind.test:${port}/after` });
        return res.end();
      }
      if (req.url === "/to-creds") {
        res.writeHead(302, { location: `http://u:p@ok.test:${port}/` });
        return res.end();
      }
      if (req.url === "/to-file") {
        res.writeHead(302, { location: "file:///etc/passwd" });
        return res.end();
      }
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("hello");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  /**
   * Stand-in for "public": 127.0.0.1 is allowed for this test only. The
   * resolver answers from a mutable table and counts calls, so the test can
   * change the answer between resolution and connect (DNS rebinding).
   */
  function rebindingPolicy(answers: Record<string, string[][]>): NetPolicy & { calls: Record<string, number> } {
    const prod = productionPolicy();
    const calls: Record<string, number> = {};
    return {
      calls,
      resolve: async (host) => {
        calls[host] = (calls[host] ?? 0) + 1;
        const seq = answers[host];
        if (!seq) throw Object.assign(new Error("nx"), { code: "ENOTFOUND" });
        const list = seq[Math.min(calls[host]! - 1, seq.length - 1)]!;
        return list.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }) as const);
      },
      isAddressAllowed: (a) => a === "127.0.0.1" || prod.isAddressAllowed(a),
      isPortAllowed: (p, proto) => p === port || prod.isPortAllowed(p, proto),
    };
  }
  const fetcherFor = (p: NetPolicy) =>
    new SafeFetcher(p, { userAgent: "AsmitaCrawler/0.1 (test)", connectTimeoutMs: 1000, headersTimeoutMs: 1000, bodyTimeoutMs: 1000, totalTimeoutMs: 2000, maxRedirects: 5 });
  const get = (f: SafeFetcher, url: string) => f.fetch(url, { kind: "html", maxBytes: 1024, accept: "*/*" });

  it("resolves once per connection and dials that address (Host header kept)", async () => {
    const policy = rebindingPolicy({ "ok.test": [["127.0.0.1"], ["10.0.0.1"]] });
    const f = fetcherFor(policy);
    const res = await get(f, `http://ok.test:${port}/a`);
    expect(res.body.toString()).toBe("hello");
    expect(hits.at(-1)).toEqual({ host: `ok.test:${port}`, path: "/a" });
    expect(policy.calls["ok.test"]).toBe(1);
    await f.close();
  });

  it("refuses when the name rebinds to a private address on the next resolution", async () => {
    // First connection: allowed. Fresh connection (new fetcher): the
    // resolver now answers 10.0.0.1 and the connect is refused, before any
    // socket to that address exists.
    const policy = rebindingPolicy({ "flip.test": [["127.0.0.1"], ["10.0.0.1"]] });
    const a = fetcherFor(policy);
    await get(a, `http://flip.test:${port}/1`);
    await a.close();
    const b = fetcherFor(policy);
    expect(await code(get(b, `http://flip.test:${port}/2`))).toBe("blocked_address");
    expect(policy.calls["flip.test"]).toBe(2);
    await b.close();
  });

  it("re-validates every redirect hop", async () => {
    const policy = rebindingPolicy({ "ok.test": [["127.0.0.1"]], "rebind.test": [["192.168.0.10"]] });
    const f = fetcherFor(policy);
    expect(await code(get(f, `http://ok.test:${port}/to-private`))).toBe("blocked_address");
    expect(await code(get(f, `http://ok.test:${port}/to-mapped`))).toBe("blocked_address");
    expect(await code(get(f, `http://ok.test:${port}/to-rebind`))).toBe("blocked_address");
    expect(await code(get(f, `http://ok.test:${port}/to-creds`))).toBe("url_credentials");
    expect(await code(get(f, `http://ok.test:${port}/to-file`))).toBe("blocked_scheme");
    expect(hits.some((h) => h.path === "/after" || h.path === "/secret")).toBe(false);
    await f.close();
  });

  it("refuses literal private IPs and disallowed ports without connecting", async () => {
    const f = fetcherFor(productionPolicy(async () => [{ address: "127.0.0.1", family: 4 }]));
    const before = hits.length;
    expect(await code(get(f, `http://127.0.0.1:${port}/`))).toBe("blocked_port");
    expect(await code(get(f, "http://127.0.0.1/"))).toBe("blocked_address");
    expect(await code(get(f, "http://anything.example/"))).toBe("blocked_address"); // resolves to loopback
    expect(hits.length).toBe(before);
    await f.close();
  });
});
