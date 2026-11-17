import { describe, expect, it } from "vitest";

// The built-in never-crawl list (full-crawler spec WP1): hosts the automatic
// paths must never turn into crawl sources. A host matches if it equals an
// entry or is a subdomain of one; "*.gov.*" and "*.nic.in" are patterns.
// Placeholder hosts only.

import { hostAndParents, isNeverCrawlHost, NEVER_CRAWL_HOSTS, normalizeNeverCrawlHost } from "@/lib/crawl-never";

describe("isNeverCrawlHost", () => {
  it.each([
    ["facebook.com", "a major social platform"],
    ["m.facebook.com", "a subdomain of one"],
    ["www.instagram.com", "a www subdomain"],
    ["x.com", "a short social domain"],
    ["www.google.com", "a search engine"],
    ["duckduckgo.com", "another search engine"],
    ["apps.apple.com", "an app store"],
    ["gmail.com", "webmail"],
    ["outlook.office365.com", "corporate webmail host"],
    ["paypal.com", "a payment site"],
    ["razorpay.com", "an Indian payment site"],
    ["hdfcbank.com", "a bank"],
    ["india.gov.in", "an Indian government site"],
    ["mohua.gov.in", "a government subdomain"],
    ["foo.gov", "a bare two-label .gov host"],
    ["portal.gov.uk", "a foreign government site"],
    ["example.gov.br", "any government under any TLD"],
    ["gov.example.com", "any label 'gov', fail-safe: such a host is never a real source"],
    ["kvp.nic.in", "an NIC host"],
    ["www.kvp.nic.in", "an NIC subdomain"],
    ["reuters.com", "a news wire"],
    ["apnews.com", "another news wire"],
    ["ptinews.com", "an Indian news wire"],
    ["meriasmita.org", "Asmita's own domain"],
    ["www.meriasmita.org", "Asmita's own www subdomain"],
  ])("%s is never crawled (%s)", (host) => {
    expect(isNeverCrawlHost(host)).toBe(true);
  });

  it.each([
    ["forum.example.com", "an ordinary forum"],
    ["facebook.example.com", "a lookalike on another domain"],
    ["reuters.example.org", "a wire name on another domain"],
    ["government.example.com", "a word containing gov"],
    ["nic.in.example.org", "nic.in inside another domain"],
    ["example.com", "a plain site"],
    ["cdn.example.net", "a CDN host"],
  ])("%s is not on the list (%s)", (host) => {
    expect(isNeverCrawlHost(host)).toBe(false);
  });

  it("ignores case, whitespace and a trailing dot", () => {
    expect(isNeverCrawlHost("Facebook.COM")).toBe(true);
    expect(isNeverCrawlHost("  Instagram.com. ")).toBe(true);
    expect(normalizeNeverCrawlHost("  WWW.Cats.Example.COM. ")).toBe("cats.example.com");
  });

  it("matches every entry as itself or a subdomain", () => {
    for (const entry of NEVER_CRAWL_HOSTS) {
      if (entry.startsWith("*.")) continue;
      expect(isNeverCrawlHost(entry), entry).toBe(true);
      expect(isNeverCrawlHost(`deep.forum.${entry}`), entry).toBe(true);
    }
  });

  it("an empty or single-label host never matches anything", () => {
    expect(isNeverCrawlHost("")).toBe(false);
    expect(isNeverCrawlHost("gov")).toBe(false);
    expect(isNeverCrawlHost("localhost")).toBe(false);
  });
});

describe("hostAndParents", () => {
  it("lists the host and every parent domain", () => {
    expect(hostAndParents("deep.forum.example.com")).toEqual([
      "deep.forum.example.com",
      "forum.example.com",
      "example.com",
      "com",
    ]);
  });

  it("is normalised first", () => {
    expect(hostAndParents("WWW.Cats.Example.COM.")).toEqual(["cats.example.com", "example.com", "com"]);
  });

  it("covers every parent a CrawlBlockedHost row could block, so one indexed lookup per name answers subdomains", () => {
    const candidates = new Set(hostAndParents("a.b.forum.example.org"));
    expect(candidates.has("forum.example.org")).toBe(true);
    expect(candidates.has("example.org")).toBe(true);
    expect(candidates.has("org")).toBe(true);
  });
});
