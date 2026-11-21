/**
 * WP28 evaluation: PDQ vs PDQ+SSCD on a synthetic set, through the real
 * isolated SSCD child (the same SscdPool the crawl uses), so the timing
 * numbers include the real IPC and decode path.
 *
 * NOT part of `npm test` (the model weights are never committed; a run
 * needs the pinned ONNX file — see crawler/Dockerfile and
 * asmita/docs/adr/008-sscd-second-layer.md):
 *
 *   node -e '...download the pinned URL to /tmp/sscd.onnx with a sha256 check...'
 *   npx tsx scripts/eval-sscd.ts --model /tmp/sscd.onnx
 *
 * Everything is generated in memory: shapes, gradients, rendered text and
 * sharp test patterns only — never a photo of a person, never a real image.
 * Nothing is written to disk. The variants are the transformations PDQ is
 * known not to survive: crops 10/30/50%, a border, rotation, a colour
 * filter, blur, JPEG re-encode, screenshot-style rescaling with UI chrome,
 * and a mirror flip.
 *
 * Reports: PDQ recall at the pool threshold (31), PDQ+SSCD recall at each
 * candidate threshold, the highest cosine between unrelated synthetic
 * images (the false-match bound), the chosen threshold, and SSCD seconds
 * per image in this container.
 */
import sharp from "sharp";
import { hashImage } from "../src/image/hash-image.ts";
import { SscdPool } from "../src/image/sscd-pool.ts";
import { packHex, popcount32 } from "../src/match/matcher.ts";

const args = process.argv.slice(2);
const modelArg = args.indexOf("--model");
const modelPath = modelArg >= 0 ? args[modelArg + 1] : process.env.SSCD_MODEL_FILE;
if (!modelPath) {
  console.error("usage: npx tsx scripts/eval-sscd.ts --model <pinned-onnx-file> (see crawler/Dockerfile for the URL and sha256)");
  process.exit(64);
}
const expectedDim = 512;

/** Hamming distance of two 64-hex hashes. */
function hamming(a: string, b: string): number {
  const wa = new Uint32Array(8);
  const wb = new Uint32Array(8);
  packHex(a, wa, 0);
  packHex(b, wb, 0);
  let d = 0;
  for (let i = 0; i < 8; i++) d += popcount32(wa[i]! ^ wb[i]!);
  return d;
}

const cos = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i]!, 0);

// --- the synthetic set ---------------------------------------------------------

const WIDTH = 640;
const HEIGHT = 480;

/** A rendered-text panel: big letters on a gradient, our own SVG. */
async function textPanel(seed: number): Promise<Buffer> {
  const words = ["NOTICE", "SAMPLE", "ASYNC", "VERIFY", "PILOT"][seed % 5]!;
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="hsl(${(seed * 47) % 360},70%,55%)"/>
        <stop offset="1" stop-color="hsl(${(seed * 91) % 360},60%,30%)"/>
      </linearGradient></defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
      <text x="50%" y="52%" font-family="monospace" font-size="120" font-weight="bold"
        fill="white" fill-opacity="0.92" text-anchor="middle" transform="rotate(${(seed * 13) % 40 - 20} 320 240)">${words}</text>
      <rect x="${40 + seed % 60}" y="${30 + (seed * 7) % 90}" width="120" height="90" fill="black" fill-opacity="0.25"/>
    </svg>`,
  );
  return sharp(svg).png().toBuffer();
}

async function baseImage(seed: number): Promise<Buffer> {
  const kind = seed % 3;
  if (kind === 2) return textPanel(seed);
  // Kinds 0 and 1: the blob/stripe/noise patterns of tests/support/synthetic.ts
  // (reimplemented inline so this script stands alone).
  const rndState = { s: (seed * 2654435761) >>> 0 || 1 };
  const rnd = () => {
    let s = rndState.s;
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    rndState.s = s;
    return s / 0x100000000;
  };
  const blobs = Array.from({ length: 6 }, () => ({
    x: rnd() * WIDTH, y: rnd() * HEIGHT,
    r: (0.15 + rnd() * 0.35) * Math.max(WIDTH, HEIGHT),
    c: [rnd() * 255, rnd() * 255, rnd() * 255],
  }));
  const fx = 2 + rnd() * 10;
  const fy = 2 + rnd() * 10;
  const block = Math.max(4, Math.round(Math.min(WIDTH, HEIGHT) / 24));
  const cols = Math.ceil(WIDTH / block);
  const texture = Array.from({ length: cols * Math.ceil(HEIGHT / block) }, () => (rnd() - 0.5) * 140);
  const out = Buffer.alloc(WIDTH * HEIGHT * 3);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      let r = 128 + 60 * Math.sin((x / WIDTH) * fx * Math.PI);
      let g = 128 + 60 * Math.cos((y / HEIGHT) * fy * Math.PI);
      let b = 128 + 60 * Math.sin(((x + y) / (WIDTH + HEIGHT)) * (fx + fy) * Math.PI);
      for (const blob of blobs) {
        const d = Math.hypot(x - blob.x, y - blob.y);
        if (d < blob.r) {
          const k = 1 - d / blob.r;
          r = r * (1 - k) + blob.c[0]! * k;
          g = g * (1 - k) + blob.c[1]! * k;
          b = b * (1 - k) + blob.c[2]! * k;
        }
      }
      const t = texture[Math.floor(y / block) * cols + Math.floor(x / block)]!;
      const i = (y * WIDTH + x) * 3;
      out[i] = Math.max(0, Math.min(255, Math.round(r + t)));
      out[i + 1] = Math.max(0, Math.min(255, Math.round(g + t)));
      out[i + 2] = Math.max(0, Math.min(255, Math.round(b + t)));
    }
  }
  return sharp(out, { raw: { width: WIDTH, height: HEIGHT, channels: 3 } }).png().toBuffer();
}

/** The alteration families: what an attacker does to a copy. */
async function variant(seed: number, base: Buffer, kind: number): Promise<Buffer> {
  const image = sharp(base, { failOn: "none" });
  switch (kind) {
    case 0: {
      // Crop 10% off each edge.
      const w = Math.round(WIDTH * 0.8);
      const h = Math.round(HEIGHT * 0.8);
      return image.extract({ left: Math.round(WIDTH * 0.1), top: Math.round(HEIGHT * 0.1), width: w, height: h }).png().toBuffer();
    }
    case 1: {
      const w = Math.round(WIDTH * 0.4);
      const h = Math.round(HEIGHT * 0.4);
      return image.extract({ left: Math.round(WIDTH * 0.3), top: Math.round(HEIGHT * 0.3), width: w, height: h }).png().toBuffer();
    }
    case 2: {
      const w = Math.round(WIDTH * 0.5);
      const h = Math.round(HEIGHT * 0.5);
      return image.extract({ left: Math.round(WIDTH * 0.25), top: Math.round(HEIGHT * 0.25), width: w, height: h }).png().toBuffer();
    }
    case 3:
      // A 5% border around the image.
      return image
        .extend({ top: 24, bottom: 24, left: 32, right: 32, background: { r: 200, g: 60, b: 60 } })
        .png().toBuffer();
    case 4:
      return image.rotate(2, { background: { r: 30, g: 30, b: 120 } }).png().toBuffer();
    case 5:
      return image.modulate({ saturation: 0.35, brightness: 1.15 }).png().toBuffer();
    case 6:
      return image.blur(1.8).png().toBuffer();
    case 7:
      return image.jpeg({ quality: 30 }).toBuffer();
    case 8: {
      // Screenshot-like: rescaled to 480px wide with browser chrome bars.
      const scaled = await image.resize(480).png().toBuffer();
      return sharp({
        create: { width: 480, height: 480 + 72, channels: 3, background: { r: 240, g: 240, b: 240 } },
      })
        .composite([
          { input: scaled, top: 56, left: 0 },
          { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="56"><rect width="480" height="36" fill="#f5f5f5"/><circle cx="18" cy="18" r="6" fill="#ff5f57"/><circle cx="40" cy="18" r="6" fill="#febc2e"/><circle cx="62" cy="18" r="6" fill="#28c840"/><rect y="36" width="480" height="20" fill="#e8e8e8"/></svg>`), top: 0, left: 0 },
        ])
        .jpeg({ quality: 70 })
        .toBuffer();
    }
    default:
      return image.flop().png().toBuffer();
  }
}

// --- the run -------------------------------------------------------------------

const BASES = 12;
const VARIANTS = 10;

const pool = new SscdPool({ size: 1, taskTimeoutMs: 60_000, minSide: 1, modelPath, expectedDim });

async function embedTimed(bytes: Buffer): Promise<{ vector: number[] | null; ms: number }> {
  const t0 = performance.now();
  try {
    const vector = await pool.embed(bytes);
    return { vector, ms: performance.now() - t0 };
  } catch {
    return { vector: null, ms: performance.now() - t0 };
  }
}

const bases: Buffer[] = [];
const baseHashes: string[] = [];
const baseVectors: number[][] = [];
for (let i = 0; i < BASES; i++) {
  const img = await baseImage(i + 1);
  bases.push(img);
  baseHashes.push((await hashImage(img, { minSide: 1 })).hash);
  const { vector } = await embedTimed(img);
  if (!vector) {
    console.error(`the SSCD child failed on the base image (model: ${modelPath})`);
    process.exit(1);
  }
  baseVectors.push(vector);
}

const rows: Array<{ seed: number; kind: number; pdqDistance: number; sscdSimilarity: number }> = [];
/** Every variant's vector, kept for the cross-pair false-match count. */
const variantVectors: number[][] = [];
let embedMs = 0;
let embeds = 0;
for (let i = 0; i < BASES; i++) {
  for (let kind = 0; kind < VARIANTS; kind++) {
    const v = await variant(i, bases[i]!, kind);
    const pdqDistance = hamming(baseHashes[i]!, (await hashImage(v, { minSide: 1 })).hash);
    const { vector, ms } = await embedTimed(v);
    embedMs += ms;
    embeds += 1;
    if (vector) variantVectors.push(vector);
    rows.push({ seed: i, kind, pdqDistance, sscdSimilarity: vector ? cos(baseVectors[i]!, vector) : -1 });
  }
}

// Unrelated pairs, both directions: base-vs-base (BASES*(BASES-1) pairs)
// and every variant against the bases it does not come from
// (BASES*VARIANTS*(BASES-1) pairs). The count above each threshold is the
// false-match number; the max is the strongest signal any unrelated pair
// reached.
let unrelatedMax = -1;
let unrelatedBasePairs = 0;
let unrelatedCrossPairs = 0;
for (let i = 0; i < BASES; i++) {
  for (let j = 0; j < BASES; j++) {
    if (i === j) continue;
    const c = cos(baseVectors[i]!, baseVectors[j]!);
    unrelatedMax = Math.max(unrelatedMax, c);
    if (c >= 0.85) unrelatedBasePairs += 1;
  }
}
for (let k = 0; k < variantVectors.length; k++) {
  const own = Math.floor(k / VARIANTS);
  for (let j = 0; j < BASES; j++) {
    if (j === own) continue;
    const c = cos(baseVectors[j]!, variantVectors[k]!);
    unrelatedMax = Math.max(unrelatedMax, c);
    if (c >= 0.85) unrelatedCrossPairs += 1;
  }
}

await pool.close();

const POOL_THRESHOLD = 31;
const pdqHits = rows.filter((r) => r.pdqDistance <= POOL_THRESHOLD).length;
const variantNames = ["crop10", "crop30", "crop50", "border5", "rotate2", "colourfilter", "blur", "jpeg30", "screenshot", "mirror"];

console.log("WP28 evaluation (synthetic set, generated images only; SSCD through the isolated child)");
console.log(`bases: ${BASES}  variants each: ${VARIANTS}  queries: ${rows.length}`);
console.log(`PDQ recall (distance <= ${POOL_THRESHOLD}): ${pdqHits}/${rows.length} (${((100 * pdqHits) / rows.length).toFixed(1)}%)`);
for (const t of [0.75, 0.8, 0.85, 0.9, 0.95]) {
  const sscdHits = rows.filter((r) => r.sscdSimilarity >= t).length;
  const union = rows.filter((r) => r.pdqDistance <= POOL_THRESHOLD || r.sscdSimilarity >= t).length;
  console.log(`threshold ${t.toFixed(2)}: SSCD recall ${sscdHits}/${rows.length} (${((100 * sscdHits) / rows.length).toFixed(1)}%), PDQ+SSCD recall ${union}/${rows.length} (${((100 * union) / rows.length).toFixed(1)}%)`);
}
console.log("per-family (best cosine of the 12 bases, and how many PDQ caught):");
for (let kind = 0; kind < VARIANTS; kind++) {
  const family = rows.filter((r) => r.kind === kind);
  const best = Math.max(...family.map((r) => r.sscdSimilarity));
  const worst = Math.min(...family.map((r) => r.sscdSimilarity));
  const pdq = family.filter((r) => r.pdqDistance <= POOL_THRESHOLD).length;
  const at85 = family.filter((r) => r.sscdSimilarity >= 0.85).length;
  console.log(`  ${variantNames[kind]!.padEnd(13)} pdq ${pdq}/${family.length}  sscd@0.85 ${at85}/${family.length}  cosine ${worst.toFixed(3)}..${best.toFixed(3)}`);
}
const totalUnrelated = BASES * (BASES - 1) + BASES * VARIANTS * (BASES - 1);
console.log(`unrelated-image false matches: highest cosine ${unrelatedMax.toFixed(3)}; pairs at or above 0.85: ${unrelatedBasePairs} of ${BASES * (BASES - 1)} base-vs-base, ${unrelatedCrossPairs} of ${BASES * VARIANTS * (BASES - 1)} variant-vs-other-base (${totalUnrelated} unrelated pairs in all)`);
console.log(`SSCD time per image (decode + resize + inference, one child, one core): ${(embedMs / Math.max(embeds, 1)).toFixed(0)} ms mean over ${embeds} variant embeds`);
