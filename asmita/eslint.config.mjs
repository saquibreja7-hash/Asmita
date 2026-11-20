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

// The Lab (docs/lab/charter.md) is separate from the complaint workflow:
// lab paths may fetch (liveness checks, DNS/RDAP lookups), so the
// no-URL-fetch selectors above must not reach them. These globs also mark
// the charter's import boundary in both directions, below.
const LAB_PATHS = ["src/lib/lab/**", "src/app/**/lab/**", "tools/lab-*/**"];
const LAB_FILES = LAB_PATHS.map((p) => `${p}/*.{ts,tsx,js,jsx}`);

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
        // Lab paths are exempt: the block after this one replaces the rule
        // there, so the charter's lab code may fetch. Complaint code keeps
        // every selector exactly as before.
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
  // Lab paths: fetch is allowed (liveness, RDAP), so only the Zod body
  // checks remain from the rule above.
  {
    files: LAB_FILES,
    rules: {
      "no-restricted-syntax": [
        "error",
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
  // Charter boundary, both ways. Non-lab code never imports lab code:
  // the Lab is its own workflow, and nothing in the complaint filing flow
  // may grow a dependency on it. Tests and scripts are outside the
  // boundary: they exercise both sides on purpose.
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    ignores: [...LAB_PATHS, "tests/**", "scripts/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              // No parentheses in these globs: minimatch reads them as
              // extglob syntax. "@/app/*/lab/**" covers (public)/lab,
              // admin/lab and api/lab alike.
              group: ["@/lib/lab", "@/lib/lab/**", "@/app/*/lab/**"],
              message: "Nothing outside the Lab imports lab code (docs/lab/charter.md boundary).",
            },
          ],
        },
      ],
    },
  },
  // And lab code never imports complaint-workflow modules: cases, notices,
  // hash submission, escalation, case-ops, store. Shared basics (db, auth,
  // csrf, rate limit, i18n, UI components, email) stay fine.
  {
    files: LAB_FILES,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/lib/case-ops",
                "@/lib/store",
                "@/lib/case-*",
                "@/lib/notice-*",
                "@/lib/hash-*",
                "@/lib/escalation-*",
              ],
              message: "Lab code never imports complaint-workflow modules (docs/lab/charter.md boundary).",
            },
          ],
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
