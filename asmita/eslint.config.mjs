import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Identifiers that hold a survivor-submitted or crawler-discovered address.
// Extend this list, never shorten it.
const URL_NAMES =
  "/^(url|submittedUrl|contentUrl|urlString|pageUrl|imageUrl|findingUrl|pageAddress|imageAddress|discoveredUrl|revealedUrl|normalizedUrl|rawUrl)$/";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        // Survivor-submitted and crawler-discovered addresses are text only
        // (ADR 001, ADR 006 N1). The names cover submitted links and the
        // crawler's finding, page and image addresses, as plain variables
        // and as properties (fetch(finding.pageUrl)).
        {
          selector: `CallExpression[callee.name='fetch'] > Identifier.arguments[name=${URL_NAMES}]`,
          message:
            "Submitted and discovered URLs are string tokens only. Do not fetch URL-derived variables.",
        },
        {
          selector: `CallExpression[callee.name='fetch'] > MemberExpression.arguments[property.name=${URL_NAMES}]`,
          message:
            "Submitted and discovered URLs are string tokens only. Do not fetch URL-derived variables.",
        },
        {
          selector: `CallExpression[callee.object.name='axios'] > Identifier.arguments[name=${URL_NAMES}]`,
          message:
            "Submitted and discovered URLs are string tokens only. Do not fetch URL-derived variables.",
        },
        {
          selector: `CallExpression[callee.object.name='axios'] > MemberExpression.arguments[property.name=${URL_NAMES}]`,
          message:
            "Submitted and discovered URLs are string tokens only. Do not fetch URL-derived variables.",
        },
        {
          selector: "MemberExpression[object.name='req'][property.name='body']",
          message: "Validate request payloads with Zod before reading fields.",
        },
        {
          selector: "MemberExpression[object.name='request'][property.name='body']",
          message: "Validate request payloads with Zod before reading fields.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-old-*/**",
    "out/**",
    "build/**",
    "dist/**",
    ".vinext/**",
    ".wrangler/**",
    "next-env.d.ts",
    "src/generated/**",
    "test-results/**",
    "tests/lint/**",
    "docs/archive/**",
  ]),
]);

export default eslintConfig;
