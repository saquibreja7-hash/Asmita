import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCsp } from "./src/lib/csp";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const isProd = process.env.NODE_ENV === "production";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
  { key: "Content-Security-Policy", value: buildCsp() },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  turbopack: {
    root: projectRoot,
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // Authenticated HTML pages (web audit WP41, S2) never go into any
      // cache — not the browser's HTTP cache, not a proxy's, and with
      // no-store not the back/forward cache either: a shared phone must not
      // get the previous person's page back after sign-out or Quick Exit.
      // These rules sit after the catch-all so they win the Cache-Control
      // key; vinext applies them on the Worker too (worker-smoke asserts
      // it on /submit). Victim pages also reload on a bfcache restore
      // (QuickExit's pageshow listener).
      ...[
        { source: "/case/:path*" },
        { source: "/my-cases" },
        { source: "/review-sign" },
        { source: "/submit" },
        { source: "/track" },
        { source: "/admin/:path*" },
      ].map((source) => ({ ...source, headers: [{ key: "Cache-Control", value: "no-store" }] })),
      // In production the Worker entry replaces this on pages with a nonce
      // policy (src/lib/csp.ts).
      // Browser voice calls with the helpline: the microphone and Sarvam's
      // WebSocket are allowed on this page only.
      {
        source: "/talk",
        headers: [
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
          { key: "Content-Security-Policy", value: buildCsp({ voice: true }) },
        ],
      },
      // On-device Content Credentials reading (WP38): the page that runs the
      // C2PA engine needs WebAssembly compilation of our own first-party
      // engine, and the /c2pa/* asset responses carry the policy the
      // engine's worker inherits. /check-image is entered by a full page
      // load, so this policy is always in force when the engine runs.
      {
        source: "/check-image",
        headers: [{ key: "Content-Security-Policy", value: buildCsp({ c2pa: true }) }],
      },
      {
        source: "/c2pa/:path*",
        headers: [{ key: "Content-Security-Policy", value: buildCsp({ c2pa: true }) }],
      },
      // PDF previews are served into iframes on the sign pages — relax framing
      // headers for these routes only. All other security headers still apply.
      {
        source: "/api/cases/:caseId/preview-notice",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: buildCsp({ frameAncestors: "'self'" }) },
        ],
      },
      {
        source: "/api/cases/:caseId/preview-hash-advisory",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: buildCsp({ frameAncestors: "'self'" }) },
        ],
      },
    ];
  },
};

export default nextConfig;
