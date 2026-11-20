/**
 * Test-set generation for the PDQ robustness harness.
 *
 * Everything is harmless by construction: synthetic images produced in code
 * from a seeded PRNG (gradients, vector shapes, pseudo-text glyphs, value-noise
 * textures, a procedural landscape) plus a fixed, curated list of public-
 * domain landscape PHOTOGRAPHS fetched at run time from Wikimedia Commons with
 * their licence recorded. Never photos of people, never anything intimate.
 *
 * The generator is deliberately similar to tools/pdq-agreement/src/fixtures.ts
 * (same seeded PRNG and drawing ideas, our own code) but independent: this
 * harness needs a controlled base size (800x600) and its own class mix.
 */
import sharp, { type Sharp } from "sharp";

export const BASE_W = 800;
export const BASE_H = 600;

export type BaseFormat = "jpeg" | "png" | "webp";

/** One original image of the test set. */
export type Original = {
  name: string;
  /** Image class, used for per-class breakdowns. */
  cls: string;
  format: BaseFormat;
  buffer: Buffer;
};

/** Public-domain photographs fetched at run time. Licence recorded in the manifest. */
export type FetchedPhoto = {
  name: string;
  buffer: Buffer;
  format: BaseFormat;
  /** Provenance, recorded verbatim from the Commons API at fetch time. */
  source: {
    title: string;
    descriptionUrl: string;
    fetchedUrl: string;
    licence: string;
    artist: string;
    fetchedAt: string;
  };
};

/**
 * The curated Commons list. Every entry was checked by hand (2026-11-19):
 * a landscape photograph with no people, released as Public domain or CC0.
 * The run-time fetch re-verifies the licence through the API before keeping a
 * file, so a licence change upstream removes the photo instead of sneaking a
 * non-free image into the set.
 */
export const COMMONS_PHOTOS: ReadonlyArray<{ title: string; clsNote: string }> = [
  { title: "File:Misty forest landscape in Dilijan.jpg", clsNote: "forest, mist" },
  { title: "File:Utah Dunes Landscape - West Desert District.jpg", clsNote: "sand dunes" },
  { title: "File:Gem Lake frozen.jpg", clsNote: "alpine lake, winter" },
  { title: "File:Field, corn, Liechtenstein, Mountains, Alps, Vaduz, sky, clouds, landscape.jpg", clsNote: "farmland, mountains" },
  { title: "File:Forest road Slavne 2017 BW G9.jpg", clsNote: "forest road, black and white" },
  { title: "File:Scenery- Lake Scenes - DPLA - d5b2310750da8945b1b0c72181ab185d.jpg", clsNote: "lake, vintage USFS" },
];

/** Licence short names this harness accepts for fetched photos. */
const PD_LICENCES = new Set(["CC0", "Public domain"]);

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Raw = { data: Buffer; width: number; height: number; channels: 3 };

function gradient(w: number, h: number, seed: number): Raw {
  const r = rng(seed);
  const c = [0, 1, 2, 3].map(() => [r() * 255, r() * 255, r() * 255]);
  const data = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    const fy = y / (h - 1);
    for (let x = 0; x < w; x++) {
      const fx = x / (w - 1);
      for (let k = 0; k < 3; k++) {
        const top = c[0][k] * (1 - fx) + c[1][k] * fx;
        const bot = c[2][k] * (1 - fx) + c[3][k] * fx;
        data[(y * w + x) * 3 + k] = top * (1 - fy) + bot * fy;
      }
    }
  }
  return { data, width: w, height: h, channels: 3 };
}

async function shapes(w: number, h: number, seed: number): Promise<Raw> {
  const r = rng(seed);
  const col = () => `rgb(${(r() * 255) | 0},${(r() * 255) | 0},${(r() * 255) | 0})`;
  let body = `<rect width="${w}" height="${h}" fill="${col()}"/>`;
  for (let i = 0; i < 34; i++) {
    const t = r();
    const cx = r() * w, cy = r() * h, sz = (0.05 + r() * 0.25) * Math.min(w, h);
    if (t < 0.4) body += `<circle cx="${cx}" cy="${cy}" r="${sz / 2}" fill="${col()}" fill-opacity="0.85"/>`;
    else if (t < 0.75) body += `<rect x="${cx}" y="${cy}" width="${sz}" height="${sz * (0.4 + r())}" fill="${col()}" transform="rotate(${(r() * 90) | 0} ${cx} ${cy})"/>`;
    else body += `<polygon points="${cx},${cy} ${cx + sz},${cy + r() * sz} ${cx + r() * sz},${cy + sz}" fill="${col()}"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`;
  const { data, info } = await sharp(Buffer.from(svg)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: 3 };
}

export function noise(w: number, h: number, seed: number): Raw {
  const r = rng(seed);
  const octaves = [8, 24, 64].map((cells, i) => {
    const gw = cells + 2, gh = Math.max(2, Math.round((cells * h) / w)) + 2;
    const g = new Float32Array(gw * gh * 3);
    for (let k = 0; k < g.length; k++) g[k] = r();
    return { cells, gw, gh, g, amp: [0.6, 0.3, 0.1][i] };
  });
  const data = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let k = 0; k < 3; k++) {
        let v = 0;
        for (const o of octaves) {
          const fx = (x / w) * o.cells, fy = (y / h) * (o.gh - 2);
          const x0 = Math.floor(fx), y0 = Math.floor(fy);
          const tx = fx - x0, ty = fy - y0;
          const at = (xx: number, yy: number) => o.g[(yy * o.gw + xx) * 3 + k];
          const a = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
          const b = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
          v += (a * (1 - ty) + b * ty) * o.amp;
        }
        data[(y * w + x) * 3 + k] = Math.max(0, Math.min(255, v * 255));
      }
    }
  }
  return { data, width: w, height: h, channels: 3 };
}

async function text(w: number, h: number, seed: number): Promise<Raw> {
  // Blocky pseudo-glyphs: rows of random-width dark rectangles on paper.
  const r = rng(seed);
  const line = Math.max(10, Math.round(h / 22));
  let body = `<rect width="${w}" height="${h}" fill="rgb(245,240,225)"/>`;
  for (let y = line; y < h - line; y += line * 1.6) {
    let x = line;
    while (x < w - line * 3) {
      const gw = line * (0.3 + r() * 0.5);
      if (r() < 0.82) body += `<rect x="${x.toFixed(1)}" y="${(y + line * 0.2).toFixed(1)}" width="${gw.toFixed(1)}" height="${(line * (0.5 + r() * 0.4)).toFixed(1)}" fill="rgb(30,30,40)"/>`;
      x += gw + line * (r() < 0.12 ? 0.9 : 0.18);
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`;
  const { data, info } = await sharp(Buffer.from(svg)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: 3 };
}

/** Procedural "photograph": sky, sun glow, mountain ridges, film grain. */
export function photo(w: number, h: number, seed: number): Raw {
  const r = rng(seed);
  const ph = [r() * 6, r() * 6, r() * 6];
  const sunX = 0.2 + r() * 0.6, sunY = 0.15 + r() * 0.2;
  const data = Buffer.alloc(w * h * 3);
  let ns = (seed * 2654435761) >>> 0;
  for (let y = 0; y < h; y++) {
    const fy = y / h;
    for (let x = 0; x < w; x++) {
      const fx = x / w;
      let R = 90 + 120 * fy, G = 140 + 90 * fy, B = 235 - 40 * fy; // sky
      const d = Math.hypot((fx - sunX) * (w / h), fy - sunY);
      const glow = Math.exp(-d * 9);
      R += 120 * glow; G += 90 * glow; B += 20 * glow;
      if (d < 0.05) { R = 255; G = 250; B = 220; }
      const ridge = (k: number) => 0.55 + 0.1 * k + 0.06 * Math.sin(fx * (5 + 3 * k) + ph[k]) + 0.03 * Math.sin(fx * (23 + 7 * k) + ph[(k + 1) % 3]);
      if (fy > ridge(0)) { R = 70; G = 100; B = 120; }
      if (fy > ridge(1)) { R = 50; G = 90; B = 55; }
      if (fy > ridge(2)) { R = 35 + 30 * Math.sin(fx * 90 + ph[0]) ** 2; G = 70 + 40 * Math.sin(fy * 70 + ph[1]) ** 2; B = 30; }
      ns = (Math.imul(ns, 1664525) + 1013904223) >>> 0;
      const grain = ((ns >>> 24) / 255 - 0.5) * 14;
      const i = (y * w + x) * 3;
      data[i] = R + grain; data[i + 1] = G + grain; data[i + 2] = B + grain;
    }
  }
  return { data, width: w, height: h, channels: 3 };
}

export function fromRaw(raw: Raw) {
  return sharp(raw.data, { raw: { width: raw.width, height: raw.height, channels: 3 } });
}

export function encode(img: Sharp, format: BaseFormat, quality = 90): Promise<Buffer> {
  return format === "jpeg" ? img.jpeg({ quality }).toBuffer()
    : format === "png" ? img.png().toBuffer()
    : img.webp({ quality }).toBuffer();
}

/**
 * The synthetic part of the original set: 15 images, 800x600, five classes,
 * three container formats. Encoded image classes are chosen to exercise the
 * crawler's decoders (JPEG, PNG, WebP).
 */
export async function syntheticOriginals(): Promise<Original[]> {
  const out: Original[] = [];
  const specs: Array<{ kind: string; fmt: BaseFormat; note?: never }> = [];
  const kinds = ["photo", "noise", "shapes", "text", "gradient"] as const;
  const fmts: BaseFormat[] = ["jpeg", "png", "webp"];
  for (const kind of kinds)
    for (let i = 0; i < 3; i++) specs.push({ kind, fmt: fmts[i]! });
  let seed = 900;
  for (const { kind, fmt } of specs) {
    seed++;
    const raw =
      kind === "gradient" ? gradient(BASE_W, BASE_H, seed)
      : kind === "shapes" ? await shapes(BASE_W, BASE_H, seed)
      : kind === "noise" ? noise(BASE_W, BASE_H, seed)
      : kind === "text" ? await text(BASE_W, BASE_H, seed)
      : photo(BASE_W, BASE_H, seed);
    const idx = out.filter((o) => o.cls === kind).length + 1;
    out.push({ name: `syn-${kind}-${idx}.${fmt}`, cls: kind, format: fmt, buffer: await encode(fromRaw(raw), fmt) });
  }
  return out;
}

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const FETCH_UA = "AsmitaPDQRobustness/1.0 (one-time benchmark fetch of public-domain fixtures)";

type CommonsInfo = {
  descriptionUrl: string;
  thumbUrl: string;
  licence: string;
  artist: string;
};

type CommonsMeta = { extmetadata?: Record<string, { value?: string }>; descriptionurl?: string; thumburl?: string };
type CommonsPage = { imageinfo?: CommonsMeta[] };
type CommonsResponse = { query?: { pages?: Record<string, CommonsPage> } };

async function commonsInfo(title: string): Promise<CommonsInfo | null> {
  // iiprop must include "url" for iiurlwidth to add thumburl/thumbwidth to
  // the response (extmetadata alone returns neither); 1600 px keeps the
  // one-time download small.
  const url = `${COMMONS_API}?action=query&format=json&prop=imageinfo&iiprop=url%7Cextmetadata&iiurlwidth=1600&titles=${encodeURIComponent(title)}&iiextmetadatafilter=LicenseShortName%7CArtist`;
  const res = await fetch(url, { headers: { "User-Agent": FETCH_UA }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return null;
  const body = (await res.json()) as CommonsResponse;
  const info = Object.values(body.query?.pages ?? {})[0]?.imageinfo?.[0];
  if (!info?.thumburl) return null;
  const licence = (info.extmetadata?.LicenseShortName?.value ?? "").trim();
  const artist = (info.extmetadata?.Artist?.value ?? "")
    .replace(/<[^>]+>/g, "")
    .trim()
    .slice(0, 200);
  return { descriptionUrl: info.descriptionurl ?? "", thumbUrl: info.thumburl, licence, artist };
}

/**
 * Fetch the curated public-domain photographs, normalised to the 800x600 base
 * size as JPEG (a cover-crop of a 1600 px thumb, so the download stays small).
 * Returns what it could fetch; a photo whose licence is no longer PD/CC0 is
 * skipped, and a network failure skips the whole list, never throws: the
 * harness runs synthetic-only in that case and the report says so.
 */
export async function fetchCommonsPhotos(): Promise<FetchedPhoto[]> {
  const out: FetchedPhoto[] = [];
  for (let i = 0; i < COMMONS_PHOTOS.length; i++) {
    const p = COMMONS_PHOTOS[i]!;
    const name = `pd-photo-${i + 1}.jpeg`;
    try {
      const info = await commonsInfo(p.title);
      if (!info) { console.log(`skip ${name}: no API info`); continue; }
      if (!PD_LICENCES.has(info.licence)) { console.log(`skip ${name}: licence "${info.licence}" is not PD/CC0`); continue; }
      const res = await fetch(info.thumbUrl, { headers: { "User-Agent": FETCH_UA }, signal: AbortSignal.timeout(30_000) });
      if (!res.ok) { console.log(`skip ${name}: HTTP ${res.status}`); continue; }
      const bytes = Buffer.from(await res.arrayBuffer());
      const buffer = await sharp(bytes).resize(BASE_W, BASE_H, { fit: "cover" }).jpeg({ quality: 90 }).toBuffer();
      out.push({
        name, buffer, format: "jpeg",
        source: {
          title: p.title,
          descriptionUrl: info.descriptionUrl,
          fetchedUrl: info.thumbUrl,
          licence: info.licence,
          artist: info.artist,
          fetchedAt: new Date().toISOString(),
        },
      });
    } catch (e) {
      console.log(`skip ${name}: ${(e as Error).message}`);
    }
  }
  return out;
}
