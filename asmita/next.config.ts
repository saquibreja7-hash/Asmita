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
