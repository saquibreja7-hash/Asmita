import { describe, expect, it } from "vitest";
import {
  FETCH_METADATA_EXEMPT_ROUTES,
  crossSiteApiRequestRefusal,
  isFetchMetadataExempt,
} from "@/lib/fetch-metadata";

// Synthetic host only; no real survivor or platform data.
const ORIGIN = "https://asmita.test";

function apiRequest(path: string, init: RequestInit = {}) {
  return new Request(`${ORIGIN}${path}`, init);
}

function crossSite(path: string, method = "POST") {
  return apiRequest(path, { method, headers: { "sec-fetch-site": "cross-site" } });
}

describe("Fetch Metadata guard", () => {
  it("refuses a cross-site state-changing request to /api with 403", async () => {
    const refusal = crossSiteApiRequestRefusal(crossSite("/api/feedback"));
    expect(refusal).not.toBeNull();
    expect(refusal!.status).toBe(403);
    expect(refusal!.headers.get("content-type")).toBe("application/json");
    expect(await refusal!.json()).toEqual({ error: "cross_site_blocked" });
  });

  it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])("refuses cross-site %s", (method) => {
    expect(crossSiteApiRequestRefusal(crossSite("/api/chat", method))).not.toBeNull();
  });

  it.each(["GET", "HEAD"])("lets a cross-site %s through to the route's own checks", (method) => {
    expect(crossSiteApiRequestRefusal(crossSite("/api/cases/create", method))).toBeNull();
  });

  it.each(["same-origin", "same-site", "none"])(
    "lets a %s request through to the route's own checks",
    (site) => {
      const request = apiRequest("/api/auth/verify-otp", {
        method: "POST",
        headers: { "sec-fetch-site": site },
      });
      expect(crossSiteApiRequestRefusal(request)).toBeNull();
    },
  );

  it("falls through when the header is absent (old browsers, server-to-server)", () => {
    expect(crossSiteApiRequestRefusal(apiRequest("/api/feedback", { method: "POST" }))).toBeNull();
  });

  it("only guards /api paths", () => {
    expect(crossSiteApiRequestRefusal(crossSite("/submit"))).toBeNull();
    expect(crossSiteApiRequestRefusal(crossSite("/api"))).not.toBeNull();
  });

  it("lists every signature, bearer or secret route in one place", () => {
    expect(FETCH_METADATA_EXEMPT_ROUTES).toContain("/api/webhooks/resend");
    for (const route of [
      "/api/crawler/pool",
      "/api/crawler/sources",
      "/api/crawler/discoveries",
      "/api/crawler/findings",
      "/api/crawler/embeddings",
      "/api/crawler/frontier/claim",
      "/api/crawler/frontier/report",
    ]) {
      expect(FETCH_METADATA_EXEMPT_ROUTES).toContain(route);
    }
    expect(FETCH_METADATA_EXEMPT_ROUTES).toContain("/api/ngo/vouch/");
    for (const route of [
      "/api/cron/maintenance",
      "/api/cron/purge-expired-urls",
      "/api/cron/sweep-due-jobs",
    ]) {
      expect(FETCH_METADATA_EXEMPT_ROUTES).toContain(route);
    }
    expect(FETCH_METADATA_EXEMPT_ROUTES).toContain("/api/csp-report");
  });

  it("lets a cross-site request through on every exempt route", () => {
    for (const route of FETCH_METADATA_EXEMPT_ROUTES) {
      // The NGO route carries the case id as a path segment.
      const path = route.endsWith("/") ? `${route}case-1` : route;
      expect(isFetchMetadataExempt(path)).toBe(true);
      expect(crossSiteApiRequestRefusal(crossSite(path))).toBeNull();
    }
  });

  it("refuses near-misses of the exempt routes", () => {
    expect(isFetchMetadataExempt("/api/crawler/findingsX")).toBe(false);
    expect(crossSiteApiRequestRefusal(crossSite("/api/crawler/findingsX"))).not.toBeNull();
    // Admin crawler routes are cookie-authenticated and stay guarded.
    expect(crossSiteApiRequestRefusal(crossSite("/api/admin/crawler/stats"))).not.toBeNull();
    expect(crossSiteApiRequestRefusal(crossSite("/api/admin/crawl-sources"))).not.toBeNull();
  });
});
