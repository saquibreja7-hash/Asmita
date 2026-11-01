import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const isProd = process.env.NODE_ENV === "production";

// Only /talk passes the voice option (see headers below).
function csp(frameAncestors: "'none'" | "'self'", { voice = false } = {}) {
  return [
    "default-src 'self'",
    // The Sarvam SDK loads its audio worklet from a blob: URL.
    `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}${voice ? " blob:" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    // The browser opens the signed voice WebSocket straight to Sarvam; the
    // session route refuses any signed URL outside *.sarvam.ai.
    `connect-src 'self'${voice ? " wss://*.sarvam.ai" : ""}`,
    "font-src 'self' data:",
    "object-src 'none'",
    `frame-ancestors ${frameAncestors}`,
    "base-uri 'self'",
    "form-action 'self'",
    ...(isProd ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
  { key: "Content-Security-Policy", value: csp("'none'") },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  turbopack: {
    root: projectRoot,
  },
  // Bundle the Noto Sans Devanagari woff file into serverless function
  // outputs. Without this, fir-package-generator.ts cannot read the font
  // on Vercel because Next's file-tracing only follows `import` statements,
  // not runtime fs.readFile paths.
  outputFileTracingIncludes: {
    "/api/cases/[caseId]/export/*": [
      "./node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff",
    ],
    "/api/cases/[caseId]/fir-package/*": [
      "./node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff",
    ],
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // Browser voice calls with the helpline: the microphone and Sarvam's
      // WebSocket are allowed on this page only.
      {
        source: "/talk",
        headers: [
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
          { key: "Content-Security-Policy", value: csp("'none'", { voice: true }) },
        ],
      },
      // PDF previews are served into iframes on the sign pages — relax framing
      // headers for these routes only. All other security headers still apply.
      {
        source: "/api/cases/:caseId/preview-notice",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: csp("'self'") },
        ],
      },
      {
        source: "/api/cases/:caseId/preview-hash-advisory",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: csp("'self'") },
        ],
      },
    ];
  },
};

export default nextConfig;
