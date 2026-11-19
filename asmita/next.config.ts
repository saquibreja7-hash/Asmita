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
