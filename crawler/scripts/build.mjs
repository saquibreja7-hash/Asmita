// Bundles src/main.ts (and the read-only asmita PDQ module it imports) into
// dist/main.js. Runtime dependencies stay external and are installed in the
// image with `npm ci --omit=dev`; sharp in particular is a native module.
import { build } from "esbuild";
import { readFile } from "node:fs/promises";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

await build({
  entryPoints: [new URL("../src/main.ts", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")],
  outfile: new URL("../dist/main.js", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: false,
  legalComments: "none",
  external: Object.keys(pkg.dependencies ?? {}),
  logLevel: "info",
});
