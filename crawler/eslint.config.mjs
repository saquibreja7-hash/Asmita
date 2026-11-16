import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.mjs"],
    languageOptions: { globals: { URL: "readonly", process: "readonly", console: "readonly", Buffer: "readonly" } },
  },
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // Production code: no disk access, no console output (only the sanitising
    // Logger), and no environment reads outside the entrypoint.
    files: ["src/**/*.ts"],
    rules: {
      "no-console": "error",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "fs", message: "The crawler never touches the filesystem (memory-only)." },
            { name: "node:fs", message: "The crawler never touches the filesystem (memory-only)." },
            { name: "fs/promises", message: "The crawler never touches the filesystem (memory-only)." },
            { name: "node:fs/promises", message: "The crawler never touches the filesystem (memory-only)." },
            { name: "node:os", importNames: ["tmpdir"], message: "No temp files." },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        { selector: "CallExpression[callee.property.name='toFile']", message: "Images stay in memory: never sharp().toFile()." },
        { selector: "CallExpression[callee.name='fetch']", message: "Use SafeFetcher (crawl) or AsmitaClient (API), never global fetch." },
      ],
    },
  },
  {
    files: ["src/**/*.ts"],
    ignores: ["src/main.ts"],
    rules: {
      "no-restricted-properties": ["error", { object: "process", property: "env", message: "Read config via src/config.ts from main.ts only." }],
    },
  },
);
