import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ctCertificates,
  extractRegistrar,
  infraTestHelpers,
  parseIp,
  rdapIpNetwork,
  rdapRegistrar,
  resolveIps,
  resolveMxHosts,
  resolveNsSet,
} from "@/lib/lab/infra/network";

/*
 * WP114 (research-tools-spec.md): the RDAP bootstrap, registrar, ASN and
 * Certificate Transparency parsing, all from recorded synthetic JSON
 * fixtures on invented hosts. Nothing here touches the network; fetch is
 * always the fixture server below.
 */

beforeEach(() => {
  infraTestHelpers.resetRdapBootstrapForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

/** A fixture fetch that answers from a table and records every request. */
function fixtureServer(responses: { pattern: RegExp; respond: (url: string) => Response | null }[]) {
  const requested: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    requested.push(url);
    for (const { pattern, respond } of responses) {
      if (pattern.test(url)) {
        const response = respond(url);
        if (response) return response;
      }
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, requested };
}

const DNS_BOOTSTRAP = jsonResponse({
  description: "RDAP bootstrap file for Domain Name System registrations",
  publication: "2026-11-19T00:00:03Z",
  services: [
    [["in"], ["https://rdap.in.example.test/v1"]],
    [["test"], ["https://rdap.example.test"]],
    [["com", "net"], ["https://rdap.tld.example.test/v1"]],
  ],
  version: "1.0",
});

const IPV4_BOOTSTRAP = jsonResponse({
  description: "RDAP bootstrap file for IPv4 address allocations",
  services: [
    [["203.0.113.0/24", "198.51.100.0/24"], ["https://rdap.example.test"]],
    [["192.0.2.0/24"], ["https://rdap.other.example.test"]],
  ],
  version: "1.0",
});

describe("parseIp", () => {
  it("packs IPv4 and IPv6 literals into 32-bit words", () => {
    expect(parseIp("203.0.113.7")).toEqual([(203 << 8) | 0, (113 << 8) | 7]);
    expect(parseIp("::1")).toEqual([0, 0, 0, 1]);
    expect(parseIp("2001:db8::1")).toEqual([0x20010db8, 0, 0, 1]);
    expect(parseIp("[2001:db8::5]")).toEqual([0x20010db8, 0, 0, 5]);
    expect(parseIp("not-an-ip")).toBeNull();
    expect(parseIp("1.2.3")).toBeNull();
  });
});

describe("rdapRegistrar via the IANA bootstrap", () => {
  it("routes the TLD through dns.json and reads a nested registrar", async () => {
    const { fetchImpl, requested } = fixtureServer([
      { pattern: /rdap\/dns\.json/, respond: () => DNS_BOOTSTRAP },
      {
        pattern: /rdap\.example\.test\/domain\/tool\.example\.test/,
        respond: () => jsonResponse({ objectClassName: "domain", ldhName: "example.test" }),
      },
      {
        pattern: /rdap\.example\.test\/domain\/example\.test/,
        respond: () =>
          jsonResponse({
            objectClassName: "domain",
            ldhName: "example.test",
            entities: [
              {
                roles: ["registrant"],
                entities: [
                  {
                    roles: ["registrar"],
                    vcardArray: ["vcard", [["version", {}, "text", "4.0"], ["fn", {}, "text", "Example Registrar SA"]]],
                  },
                ],
              },
            ],
          }),
      },
    ]);
    // A host below its registrable domain falls back to the registrable
    // domain, exactly like the lookup helper does.
    const registrar = await rdapRegistrar("tool.example.test", { fetchImpl });
    expect(registrar).toBe("Example Registrar SA");
    expect(requested.join(" ")).toContain("https://data.iana.org/rdap/dns.json");
    expect(requested.join(" ")).toContain("/domain/tool.example.test");
    expect(requested.join(" ")).toContain("/domain/example.test");
  });

  it("returns null when nothing is configured or the answer is not JSON", async () => {
    const failing = fixtureServer([{ pattern: /dns\.json/, respond: () => new Response("nope", { status: 500 }) }]);
    expect(await rdapRegistrar("thing.example.test", { fetchImpl: failing.fetchImpl })).toBeNull();
    const throwing = fixtureServer([{ pattern: /dns\.json/, respond: () => { throw new Error("network down"); } }]);
    expect(await rdapRegistrar("thing.example.test", { fetchImpl: throwing.fetchImpl })).toBeNull();
  });

  it("honours LAB_RDAP_BASE_URL as an operator override of the bootstrap", async () => {
    process.env.LAB_RDAP_BASE_URL = "https://rdap.override.example.test/v1/";
    try {
      const { fetchImpl, requested } = fixtureServer([
        {
          pattern: /rdap\.override\.example\.test\/v1\/domain\/example\.test/,
          respond: () =>
            jsonResponse({
              entities: [{ roles: ["registrar"], vcardArray: ["vcard", [["fn", {}, "text", "Override Registrar BV"]]] }],
            }),
        },
      ]);
      const registrar = await rdapRegistrar("tool.example.test", { fetchImpl });
      expect(registrar).toBe("Override Registrar BV");
      expect(requested.join(" ")).not.toContain("data.iana.org");
      expect(requested.join(" ")).toContain("https://rdap.override.example.test/v1/domain/tool.example.test");
    } finally {
      delete process.env.LAB_RDAP_BASE_URL;
    }
  });
});

describe("extractRegistrar", () => {
  it("finds the registrar through nested entities and ignores other roles", () => {
    const rdap = {
      entities: [
        { roles: ["registrant"], vcardArray: ["vcard", [["fn", {}, "text", "Wrong Name"]]] },
        { roles: ["privacy"], entities: [{ roles: ["registrar"], vcardArray: ["vcard", [["fn", {}, "text", "Deep Registrar Ltd"]]] }] },
      ],
    };
    expect(extractRegistrar(rdap)).toBe("Deep Registrar Ltd");
    expect(extractRegistrar({})).toBeNull();
    expect(extractRegistrar({ entities: [{ roles: ["billing"] }] })).toBeNull();
  });
});

describe("rdapIpNetwork", () => {
  it("routes the IP through the ipv4 bootstrap and reads name and origin AS", async () => {
    const { fetchImpl, requested } = fixtureServer([
      { pattern: /rdap\/ipv4\.json/, respond: () => IPV4_BOOTSTRAP },
      {
        pattern: /rdap\.example\.test\/ip\/203\.0\.113\.7/,
        respond: () =>
          jsonResponse({
            objectClassName: "ip network",
            handle: "203.0.113.0 - 203.0.113.255",
            name: "EXAMPLE-CLOUD-24",
            startAddress: "203.0.113.0",
            endAddress: "203.0.113.255",
            remarks: [{ title: "description", description: ["Route origin AS64512 announced by Example Cloud"] }],
          }),
      },
      {
        pattern: /rdap\.other\.example\.test\/ip\/192\.0\.2\.9/,
        respond: () => jsonResponse({ objectClassName: "ip network", name: "OTHER-NET-24", remarks: [] }),
      },
    ]);
    const withAsn = await rdapIpNetwork("203.0.113.7", { fetchImpl });
    expect(withAsn).toEqual({ asn: "AS64512", networkName: "EXAMPLE-CLOUD-24" });
    const withoutAsn = await rdapIpNetwork("192.0.2.9", { fetchImpl });
    expect(withoutAsn).toEqual({ asn: null, networkName: "OTHER-NET-24" });
    expect(requested.join(" ")).toContain("https://data.iana.org/rdap/ipv4.json");
    // An address outside every bootstrap range has no RDAP base.
    expect(await rdapIpNetwork("198.51.100.4", { fetchImpl })).toBeNull();
  });
});

describe("ctCertificates", () => {
  it("parses issuer common names and multiline SANs, capped at 200 entries", async () => {
    const rows = Array.from({ length: 250 }, (_, i) => ({
      issuer_name: "CN=Example CA R3, O=Example Ltd",
      name_value: i < 200 ? `host${i}.tool.example.test` : `late${i}.tool.example.test`,
    }));
    const { fetchImpl, requested } = fixtureServer([
      { pattern: /crt\.sh/, respond: () => jsonResponse(rows) },
    ]);
    const result = await ctCertificates("tool.example.test", { fetchImpl });
    expect(result!.issuers).toEqual(["Example CA R3"]);
    expect(result!.sans.length).toBe(200);
    expect(result!.sans).toContain("host199.tool.example.test");
    expect(result!.sans).not.toContain("late240.tool.example.test");
    // The query always uses the registrable domain of what was scanned.
    expect(requested[0]).toContain("https://crt.sh/?q=example.test&output=json");
  });

  it("returns null for a non-JSON or failed answer", async () => {
    const failing = fixtureServer([{ pattern: /crt\.sh/, respond: () => new Response("busy", { status: 503 }) }]);
    expect(await ctCertificates("tool.example.test", { fetchImpl: failing.fetchImpl })).toBeNull();
    const notJson = fixtureServer([{ pattern: /crt\.sh/, respond: () => jsonResponse("not-an-array") }]);
    expect(await ctCertificates("tool.example.test", { fetchImpl: notJson.fetchImpl })).toBeNull();
  });
});

describe("DNS resolution helpers", () => {
  it("resolves the registrable domain for NS and MX, never the subdomain", async () => {
    const ns = vi.fn(async (host: string) => {
      expect(host).toBe("example.test");
      return ["NS1.DNS.EXAMPLE.HOST.", "ns2.dns.example.host."];
    });
    const mx = vi.fn(async (host: string) => {
      expect(host).toBe("example.test");
      return [{ exchange: "mx1.MAIL.EXAMPLE.HOST.", priority: 10 }, { exchange: "mx1.mail.example.host.", priority: 20 }];
    });
    expect(await resolveNsSet("tool.example.test", { resolveNs: ns })).toEqual([
      "ns1.dns.example.host",
      "ns2.dns.example.host",
    ]);
    expect(await resolveMxHosts("tool.example.test", { resolveMx: mx })).toEqual(["mx1.mail.example.host"]);
    const ips = await resolveIps("tool.example.test", {
      resolve4: async () => ["203.0.113.7", "203.0.113.7"],
      resolve6: async () => ["2001:db8::1"],
    });
    expect(ips).toEqual(["203.0.113.7", "2001:db8::1"]);
  });

  it("returns empty when the resolver fails", async () => {
    expect(await resolveIps("down.example.test", { resolve4: async () => { throw new Error("NXDOMAIN"); }, resolve6: async () => [] })).toEqual([]);
    expect(await resolveNsSet("down.example.test", { resolveNs: async () => { throw new Error("NXDOMAIN"); } })).toEqual([]);
    expect(await resolveMxHosts("down.example.test", { resolveMx: async () => { throw new Error("NXDOMAIN"); } })).toEqual([]);
  });
});
