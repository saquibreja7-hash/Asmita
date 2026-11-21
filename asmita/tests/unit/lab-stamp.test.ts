/*
 * WP94 (docs/lab/beta-spec.md): the stamp itself. The WP's own test: a
 * stamped image read back through the checker's reader shows the manifest.
 *
 * The signing pair is a throwaway self-signed certificate generated at
 * runtime (lab-stamp-testcert.ts) — never committed, never a real key. The
 * C2PA engine is the real one: the same WebAssembly core the on-device
 * reader at /check-image runs (@contentauth/c2pa-wasm), fetched here from
 * the site's own first-party /c2pa/c2pa.wasm exactly as the route does.
 *
 * The read-back is the checker's own pipeline: WasmReader.fromBytes — the
 * same Rust core @contentauth/c2pa-web wraps in the browser — and then
 * summarizeManifestStore from src/lib/c2pa-credentials.ts, the exact mapper
 * the /check-image page renders. All test images are synthetic.
 */

import { beforeAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import zlib from "node:zlib";
import jpeg from "jpeg-js";
import { WasmReader } from "@contentauth/c2pa-wasm";
import { summarizeManifestStore } from "@/lib/c2pa-credentials";
import { createCoseSigner } from "@/lib/lab/stamp/cose";
import { stampImage, stampDownloadName } from "@/lib/lab/stamp/stamp";
import { generateTestSigningPair } from "./lab-stamp-testcert";

const require = createRequire(import.meta.url);
const engineWasm = readFileSync(
  path.join(path.dirname(require.resolve("@contentauth/c2pa-wasm/package.json")), "pkg", "c2pa_bg.wasm"),
);
const ORIGIN = "https://asmita.test";

/** A small synthetic JPEG: a plain machine-made colour gradient, no person. */
function syntheticJpeg(width = 96, height = 96): Uint8Array {
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    pixels[i * 4] = (i * 7) % 255;
    pixels[i * 4 + 1] = (i * 13) % 255;
    pixels[i * 4 + 2] = (i * 29) % 255;
    pixels[i * 4 + 3] = 255;
  }
  return new Uint8Array(jpeg.encode({ data: pixels, width, height }, 90).data);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = -1;
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ -1) >>> 0;
}

function pngChunk(type: string, body: Uint8Array): Uint8Array {
  const head = Buffer.concat([Buffer.from(type, "ascii"), Buffer.from(body)]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(head));
  return new Uint8Array(Buffer.concat([length, head, crc]));
}

/** A small synthetic PNG: solid colour rows, no person, encoded by hand. */
function syntheticPng(width = 64, height = 64): Uint8Array {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  const rows = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 3);
    rows[row] = 0; // no filter
    for (let x = 0; x < width; x += 1) {
      rows[row + 1 + x * 3] = (x * 5) % 255;
      rows[row + 2 + x * 3] = (y * 3) % 255;
      rows[row + 3 + x * 3] = 128;
    }
  }
  const idat = zlib.deflateSync(rows);
  return new Uint8Array(Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", new Uint8Array(0)),
  ]));
}

let signingPair: { certPem: string; keyPem: string };

describe("the Content Credentials stamp (WP94)", () => {
  beforeEach(() => {
    vi.stubEnv("ENABLE_LAB", "true");
    vi.stubEnv("LAB_C2PA_CERT", signingPair.certPem);
    vi.stubEnv("LAB_C2PA_KEY", signingPair.keyPem);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(engineWasm, { headers: { "content-type": "application/wasm" } })));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  beforeAll(() => {
    signingPair = generateTestSigningPair();
  });

  it("refuses to stamp when the environment carries no signing pair", async () => {
    vi.stubEnv("LAB_C2PA_CERT", "");
    vi.stubEnv("LAB_C2PA_KEY", "");
    await expect(stampImage(ORIGIN, { bytes: syntheticJpeg(), type: "image/jpeg" })).rejects.toMatchObject({
      message: "signing_not_configured",
    });
  });

  it("a stamped JPEG read back through the checker's reader shows the manifest", async () => {
    const original = syntheticJpeg();
    const result = await stampImage(ORIGIN, {
      bytes: original,
      type: "image/jpeg",
      creatorName: "Test Creator Name",
    });

    // The image is still the image, now carrying the manifest.
    expect([...result.bytes.slice(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    expect(result.bytes.byteLength).toBeGreaterThan(original.byteLength);
    expect(Buffer.from(result.bytes).includes(Buffer.from("c2pa", "ascii"))).toBe(true);

    // Read back through the checker's reader pipeline.
    const reader = await WasmReader.fromBytes("image/jpeg", result.bytes as unknown as Uint8Array<ArrayBuffer>);
    const store = reader.manifestStore() as {
      active_manifest: string;
      validation_state: string;
      validation_status?: { code: string; explanation: string }[];
      manifests: Record<string, Record<string, unknown>>;
    };
    const manifest = store.manifests[store.active_manifest] as {
      claim_generator_info: { name: string }[];
      assertions: { label: string; data?: Record<string, unknown> }[];
      signature_info: { common_name: string };
    };

    // The signature itself validates; the only note is the honest one about
    // the self-signed test certificate, exactly like the repo's c2patool
    // fixture (an untrusted signer still validates as Valid).
    expect(store.validation_state).toBe("Valid");
    const codes = (store.validation_status ?? []).map((entry) => entry.code);
    expect(codes).toEqual(["signingCredential.untrusted"]);

    expect(manifest.claim_generator_info[0].name).toBe("Meri Asmita Lab");
    expect(manifest.signature_info.common_name).toBe("Asmita Lab Test Signer");

    const byLabel = new Map(manifest.assertions.map((assertion) => [assertion.label, assertion.data]));
    // The do-not-train statement: every use the CAWG assertion governs.
    const training = byLabel.get("cawg.training-mining") as {
      entries: Record<string, { use: string }>;
    };
    for (const key of ["cawg.ai_generative_training", "cawg.ai_training", "cawg.ai_inference", "cawg.data_mining"]) {
      expect(training.entries[key]).toEqual({ use: "notAllowed" });
    }
    // The typed creator name, as the CreativeWork author.
    const creative = byLabel.get("stds.schema-org.CreativeWork") as {
      author: { "@type": string; name: string }[];
    };
    expect(creative.author).toEqual([{ "@type": "Person", name: "Test Creator Name" }]);
    // The timestamp, on the c2pa.created action.
    const actions = byLabel.get("c2pa.actions.v2") as { actions: { action: string; when: string }[] };
    expect(actions.actions[0].action).toBe("c2pa.created");
    expect(actions.actions[0].when).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // And the exact mapper the /check-image page renders:
    const summary = summarizeManifestStore(store);
    expect(summary.status).toBe("found");
    expect(summary.tool).toContain("Meri_Asmita_Lab");
    expect(summary.signer).toBe("Asmita Lab Test Signer");
    expect(summary.signatureValidated).toBe(true);
    expect(summary.raw.validationState).toBe("Valid");
  });

  it("works without a creator name: no CreativeWork assertion is added", async () => {
    const result = await stampImage(ORIGIN, { bytes: syntheticJpeg(), type: "image/jpeg" });
    const reader = await WasmReader.fromBytes("image/jpeg", result.bytes as unknown as Uint8Array<ArrayBuffer>);
    const store = reader.manifestStore() as { active_manifest: string; manifests: Record<string, { assertions: { label: string }[] }> };
    const labels = store.manifests[store.active_manifest].assertions.map((a) => a.label);
    expect(labels).toContain("cawg.training-mining");
    expect(labels).not.toContain("stds.schema-org.CreativeWork");
  });

  it("stamps a PNG too, and it reads back the same way", async () => {
    const original = syntheticPng();
    const result = await stampImage(ORIGIN, { bytes: original, type: "image/png", creatorName: "PNG Test" });
    expect([...result.bytes.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const reader = await WasmReader.fromBytes("image/png", result.bytes as unknown as Uint8Array<ArrayBuffer>);
    const store = reader.manifestStore() as { validation_state: string };
    expect(store.validation_state).toBe("Valid");
    expect(stampDownloadName("image/png")).toBe("content-credentials.png");
  });

  it("loads the engine only from the site's own first-party /c2pa/c2pa.wasm", async () => {
    // A fresh module registry: the engine loads once per process, and the
    // earlier tests already loaded it.
    vi.resetModules();
    const { stampImage: freshStampImage } = await import("@/lib/lab/stamp/stamp");
    await freshStampImage(ORIGIN, { bytes: syntheticJpeg(), type: "image/jpeg" });
    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map(([url]) => String(url));
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((url) => url === `${ORIGIN}/c2pa/c2pa.wasm`)).toBe(true);
  });

  it("the COSE signer returns exactly reserveSize bytes, so the hash exclusion matches", async () => {
    const signer = await createCoseSigner(signingPair.certPem, signingPair.keyPem);
    const claim = new TextEncoder().encode("claim-bytes-for-the-signature-test");
    const signature = await signer.sign(claim);
    expect(signature.byteLength).toBe(signer.reserveSize);
    expect(signature[0]).toBe(0xd2); // CBOR tag 18: a COSE_Sign1
  });
});
