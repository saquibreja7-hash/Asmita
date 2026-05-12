import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.name='fetch'] > Identifier.arguments[name=/^(url|submittedUrl|contentUrl|urlString)$/]",
          message:
            "Submitted URLs are string tokens only. Do not fetch URL-derived variables.",
        },
        {
          selector:
            "CallExpression[callee.object.name='axios'] > Identifier.arguments[name=/^(url|submittedUrl|contentUrl|urlString)$/]",
          message:
            "Submitted URLs are string tokens only. Do not fetch URL-derived variables.",
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
    "next-env.d.ts",
    "test-results/**",
    "tests/lint/**",
  ]),
]);

export default eslintConfig;
