// Generates the C2PA test fixtures for tests/unit/c2pa-credentials.test.ts:
//
//   tests/fixtures/c2pa/ai-fixture.jpg              — a small SYNTHETIC image
//                                                    (a plain colour gradient, never
//                                                    a photo of a person) carrying a
//                                                    signed C2PA manifest that states
//                                                    the AI digital source type
//                                                    (IPTC trainedAlgorithmicMedia)
//   tests/fixtures/c2pa/ai-fixture-manifest-store.json — the exact manifest-store
//                                                    JSON c2pa-rs reads back from it
//                                                    (the structure Reader.manifestStore()
//                                                    returns in the browser)
//
// The manifest is written with c2patool, the Content Authenticity Initiative's
// own command-line tool from github.com/contentauth/c2pa-rs (MIT OR Apache-2.0),
// signed with the well-known C2PA TEST credentials that ship inside the tool's
// release archive (sample/es256_*). Those keys are public test fixtures of the
// C2PA project, not secrets.
//
// Run once from asmita/ after `npm ci`; the outputs are committed so CI never
// needs the tool:
//
//   node scripts/make-c2pa-fixture.mjs
//
// Set C2PATOOL to an existing c2patool binary; otherwise the pinned release
// below is downloaded (needs network).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import jpeg from "jpeg-js";

const C2PATOOL_VERSION = "0.27.23";
const C2PATOOL_URL =
  `https://github.com/contentauth/c2pa-rs/releases/download/c2patool-v${C2PATOOL_VERSION}/` +
  `c2patool-v${C2PATOOL_VERSION}-x86_64-unknown-linux-gnu.tar.gz`;

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "tests", "fixtures", "c2pa");
const fixturePath = join(outDir, "ai-fixture.jpg");
const manifestStorePath = join(outDir, "ai-fixture-manifest-store.json");

// 1. The synthetic image: a 96x96 colour gradient, machine-made, no person.
const W = 96;
const H = 96;
const pixels = Buffer.alloc(W * H * 4);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    pixels[i] = Math.round((x * 255) / W);
    pixels[i + 1] = Math.round((y * 255) / H);
    pixels[i + 2] = Math.round(((x + y) * 255) / (W + H));
    pixels[i + 3] = 255;
  }
}
const plain = jpeg.encode({ data: pixels, width: W, height: H }, 90).data;
const plainPath = join(outDir, "plain.jpg");
mkdirSync(outDir, { recursive: true });
writeFileSync(plainPath, plain);

// 2. Locate or download c2patool.
function findC2patool() {
  if (process.env.C2PATOOL) return process.env.C2PATOOL;
  const work = join(tmpdir(), `asmita-c2patool-v${C2PATOOL_VERSION}`);
  const binary = join(work, "c2patool", "c2patool");
  if (existsSync(binary)) return binary;
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  console.log(`downloading c2patool v${C2PATOOL_VERSION} ...`);
  execFileSync("curl", ["-sSL", "-o", join(work, "c2patool.tgz"), C2PATOOL_URL], { stdio: "inherit" });
  execFileSync("tar", ["xzf", join(work, "c2patool.tgz"), "-C", work], { stdio: "inherit" });
  return binary;
}
const c2patool = findC2patool();

// 3. The manifest definition: our fixture tools as the claim generator, an
// organisation (no person) as author, and the AI digital source type.
const sampleDir = join(dirname(c2patool), "sample");
const manifestDef = {
  claim_generator: "asmita-test-fixtures/1.0",
  claim_generator_info: [{ name: "AsmitaTestFixtures", version: "1.0.0" }],
  title: "asmita-ai-fixture",
  assertions: [
    {
      label: "stds.schema-org.CreativeWork",
      data: {
        "@context": "http://schema.org/",
        "@type": "CreativeWork",
        author: [{ "@type": "Organization", name: "Asmita synthetic test fixtures" }],
      },
    },
  ],
  alg: "Es256",
  private_key: join(sampleDir, "es256_private.key"),
  sign_cert: join(sampleDir, "es256_certs.pem"),
};
const manifestDefPath = join(outDir, "manifest-def.json");
writeFileSync(manifestDefPath, JSON.stringify(manifestDef, null, 2));

// 4. Embed the signed manifest (--create trainedAlgorithmicMedia sets the
// builder intent to Create with the IPTC AI digital source type).
execFileSync(
  c2patool,
  ["-m", manifestDefPath, "-o", fixturePath, "--create", "trainedAlgorithmicMedia", plainPath, "-f"],
  { stdio: "inherit" },
);

// 5. Dump the manifest store exactly as the reader sees it.
const store = execFileSync(c2patool, [fixturePath], { maxBuffer: 16 * 1024 * 1024 }).toString();
writeFileSync(manifestStorePath, store);

// 6. Clean up the intermediates; print what was produced.
rmSync(plainPath);
rmSync(manifestDefPath);
const fixtureBytes = readFileSync(fixturePath);
console.log(`wrote ${fixturePath} (${fixtureBytes.length} bytes, sha256 ${createHash("sha256").update(fixtureBytes).digest("hex")})`);
console.log(`wrote ${manifestStorePath} (${readFileSync(manifestStorePath).length} bytes)`);
