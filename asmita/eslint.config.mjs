import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Identifiers that hold a survivor-submitted or crawler-discovered address.
// Extend this list, never shorten it.
const URL_NAMES =
  "/^(url|submittedUrl|contentUrl|urlString|pageUrl|imageUrl|findingUrl|pageAddress|imageAddress|discoveredUrl|revealedUrl|normalizedUrl|rawUrl)$/";

// A value that carries such an address: the name itself, a property of that
// name (finding.pageUrl), or a computed property with that name
// (finding["pageUrl"]).
const URL_VALUE = `Identifier[name=${URL_NAMES}], MemberExpression[property.name=${URL_NAMES}], MemberExpression[computed=true][property.value=${URL_NAMES}]`;
// fetch itself, or fetch reached through the global object.
const FETCH_CALL = "CallExpression:matches([callee.name='fetch'], [callee.type='MemberExpression'][callee.property.name='fetch'][callee.object.name=/^(globalThis|window|self|global)$/])";
const AXIOS_CALL = "CallExpression:matches([callee.name='axios'], [callee.object.name='axios'])";
const NO_URL_FETCH = "Submitted and discovered URLs are string tokens only. Do not fetch URL-derived variables.";

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
        // and as properties (fetch(finding.pageUrl)), anywhere inside the
        // first argument: new URL(pageUrl), `${pageUrl}`, pageUrl.href,
        // finding["pageUrl"]; and fetch through globalThis/window/self.
        {
          selector: `${FETCH_CALL} > :first-child.arguments:matches(${URL_VALUE}, :has(${URL_VALUE}))`,
          message: NO_URL_FETCH,
        },
        {
          selector: `${AXIOS_CALL} > :first-child.arguments:matches(${URL_VALUE}, :has(${URL_VALUE}))`,
          message: NO_URL_FETCH,
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
    // The CAI's c2pa-web engine files (WASM + worker script), vendored from
    // node_modules into public/c2pa on install by scripts/copy-c2pa-assets.mjs
    // and gitignored there. Third-party generated code; never ours to lint.
    "public/c2pa/**",
  ]),
]);

export default eslintConfig;
