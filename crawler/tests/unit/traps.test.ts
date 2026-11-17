/**
 * Crawler v2 WP4 trap rules: obvious non-content URLs (login, cart, search,
 * calendar) are never reported, and the per-path query-variant cap bounds
 * query-string traps while pagination (?page=N) and tracking parameters do
 * not count as variants.
 */
import { describe, expect, it } from "vitest";
import { isNonContentUrl, QueryVariantGuard } from "../../src/crawl/traps.ts";

const u = (s: string) => new URL(s);

describe("isNonContentUrl", () => {
  it("skips login, cart, search and calendar paths", () => {
    const skipped = [
      "https://x.example/login",
      "https://x.example/log-in",
      "https://x.example/signin",
      "https://x.example/sign-in",
      "https://x.example/wp-login.php",
      "https://x.example/wp-login.php?action=login",
      "https://x.example/account/login",
      "https://x.example/cart",
      "https://x.example/checkout",
      "https://x.example/basket",
      "https://x.example/en/cart",
      "https://x.example/search",
      "https://x.example/search?q=photos",
      "https://x.example/search-results/pretty",
      "https://x.example/find",
      "https://x.example/calendar",
      "https://x.example/calendar/2026-01-01",
      "https://x.example/events?date=2026-01-01",
      "https://x.example/archives?m=202611",
      "https://x.example/archives?m=20261117",
      "https://x.example/2026/11",
      "https://x.example/2026/11/17",
      "https://x.example/2026/11/17/a-post",
      "https://x.example/2026-11-17",
      "https://x.example/shop?add-to-cart=5",
    ];
    for (const s of skipped) expect(isNonContentUrl(u(s)), s).toBe(true);
  });

  it("keeps content paths, including pagination and date-free ids", () => {
    const kept = [
      "https://x.example/",
      "https://x.example/listing?page=30",
      "https://x.example/listing?paged=2&sort=new",
      "https://x.example/blog/login-tips", // not a login segment
      "https://x.example/products?id=407",
      "https://x.example/2026-report", // year segment not followed by a month
      "https://x.example/2026/report", // same
      "https://x.example/p/20261117", // 8-digit id, not a query archive
      "https://x.example/posts?m=5", // ?m= with a non-archive value
      "https://x.example/calendar-of-events", // one segment, not "calendar"
    ];
    for (const s of kept) expect(isNonContentUrl(u(s)), s).toBe(false);
  });
});

describe("QueryVariantGuard", () => {
  const url = (path: string) => u(`https://x.example${path}`);

  it("admits the first N distinct variants of a path, then refuses new ones", () => {
    const g = new QueryVariantGuard(3, 100);
    expect(g.admit(url("/p?a=1"))).toBe(true);
    expect(g.admit(url("/p?a=2"))).toBe(true);
    expect(g.admit(url("/p?a=3"))).toBe(true);
    expect(g.admit(url("/p?a=4"))).toBe(false);
    expect(g.admit(url("/p?a=2"))).toBe(true); // seen variants stay admitted
    expect(g.admit(url("/q?a=1"))).toBe(true); // another path starts fresh
  });

  it("treats the query as unordered and ignores tracking parameters", () => {
    const g = new QueryVariantGuard(1, 100);
    expect(g.admit(url("/p?a=1&b=2"))).toBe(true);
    expect(g.admit(url("/p?b=2&a=1"))).toBe(true); // same variant, sorted
    expect(g.admit(url("/p?a=1&b=3"))).toBe(false);
    expect(g.admit(url("/p?utm_source=x"))).toBe(true); // no variant at all
    expect(g.admit(url("/p?utm_campaign=y"))).toBe(true);
  });

  it("does not count page-number parameters as variants (pagination is not a trap)", () => {
    const g = new QueryVariantGuard(1, 100);
    for (let n = 1; n <= 50; n++) expect(g.admit(url(`/listing?page=${n}`))).toBe(true);
    for (let n = 1; n <= 50; n++) expect(g.admit(url(`/listing?paged=${n}&utm_source=share`))).toBe(true);
    expect(g.admit(url("/listing?start=99&offset=0"))).toBe(true);
    expect(g.admit(url("/listing?session=abc"))).toBe(true); // the one real variant allowed
    expect(g.admit(url("/listing?session=def"))).toBe(false); // cap of 1 reached
  });

  it("bounds its state: refuses untracked paths once the path map is full", () => {
    const g = new QueryVariantGuard(5, 2);
    expect(g.admit(url("/p1?x=1"))).toBe(true);
    expect(g.admit(url("/p2?x=1"))).toBe(true);
    expect(g.admit(url("/p3?x=1"))).toBe(false); // map full
    expect(g.admit(url("/p1?x=2"))).toBe(true); // tracked path still works
  });

  it("counts paths per host", () => {
    const g = new QueryVariantGuard(1, 100);
    expect(g.admit(u("https://a.example/p?x=1"))).toBe(true);
    expect(g.admit(u("https://b.example/p?x=1"))).toBe(true);
    expect(g.admit(u("https://a.example/p?x=2"))).toBe(false);
  });

  it("admits query-less URLs without consuming variant slots", () => {
    const g = new QueryVariantGuard(1, 100);
    for (let i = 0; i < 100; i++) expect(g.admit(url(`/plain-${i}`))).toBe(true);
    expect(g.admit(url("/p?x=1"))).toBe(true);
  });
});
