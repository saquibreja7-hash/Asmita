/*
 * The evidence PDF builder's tests (E3, WP76): the content builder carries
 * the whole document and refuses text pdf-lib cannot draw; the assembled PDF
 * loads with the two images embedded. Runs in Node because pdf-lib is
 * isomorphic — the browser runs the same builder.
 */
import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { deflateSync } from "node:zlib";
import {
  buildEvidenceContent,
  buildEvidencePdf,
  EvidencePdfTextError,
  type EvidencePdfInput,
} from "@/lib/lab/trace/pdf";

// A minimal PNG encoder: 2x2 (or w x h) truecolour, filter 0 — enough for
// pdf-lib's embedPng, built in-test so no binary fixture is ever committed.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function makePng(width: number, height: number, shade: number): Uint8Array {
  const raw = new Uint8Array(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 3)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const p = y * (1 + width * 3) + 1 + x * 3;
      raw[p] = (x * 40 + shade) % 256;
      raw[p + 1] = (y * 60 + shade) % 256;
      raw[p + 2] = shade;
    }
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunks = [
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", new Uint8Array(deflateSync(raw))),
    pngChunk("IEND", new Uint8Array(0)),
  ];
  const total = signature.length + chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  out.set(signature);
  let at = signature.length;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

const input: EvidencePdfInput = {
  generatedAt: "21 November 2026, 10:30 UTC",
  toolVersion: "trace-1.0.0",
  verdictLine: "Verdict: Strong evidence of a shared source",
  explanationLines: [
    "Several independent measures agree that this image and the original share a source.",
    "A shared source means the pixels overlap - nothing more.",
  ],
  scores: [
    { label: "Whole image (PDQ distance)", value: "8 (quality 82/79)" },
    { label: "Model similarity (SSCD cosine)", value: "0.941" },
    { label: "Matching area after alignment", value: "93%" },
  ],
  methodLines: [
    "Each image is hashed with PDQ and the distance between hashes measures similarity.",
    "The face region and the background are compared separately.",
  ],
  suspect: {
    caption: "Suspect image - invented-fixture.png",
    png: makePng(2, 2, 30),
    size: { width: 2, height: 2 },
    highlight: { x: 0, y: 0, w: 1, h: 1 },
  },
  original: {
    caption: "Original image - invented-original.png",
    png: makePng(3, 2, 200),
    size: { width: 3, height: 2 },
    highlight: null,
  },
};

describe("evidence pdf content builder", () => {
  it("carries the title, meta, verdict, scores, method and the disclaimer", () => {
    const content = buildEvidenceContent(input);
    expect(content.title).toBe("Morph-to-source trace - evidence report");
    expect(content.meta[0]).toContain("21 November 2026");
    expect(content.meta[1]).toContain("trace-1.0.0");
    expect(content.verdictLine).toContain("Strong evidence");
    expect(content.scores).toHaveLength(3);
    expect(content.methodLines).toHaveLength(2);
    expect(content.disclaimer).toContain("not part of any complaint filing");
    expect(content.images).toEqual([input.suspect, input.original]);
  });

  it("refuses text the PDF font cannot draw, naming the field only", () => {
    const devanagari = { ...input, verdictLine: "फ़ैसला: प्रबल सबूत" };
    try {
      buildEvidenceContent(devanagari);
      expect.unreachable("Devanagari must be refused before pdf-lib throws");
    } catch (err) {
      expect(err).toBeInstanceOf(EvidencePdfTextError);
      expect((err as EvidencePdfTextError).field).toBe("verdictLine");
      expect((err as EvidencePdfTextError).message).not.toContain("प्रबल");
    }
  });

  it("refuses a non-WinAnsi score row too", () => {
    const bad = { ...input, scores: [{ label: "गुणवत्ता", value: "—" }] };
    expect(() => buildEvidenceContent(bad)).toThrow(EvidencePdfTextError);
  });
});

describe("evidence pdf assembly", () => {
  it("builds a loadable PDF with the two images embedded", async () => {
    const bytes = await buildEvidencePdf(input);
    expect(bytes.byteLength).toBeGreaterThan(2000);
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    // Two embedded PNGs: pdf-lib stores them as XObject image streams.
    const images = doc.context
      .enumerateIndirectObjects()
      .filter(([, obj]) => obj instanceof PDFRawStream && String(obj.dict.lookup(PDFName.of("Subtype"))).includes("Image"));
    expect(images.length).toBeGreaterThanOrEqual(2);
  });

  it("scales the drawn images into the layout boxes", async () => {
    // A tall image must not push past the reserved band: the build completes
    // and stays multi-page-max sane with awkward aspect ratios.
    const tall: EvidencePdfInput = {
      ...input,
      suspect: { ...input.suspect, png: makePng(2, 9, 5), size: { width: 2, height: 9 } },
    };
    const bytes = await buildEvidencePdf(tall);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeLessThanOrEqual(3);
  });
});
