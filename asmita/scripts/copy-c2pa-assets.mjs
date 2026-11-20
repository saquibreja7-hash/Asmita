// Copies the Content Authenticity Initiative's c2pa-web engine files (WASM and
// its worker script, MIT licence) out of node_modules into public/c2pa/ so
// the on-device Content Credentials reader (src/lib/c2pa-credentials.ts) loads
// them from our own origin — never from a third-party CDN.
//
// Runs on every install (postinstall). The copies are build artifacts and are
// not committed (see .gitignore).
import { copyFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "..", "node_modules", "@contentauth", "c2pa-web", "dist");
const outDir = join(here, "..", "public", "c2pa");

const files = [
  // from                     → to                       what it is
  ["resources/c2pa_bg.wasm", "c2pa.wasm"], // the verification engine (WebAssembly)
  ["c2pa_worker.js", "c2pa_worker.js"], // the engine's worker script
];

mkdirSync(outDir, { recursive: true });
for (const [from, to] of files) {
  const source = join(pkg, from);
  if (!existsSync(source)) {
    console.error(`copy-c2pa-assets: missing ${source}; run npm install first`);
    process.exit(1);
  }
  copyFileSync(source, join(outDir, to));
}
const size = statSync(join(outDir, "c2pa.wasm")).size;
console.log(`copy-c2pa-assets: public/c2pa/{c2pa.wasm (${Math.round(size / 1024)} KiB), c2pa_worker.js} ready`);
