import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCsp,
  CSP_REPORTING_ENDPOINTS,
  TRUSTED_TYPES_REPORT_ONLY,
} from "./src/lib/csp";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const isProd = process.env.NODE_ENV === "production";

// Permissions-Policy (S7): the camera, microphone and geolocation rules and
// the /talk microphone=(self) override are unchanged; the rest of the list
// denies features the site never uses.
const deniedPermissions = [
  "payment=()",
  "usb=()",
  "serial=()",
  "bluetooth=()",
  "accelerometer=()",
  "gyroscope=()",
  "magnetometer=()",
  "display-capture=()",
  "browsing-topics=()",
].join(", ");
const permissionsPolicy = `camera=(), microphone=(), geolocation=(), ${deniedPermissions}`;
const talkPermissionsPolicy = `camera=(), microphone=(self), geolocation=(), ${deniedPermissions}`;

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: permissionsPolicy },
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
  { key: "Content-Security-Policy", value: buildCsp() },
  // CSP violation reporting (S5): the Content-Security-Policy above names
  // this endpoint in its report-to and report-uri directives.
  { key: "Reporting-Endpoints", value: CSP_REPORTING_ENDPOINTS },
  // Trusted Types, report-only (S6): never enforced yet — this header only
  // measures violations, reported to the same endpoint.
  { key: "Content-Security-Policy-Report-Only", value: TRUSTED_TYPES_REPORT_ONLY },
  // Cross-origin isolation headers (S8): /talk's Sarvam voice flow uses a
  // WebSocket and a same-origin blob worklet, never a cross-origin window.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
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
          { key: "Permissions-Policy", value: talkPermissionsPolicy },
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
      // The Lab trace tool (E3, WP76) runs its analysis in the browser:
      // onnxruntime-web compiles a WASM engine (same-origin /ort/ assets)
      // and the page fetches its models from operator-configured locations.
      // Unconfigured, no connect-src addition is emitted.
      {
        source: "/lab/trace",
        headers: [{ key: "Content-Security-Policy", value: buildCsp({ labTrace: true }) }],
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
