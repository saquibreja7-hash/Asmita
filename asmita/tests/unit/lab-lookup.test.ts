import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The E2 domain-lookup helper (docs/lab/charter.md): host from the URL,
// name servers from DNS, registrar from the operator-configured RDAP
// endpoint, and since WP114 the registrable domain from the Public Suffix
// List (tldts). Fetch is mocked throughout; invented hosts only
// (example.test).

import { extractRegistrar, lookupServiceUrl, registrableDomain } from "@/lib/lab/lab-lookup";

function rdapBody(registrar: string, padding = 0) {
  return JSON.stringify({
    objectClassName: "domain",
    handle: "42",
    ldhName: "service.example.test",
    entities: [
      {
        roles: ["registrar"],
        vcardArray: ["vcard", [["version", {}, "text", "4.0"], ["fn", {}, "text", registrar]]],
        entities: [],
      },
    ],
    ...(padding > 0 ? { remarks: [{ title: "x".repeat(padding) }] } : {}),
  });
}

function rdapResponse(registrar: string, padding = 0) {
  return new Response(rdapBody(registrar, padding), { status: 200, headers: { "content-type": "application/json" } });
}

const resolveNsStub = vi.fn(async () => ["ns1.dns.example.test", "ns2.dns.example.test"]);

beforeEach(() => {
  process.env.LAB_RDAP_BASE_URL = "https://rdap.example.test";
  vi.stubGlobal("fetch", vi.fn(async () => rdapResponse("Registrar House Ltd")));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.LAB_RDAP_BASE_URL;
});

describe("lookupServiceUrl", () => {
  it("suggests host, name servers and the registrar from RDAP", async () => {
    const result = await lookupServiceUrl("https://service.example.test/app", { resolveNs: resolveNsStub });
    expect(result).toEqual({
      ok: true,
      host: "service.example.test",
      nameServers: ["ns1.dns.example.test", "ns2.dns.example.test"],
      registrar: "Registrar House Ltd",
      rdapChecked: true,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to the registrable domain when RDAP misses the host", async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.endsWith("/domain/service.example.test")) return new Response("not found", { status: 404 });
      return rdapResponse("Registrar House Ltd");
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await lookupServiceUrl("https://service.example.test/app", { resolveNs: async () => [] });
    if (!result.ok) throw new Error("expected ok");
    expect(result.registrar).toBe("Registrar House Ltd");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null registrar and rdapChecked false when no RDAP base is configured", async () => {
    delete process.env.LAB_RDAP_BASE_URL;
    const result = await lookupServiceUrl("https://service.example.test", { resolveNs: async () => [] });
    expect(result).toMatchObject({ ok: true, host: "service.example.test", registrar: null, rdapChecked: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("never throws: a failed or oversized RDAP answer reads as no registrar", async () => {
    const rejecting = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", rejecting);
    const failed = await lookupServiceUrl("https://service.example.test", { resolveNs: async () => [] });
    expect(failed).toMatchObject({ ok: true, registrar: null });

    // A response over the 64KB cap is truncated, so its JSON never parses.
    const oversized = vi.fn(async () => rdapResponse("Registrar House Ltd", 70_000));
    vi.stubGlobal("fetch", oversized);
    const truncated = await lookupServiceUrl("https://service.example.test", { resolveNs: async () => [] });
    expect(truncated).toMatchObject({ ok: true, registrar: null });
  });

  it("refuses anything that is not a public http(s) address", async () => {
    for (const bad of ["javascript:alert(1)", "ftp://service.example.test", "http://localhost/app", "not a url"]) {
      expect(await lookupServiceUrl(bad)).toEqual({ ok: false, error: "invalid_url" });
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("extractRegistrar", () => {
  it("finds the registrar through nested entities", () => {
    const rdap = {
      entities: [
        { roles: ["registrant"], entities: [{ roles: ["registrar"], vcardArray: ["vcard", [["fn", {}, "text", "Deep Registrar SA"]]] }] },
      ],
    };
    expect(extractRegistrar(rdap)).toBe("Deep Registrar SA");
    expect(extractRegistrar({})).toBeNull();
  });
});

describe("registrableDomain (Public Suffix List, WP114)", () => {
  it("treats multi-label public suffixes correctly", () => {
    // .co.in is a public suffix: the registrable domain keeps both labels.
    expect(registrableDomain("example.co.in")).toBe("example.co.in");
    expect(registrableDomain("www.example.co.in")).toBe("example.co.in");
    expect(registrableDomain("www.example.co.uk")).toBe("example.co.uk");
  });

  it("strips subdomains down to the registrable domain", () => {
    expect(registrableDomain("a.b.example.com")).toBe("example.com");
    expect(registrableDomain("deep.tool.example.com")).toBe("example.com");
  });

  it("returns nothing for IP literals, bare suffixes and single labels", () => {
    expect(registrableDomain("192.168.5.1")).toBeNull();
    expect(registrableDomain("203.0.113.7")).toBeNull();
    expect(registrableDomain("2001:db8::1")).toBeNull();
    expect(registrableDomain("com")).toBeNull();
    expect(registrableDomain("co.in")).toBeNull();
    expect(registrableDomain("example")).toBeNull();
  });

  it("handles internationalised domain names and unknown TLDs", () => {
    // The IDN example from the Public Suffix List documentation.
    expect(registrableDomain("пример.рф")).toBe("пример.рф");
    // Punycode form of the same host.
    expect(registrableDomain("xn--e1afmkfd.xn--p1ai")).toBe("xn--e1afmkfd.xn--p1ai");
    // Unknown TLDs fall back to the PSL's implicit "*" rule, so invented
    // .test hosts still have a registrable domain.
    expect(registrableDomain("service.example.test")).toBe("example.test");
  });
});
