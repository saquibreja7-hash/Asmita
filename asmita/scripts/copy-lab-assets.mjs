// Copies the AI Lab trace tool's browser-side runtime assets out of
// node_modules so they are served from our own origin — never a third-party
// CDN, the same discipline as copy-c2pa-assets.mjs (E3, WP76):
//
//   public/ort/ort-wasm-simd-threaded.wasm  onnxruntime-web's WASM engine
//                                           (single-threaded CPU provider)
//   public/human/human.js                   the face-landmark library's
//                                           browser IIFE build (sets the
//                                           global Human when loaded as a
//                                           classic script)
//
// Why vendor the human build instead of importing the package: the package's
// exports map misdeclares its dist subpaths (keys without a "./" prefix are
// conditions, not subpaths), so a bundler's server-side pass resolves the
// bare specifier to the Node build, which needs a native TensorFlow binding
// that must never enter this app (tools/lab-bench hits the same quirk and
// loads its build by direct path). Serving the IIFE build as a plain script
// sidesteps module resolution entirely, in dev and in both production
// builds.
//
// Runs on every install (postinstall). The copies are build artifacts and are
// not committed (see .gitignore).
import { copyFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = [
  {
    from: join(here, "..", "node_modules", "onnxruntime-web", "dist", "ort-wasm-simd-threaded.wasm"),
    to: join(here, "..", "public", "ort", "ort-wasm-simd-threaded.wasm"),
    label: "public/ort/ort-wasm-simd-threaded.wasm",
  },
  {
    from: join(here, "..", "node_modules", "@vladmandic", "human", "dist", "human.js"),
    to: join(here, "..", "public", "human", "human.js"),
    label: "public/human/human.js",
  },
];

for (const file of out) {
  if (!existsSync(file.from)) {
    console.error(`copy-lab-assets: missing ${file.from}; run npm install first`);
    process.exit(1);
  }
  mkdirSync(dirname(file.to), { recursive: true });
  copyFileSync(file.from, file.to);
  const size = statSync(file.to).size;
  console.log(`copy-lab-assets: ${file.label} (${Math.round(size / 1024)} KiB) ready`);
}
