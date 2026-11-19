// Bundles the four entrypoints into dist/:
//   dist/main.js            the crawler (never loads sharp/libvips itself)
//   dist/decoder-worker.js  the isolated decoder child process (sharp + PDQ)
//   dist/browser-worker.js  the isolated browser child process (Playwright
//                           Chromium; loaded only when a source needs it)
//   dist/sandbox-check.js   the WP25 standalone sandbox probe (no key, no
//                           network; prints whether Chromium's own sandbox
//                           can start in this runtime)
// The read-only asmita PDQ module is inlined. Runtime dependencies stay
// external and are installed with `npm ci --omit=dev`; sharp is native.
// Tests import this file (tests/global-setup.ts) so the workers exist.
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const pkg = JSON.parse(await readFile(root("package.json"), "utf8"));

await build({
  entryPoints: {
    main: root("src/main.ts"),
    "decoder-worker": root("src/image/decoder-worker.ts"),
    "browser-worker": root("src/browser/browser-worker.ts"),
    "sandbox-check": root("scripts/sandbox-check.ts"),
  },
  outdir: root("dist"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: false,
  legalComments: "none",
  external: Object.keys(pkg.dependencies ?? {}),
  logLevel: process.env.BUILD_QUIET ? "warning" : "info",
});
