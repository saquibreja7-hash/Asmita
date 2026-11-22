import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INFRA_USER_AGENT, fetchLandingPage, scanService } from "@/lib/lab/infra/scanner";
import { infraTestHelpers } from "@/lib/lab/infra/network";

/*
 * WP114 (research-tools-spec.md): the scanner's hard safety limits, all
 * exercised with a mocked fetch and invented example.test hosts. Nothing
 * here touches the network, and every request the scanner makes is
 * asserted against the list it is allowed to touch: the service's own
 * landing page and its redirects — never an image, a stylesheet, a link
 * target or a form action.
 */

beforeEach(() => {
  infraTestHelpers.resetRdapBootstrapForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function htmlResponse(body: string, status = 200, headers: Record<string, string> = {}) {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", ...headers } });
}

describe("fetchLandingPage safety limits", () => {
  it("fetches the page, records the redirect chain and sends the lab user agent", async () => {
    const requested: { url: string; headers: Record<string, string> }[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requested.push({ url: String(input), headers: init?.headers as Record<string, string> });
      const url = String(input);
      if (url === "https://start.example.test/") {
        return new Response(null, { status: 301, headers: { location: "https://hop.example.test/x" } });
      }
      if (url === "https://hop.example.test/x") {
        return htmlResponse("<html><body>Final invented page</body></html>", 200, { "cf-ray": "abc-DEL" });
      }
      throw new Error("unexpected url");
    });
    const result = await fetchLandingPage("https://start.example.test/", { fetchImpl });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.finalUrl).toBe("https://hop.example.test/x");
    expect(result.redirectChain).toEqual(["https://hop.example.test/x"]);
    expect(result.httpStatus).toBe(200);
    expect(result.html).toContain("invented page");
    expect(requested).toHaveLength(2);
    expect(requested[0]!.headers["user-agent"]).toBe(INFRA_USER_AGENT);
    expect(requested[0]!.headers.cookie).toBeUndefined();
    expect(INFRA_USER_AGENT).toBe("AsmitaLab/1.0 (+research; contact on /lab)");
  });

  it("follows at most three redirects and then stops with an error", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input)).searchParams.get("hop") ?? "0";
      const next = Number(url) + 1;
      return new Response(null, { status: 302, headers: { location: `https://loop.example.test/?hop=${next}` } });
    });
    const result = await fetchLandingPage("https://loop.example.test/", { fetchImpl });
    expect(result).toMatchObject({ ok: false, error: "too_many_redirects" });
    expect(fetchImpl).toHaveBeenCalledTimes(4); // initial + 3 redirects
  });

  it("refuses a private, loopback or link-local target before any fetch", async () => {
    const fetchImpl = vi.fn();
    for (const bad of ["http://127.0.0.1:3000/", "http://10.0.0.5/", "http://192.168.1.4/", "http://[::1]/", "http://localhost/app"]) {
      const result = await fetchLandingPage(bad, { fetchImpl });
      expect(result).toMatchObject({ ok: false, error: "private_host_refused" });
    }
    // A redirect to a private host is refused too, and never fetched.
    const fetchRedirect = vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://169.254.1.1/" } }));
    const redirected = await fetchLandingPage("https://public.example.test/", { fetchImpl: fetchRedirect });
    expect(redirected).toMatchObject({ ok: false, error: "private_host_refused" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses non-http schemes and malformed URLs", async () => {
    expect(await fetchLandingPage("ftp://example.test/")).toMatchObject({ ok: false, error: "invalid_url" });
    expect(await fetchLandingPage("not a url")).toMatchObject({ ok: false, error: "invalid_url" });
  });

  it("stops without reading the body when the content type is not HTML", async () => {
    const fetchImpl = vi.fn(async () => new Response("binary-ish invented bytes", { status: 200, headers: { "content-type": "image/png" } }));
    const result = await fetchLandingPage("https://media.example.test/pic.png", { fetchImpl });
    expect(result).toMatchObject({ ok: false, error: "content_type_not_html" });
  });

  it("reads at most 1 MB of HTML", async () => {
    const body = "a".repeat(2 * 1024 * 1024);
    const fetchImpl = vi.fn(async () => htmlResponse(body));
    const result = await fetchLandingPage("https://big.example.test/", { fetchImpl });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.html.length).toBeLessThanOrEqual(1024 * 1024);
  });

  it("times out when the server never answers", async () => {
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    });
    const result = await fetchLandingPage("https://hang.example.test/", { fetchImpl, fetchTimeoutMs: 50 });
    expect(result).toMatchObject({ ok: false, error: "fetch_failed" });
  });
});

describe("scanService", () => {
  it("never requests anything the page references: only the landing page is fetched", async () => {
    const page = htmlOf(
      `<script src="https://cdn.example.test/tracker.js"></script>` +
        `<img src="https://images.example.test/banner.jpg">` +
        `<a href="https://t.me/example_bot">Bot</a>` +
        `<form action="https://form.example.test/subscribe"><input name="email"></form>`,
    );
    const fetchImpl = vi.fn(async () => new Response(page, { status: 200, headers: { "content-type": "text/html" } }));
    const result = await scanService(["https://tool.example.test/"], {
      fetchImpl,
      resolve4: async () => [],
      resolve6: async () => [],
      resolveNs: async () => [],
      resolveMx: async () => [],
    });
    const requestedUrls = (fetchImpl.mock.calls as unknown[][]).map((call) => String(call[0]));
    // The landing page is fetched, and nothing it references: the page's
    // scripts, images, bots and forms are never requested. (RDAP and CT
    // registry lookups may follow, on their own public endpoints.)
    expect(requestedUrls[0]).toBe("https://tool.example.test/");
    for (const referenced of ["cdn.example.test", "images.example.test", "form.example.test", "t.me"]) {
      expect(requestedUrls.join(" ")).not.toContain(referenced);
    }
    expect(result.scans).toEqual([
      { url: "https://tool.example.test/", finalUrl: "https://tool.example.test/", httpStatus: 200, error: null },
    ]);
    // The page's findings survive; the HTML does not.
    expect(result.findings.find((f) => f.category === "TELEGRAM_LINK")).toBeDefined();
  });

  it("gathers page, header, DNS, RDAP and CT findings for one service", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://tool.example.test/") {
        return htmlResponse(
          `<script src="https://js.stripe.com/v3/"></script>`,
          200,
          { "cf-ray": "230b030023ae2822-SJC" },
        );
      }
      if (url.startsWith("https://data.iana.org/rdap/dns.json")) {
        return jsonResponse({ services: [[["test"], ["https://rdap.example.test"]]] });
      }
      if (url.startsWith("https://data.iana.org/rdap/ipv4.json")) {
        return jsonResponse({ services: [[["203.0.113.0/24"], ["https://rdap.example.test"]]] });
      }
      if (url.startsWith("https://rdap.example.test/domain/")) {
        return jsonResponse({
          objectClassName: "domain",
          entities: [{ roles: ["registrar"], vcardArray: ["vcard", [["version", {}, "text", "4.0"], ["fn", {}, "text", "Example Registrar Ltd"]]] }],
        });
      }
      if (url.startsWith("https://rdap.example.test/ip/")) {
        return jsonResponse({
          objectClassName: "ip network",
          name: "EXAMPLE-CLOUD-24",
          remarks: [{ description: ["Route origin AS64512 announced by Example Cloud"] }],
        });
      }
      if (url.startsWith("https://crt.sh/")) {
        return jsonResponse([
          { issuer_name: "CN=Example CA R3, O=Example Ltd", name_value: "tool.example.test\nother.example.net" },
          { issuer_name: "CN=Example CA R3, O=Example Ltd", name_value: "tool.example.test" },
        ]);
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    const result = await scanService(["https://tool.example.test/"], {
      fetchImpl,
      resolve4: async () => ["203.0.113.7"],
      resolve6: async () => [],
      resolveNs: async () => ["ns1.dns.example.host", "ns2.dns.example.host"],
      resolveMx: async () => [{ exchange: "mx1.mail.example.host", priority: 10 }],
    });

    const summary = result.findings.map((f) => `${f.category}:${f.value}`);
    expect(summary).toContain("PAYMENT:js.stripe.com");
    expect(summary).toContain("CDN:Cloudflare");
    expect(summary).toContain("HOSTING_ASN:203.0.113.7");
    expect(result.findings.find((f) => f.category === "HOSTING_ASN")!.evidence).toContain("AS64512");
    expect(summary).toContain("NAMESERVER:ns1.dns.example.host,ns2.dns.example.host");
    expect(summary).toContain("MAIL:mx1.mail.example.host");
    expect(summary).toContain("REGISTRAR:Example Registrar Ltd");
    expect(summary).toContain("TLS_ISSUER:Example CA R3");
    // A SAN that is another registrable domain becomes a clustering
    // candidate, stored as its registrable form.
    expect(summary).toContain("TLS_ISSUER:example.net");
    for (const category of ["PAYMENT", "CDN", "HOSTING_ASN", "NAMESERVER", "MAIL", "REGISTRAR", "TLS_ISSUER"]) {
      expect(result.checkedCategories.has(category)).toBe(true);
    }
  });

  it("records scan errors and checks nothing when the page cannot be fetched", async () => {
    const fetchImpl = vi.fn(async () => new Response("missing", { status: 404, headers: { "content-type": "text/plain" } }));
    const result = await scanService(["https://down.example.test/"], { fetchImpl });
    expect(result.scans[0]!.error).toBe(null); // a 404 text page is still a page
    const failing = await scanService(["https://gone.example.test/"], {
      fetchImpl: vi.fn(async () => {
        throw new Error("unreachable");
      }),
    });
    expect(failing.scans[0]).toMatchObject({ error: "fetch_failed", httpStatus: null });
    expect(failing.findings).toEqual([]);
    expect(failing.checkedCategories.size).toBe(0);
  });
});

function htmlOf(body: string): string {
  return `<!doctype html><html><body>${body}</body></html>`;
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
}
