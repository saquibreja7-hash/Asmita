/**
 * Synthetic, non-intimate fixture generator. Everything is produced in code
 * from a seeded PRNG: gradients, vector shapes, value-noise textures,
 * pseudo-text (blocky glyph rectangles, no fonts needed) and a procedural
 * "photo-like" landscape. No external images are used.
 */
import sharp from "sharp";

export type Fixture = {
  name: string;
  /** Image class used for the "which classes disagree" breakdown. */
  cls: string;
  format: "jpeg" | "png" | "webp";
  mime: string;
  buffer: Buffer;
  /** For transformed copies: name of the original fixture. */
  originalOf?: string;
  transform?: string;
};

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

type Raw = { data: Buffer; width: number; height: number; channels: 3 | 4 };

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
  for (let i = 0; i < 28; i++) {
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

function noise(w: number, h: number, seed: number): Raw {
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

function photo(w: number, h: number, seed: number, alpha = false): Raw {
  const r = rng(seed);
  const ph = [r() * 6, r() * 6, r() * 6];
  const sunX = 0.2 + r() * 0.6, sunY = 0.15 + r() * 0.2;
  const ch = alpha ? 4 : 3;
  const data = Buffer.alloc(w * h * ch);
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
      const i = (y * w + x) * ch;
      data[i] = R + grain; data[i + 1] = G + grain; data[i + 2] = B + grain;
      if (alpha) data[i + 3] = Math.round(255 * Math.min(1, 0.15 + 1.4 * Math.sin(Math.PI * fx) ** 0.5 * (1 - 0.4 * fy)));
    }
  }
  return { data, width: w, height: h, channels: ch as 3 | 4 };
}

function fromRaw(raw: Raw) {
  return sharp(raw.data, { raw: { width: raw.width, height: raw.height, channels: raw.channels } });
}

const MIME = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;

export async function generateFixtures(): Promise<Fixture[]> {
  const out: Fixture[] = [];
  const add = (name: string, cls: string, format: Fixture["format"], buffer: Buffer, extra: Partial<Fixture> = {}) =>
    out.push({ name, cls, format, mime: MIME[format], buffer, ...extra });
  const enc = async (img: sharp.Sharp, format: Fixture["format"], q = 90) =>
    format === "jpeg" ? img.jpeg({ quality: q }).toBuffer()
    : format === "png" ? img.png().toBuffer()
    : img.webp({ quality: q }).toBuffer();

  // ---- base images: kind x size x format ----
  const bases: Array<[string, number, number, Fixture["format"]]> = [
    ["gradient", 128, 128, "png"], ["gradient", 1024, 768, "jpeg"],
    ["shapes", 256, 256, "png"], ["shapes", 640, 480, "webp"], ["shapes", 1600, 1200, "jpeg"],
    ["noise", 512, 512, "png"], ["noise", 1024, 1024, "webp"], ["noise", 2048, 1536, "jpeg"],
    ["text", 800, 600, "png"], ["text", 1920, 1080, "jpeg"],
    ["photo", 128, 96, "jpeg"], ["photo", 640, 480, "jpeg"], ["photo", 1024, 768, "webp"],
    ["photo", 1200, 1600, "jpeg"], ["photo", 2048, 1536, "jpeg"], ["photo", 3000, 2000, "png"],
    ["photo", 4000, 3000, "jpeg"],
  ];
  let seed = 100;
  const rawFor = async (kind: string, w: number, h: number, s: number): Promise<Raw> =>
    kind === "gradient" ? gradient(w, h, s) : kind === "shapes" ? shapes(w, h, s)
    : kind === "noise" ? noise(w, h, s) : kind === "text" ? text(w, h, s) : photo(w, h, s);

  for (const [kind, w, h, fmt] of bases) {
    seed++;
    add(`${kind}-${w}x${h}.${fmt}`, kind, fmt, await enc(fromRaw(await rawFor(kind, w, h, seed)), fmt));
  }

  // ---- format / colour / orientation variants (on 800x600 photo + shapes) ----
  const p = photo(800, 600, 777);
  const sh = await shapes(800, 600, 778);
  const jpgBuf = await fromRaw(p).jpeg({ quality: 92 }).toBuffer();
  for (const o of [2, 3, 6, 8]) {
    // Pixels are stored unrotated; the EXIF tag asks the viewer to rotate.
    add(`photo-exif-orient${o}.jpeg`, "exif", "jpeg", await sharp(jpgBuf).withMetadata({ orientation: o }).jpeg({ quality: 92 }).toBuffer());
  }
  add("photo-exif-orient6-shapes.jpeg", "exif", "jpeg", await fromRaw(sh).withMetadata({ orientation: 6 }).jpeg({ quality: 90 }).toBuffer());
  add("photo-cmyk.jpeg", "cmyk", "jpeg", await fromRaw(p).toColourspace("cmyk").jpeg({ quality: 92 }).toBuffer());
  add("shapes-cmyk.jpeg", "cmyk", "jpeg", await fromRaw(sh).toColourspace("cmyk").jpeg({ quality: 92 }).toBuffer());
  add("photo-cmyk-icc.jpeg", "cmyk", "jpeg", await fromRaw(p).toColourspace("cmyk").withIccProfile("cmyk").jpeg({ quality: 92 }).toBuffer());
  add("photo-grey.jpeg", "greyscale", "jpeg", await fromRaw(p).greyscale().jpeg({ quality: 90 }).toBuffer());
  add("photo-grey.png", "greyscale", "png", await fromRaw(p).greyscale().png().toBuffer());
  add("photo-grey.webp", "greyscale", "webp", await fromRaw(p).greyscale().webp({ quality: 90 }).toBuffer());
  add("photo-palette.png", "palette", "png", await fromRaw(p).png({ palette: true, colours: 64 }).toBuffer());
  add("photo-444-q95.jpeg", "jpeg-variant", "jpeg", await fromRaw(p).jpeg({ quality: 95, chromaSubsampling: "4:4:4" }).toBuffer());
  add("photo-progressive-q70.jpeg", "jpeg-variant", "jpeg", await fromRaw(p).jpeg({ quality: 70, progressive: true }).toBuffer());
  const pa = photo(800, 600, 779, true);
  add("photo-alpha.png", "alpha", "png", await fromRaw(pa).png().toBuffer());
  add("photo-alpha.webp", "alpha", "webp", await fromRaw(pa).webp({ quality: 90 }).toBuffer());
  // Fully transparent corner pixels with non-zero RGB (canvas zeroes these).
  const pz = Buffer.from(pa.data);
  for (let y = 0; y < 150; y++) for (let x = 0; x < 150; x++) pz[(y * 800 + x) * 4 + 3] = 0;
  add("photo-alpha-holes.png", "alpha", "png", await sharp(pz, { raw: { width: 800, height: 600, channels: 4 } }).png().toBuffer());

  // ---- transformed copies: recompress, resize, crop ----
  const sources = out.filter((f) =>
    ["photo-640x480.jpeg", "photo-2048x1536.jpeg", "photo-1024x768.webp", "shapes-1600x1200.jpeg",
     "text-1920x1080.jpeg", "noise-2048x1536.jpeg", "gradient-1024x768.jpeg", "photo-1200x1600.jpeg",
     "photo-exif-orient6.jpeg", "photo-4000x3000.jpeg"].includes(f.name));
  for (const f of sources) {
    const meta = await sharp(f.buffer).metadata();
    const w = meta.width!, h = meta.height!;
    const base = f.name.replace(/\.\w+$/, "");
    const mk = (tag: string, buf: Buffer, fmt: Fixture["format"]) =>
      add(`${base}~${tag}.${fmt}`, "transformed", fmt, buf, { originalOf: f.name, transform: tag });
    // Order matters for EXIF originals: apply orientation first so the copy is upright.
    const up = () => sharp(f.buffer).rotate();
    mk("recompress-q60", await up().jpeg({ quality: 60 }).toBuffer(), "jpeg");
    mk("recompress-q80", await up().jpeg({ quality: 80 }).toBuffer(), "jpeg");
    mk("resize-50pct", await up().resize(Math.max(64, Math.round(w / 2)), null, { kernel: "lanczos3" }).jpeg({ quality: 85 }).toBuffer(), "jpeg");
    const cw = Math.round((meta.orientation && meta.orientation >= 5 ? h : w) * 0.94);
    const ch = Math.round((meta.orientation && meta.orientation >= 5 ? w : h) * 0.94);
    mk("crop-3pct+webp", await up().extract({ left: Math.round(cw * 0.03), top: Math.round(ch * 0.03), width: cw, height: ch }).webp({ quality: 85 }).toBuffer(), "webp");
  }
  return out;
}
