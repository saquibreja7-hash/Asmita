/*
 * scripts/worker-smoke.mjs imports TypeScript modules straight out of src/
 * and runs them with plain Node (type stripping), where every relative
 * import must carry its explicit .ts extension — Node ESM resolves no
 * extensionless specifier. The lab-trace WP added `from "./lab-models"`
 * to src/lib/csp.ts, and CI's "Playwright e2e (with Postgres)" job died at
 * `node scripts/worker-smoke.mjs` with ERR_MODULE_NOT_FOUND (PR #108).
 *
 * This guard loads, under the same plain Node, every module the smoke
 * script imports, and checks the exact named bindings the script uses, so
 * the step cannot break this way again unnoticed by the unit suite.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, test } from "vitest";

type SmokeImport = { names: string[]; specifier: string };

/** Every `import { … } from "../src/…"` the smoke script writes. */
function smokeSourceImports(): SmokeImport[] {
  const source = readFileSync(join(process.cwd(), "scripts", "worker-smoke.mjs"), "utf8");
  const found: SmokeImport[] = [...source.matchAll(/import\s+\{([^}]*)\}\s+from\s+"(\.\.\/src\/[^"]+)"/g)].map(
    (match) => ({
      names: match[1]!.split(",").map((name) => name.trim()).filter(Boolean),
      specifier: match[2]!,
    }),
  );
  if (found.length === 0) throw new Error("worker-smoke.mjs no longer imports from ../src — update this guard");
  return found;
}

describe("worker-smoke.mjs raw Node imports", () => {
  for (const { names, specifier } of smokeSourceImports()) {
    test(`${specifier} loads under plain Node with its named bindings`, () => {
      // "../src/…" is relative to scripts/, exactly as the smoke script
      // resolves it; the spawned Node gets the absolute file URL instead,
      // which is what --eval's CWD-relative resolution cannot give us.
      const file = join(process.cwd(), "scripts", specifier);
      const url = JSON.stringify(pathToFileURL(file).href);
      const needed = JSON.stringify(names);
      // Same interpreter the smoke step uses; --experimental-strip-types is
      // the default on current Node 22 and keeps older 22.x able to run it.
      execFileSync(
        process.execPath,
        [
          "--experimental-strip-types",
          "--input-type=module",
          "--eval",
          `const m = await import(${url}); for (const name of ${needed}) { if (!(name in m)) throw new Error("missing export: " + name); }`,
        ],
        { stdio: "pipe" },
      );
    });
  }
});
