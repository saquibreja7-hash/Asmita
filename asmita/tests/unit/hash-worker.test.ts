import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decode } from "jpeg-js";
import { describe, expect, it } from "vitest";
import { computePdqHash, PDQ_HASH_PATTERN, type PdqInput } from "@/lib/pdq/pdq";
import { handleHashRequest, hashPixels, type HashWorkerContext } from "@/lib/pdq/hash-protocol";

// Web audit WP42: image and video PDQ hashing moved into a Web Worker. The
// worker's message handler is a pure module (hash-protocol.ts), so these
// tests drive it in Node with the same Meta reference vectors the direct
// function is pinned to (pdq-reference-vectors.test.ts) and assert the
// handler returns bit-identical hashes. Source pins below guard the wiring:
// the lazy load (P13), the worker request kinds and the main-thread fallback.

const FIXTURES = join(__dirname, "..", "fixtures", "pdq");

const REFERENCE_FILES = [
  "bridge-1-original.jpg",
  "bridge-2-rotate-90.jpg",
  "bridge-3-rotate-180.jpg",
  "bridge-4-rotate-270.jpg",
  "bridge-5-flipx.jpg",
  "bridge-6-flipy.jpg",
  "bridge-7-flip-plus-1.jpg",
  "bridge-8-flip-minus-1.jpg",
];

function loadImage(file: string): PdqInput {
  const jpegData = readFileSync(join(FIXTURES, file));
  const decoded = decode(jpegData, { useTArray: true, formatAsRGBA: true });
  return { data: decoded.data, width: decoded.width, height: decoded.height };
}

function readSource(relative: string) {
  return readFileSync(join(__dirname, "..", "..", "src", relative), "utf8");
}

// A stub of the worker's DOM steps: pixels are handed over directly and every
// bitmap close is recorded, so the tests can pin the memory rule.
function stubContext(pixels: PdqInput) {
  const closed: string[] = [];
  const ctx: HashWorkerContext = {
    async decodeFile() {
      return { close: () => closed.push("file") } as unknown as ImageBitmap;
    },
    bitmapToPixels() {
      if (closed.length > 0) throw new Error("bitmap already closed");
      return pixels;
    },
  };
  return { ctx, closed };
}

describe("hash worker message handler (reference vectors)", () => {
  for (const file of REFERENCE_FILES) {
    it(`returns the direct function's hash for ${file}`, async () => {
      const pixels = loadImage(file);
      const direct = computePdqHash(pixels);
      const { ctx } = stubContext(pixels);
      const reply = await handleHashRequest({ id: 41, kind: "pixels", input: pixels }, ctx);
      expect(reply).toEqual({ id: 41, ok: true, hash: direct.hash, quality: direct.quality });
      // And the handler's hash is a real PDQ hash in the reference's
      // neighbourhood (the direct function's gate is <= 2 bits).
      expect(reply && reply.ok ? reply.hash : "").toMatch(PDQ_HASH_PATTERN);
    });
  }

  it("hashes a request that arrived as a file exactly like the direct function", async () => {
    const pixels = loadImage("bridge-1-original.jpg");
    const direct = computePdqHash(pixels);
    const { ctx, closed } = stubContext(pixels);
    const reply = await handleHashRequest({ id: 1, kind: "file", file: {} as File }, ctx);
    expect(reply).toEqual({ id: 1, ok: true, hash: direct.hash, quality: direct.quality });
    // The decoded bitmap is the worker's to free.
    expect(closed).toEqual(["file"]);
  });

  it("hashes a request that arrived as a bitmap exactly like the direct function", async () => {
    const pixels = loadImage("bridge-5-flipx.jpg");
    const direct = computePdqHash(pixels);
    const { ctx, closed } = stubContext(pixels);
    const bitmap = { close: () => closed.push("bitmap") } as unknown as ImageBitmap;
    const reply = await handleHashRequest({ id: 2, kind: "bitmap", bitmap }, ctx);
    expect(reply).toEqual({ id: 2, ok: true, hash: direct.hash, quality: direct.quality });
    expect(closed).toEqual(["bitmap"]);
  });
});

describe("hash worker error replies", () => {
  it("reports a fixed decode_failed code, never error text", async () => {
    const ctx: HashWorkerContext = {
      async decodeFile() {
        throw new Error("secret bytes in here");
      },
      bitmapToPixels() {
        throw new Error("unreachable");
      },
    };
    const reply = await handleHashRequest({ id: 3, kind: "file", file: {} as File }, ctx);
    expect(reply).toEqual({ id: 3, ok: false, code: "decode_failed" });
  });

  it("reports hash_failed when the pixels cannot be hashed, and still frees the bitmap", async () => {
    const closed: string[] = [];
    const ctx: HashWorkerContext = {
      async decodeFile() {
        return { close: () => closed.push("file") } as unknown as ImageBitmap;
      },
      bitmapToPixels() {
        throw new Error("offscreen canvas unavailable");
      },
    };
    const reply = await handleHashRequest({ id: 4, kind: "file", file: {} as File }, ctx);
    expect(reply).toEqual({ id: 4, ok: false, code: "hash_failed" });
    expect(closed).toEqual(["file"]);

    const bitmap = { close: () => closed.push("bitmap") } as unknown as ImageBitmap;
    const reply2 = await handleHashRequest({ id: 5, kind: "bitmap", bitmap }, ctx);
    expect(reply2).toEqual({ id: 5, ok: false, code: "hash_failed" });
    expect(closed).toEqual(["file", "bitmap"]);
  });

  it("reports hash_failed for unhashable pixels", () => {
    // Below PDQ's minimum hashable dimension (5): refused.
    expect(hashPixels(6, { data: new Uint8ClampedArray(4 * 4 * 4), width: 4, height: 4 })).toEqual({
      id: 6,
      ok: false,
      code: "hash_failed",
    });
    // The data length must match width * height * 4 exactly.
    expect(hashPixels(7, { data: new Uint8ClampedArray(10), width: 100, height: 100 })).toEqual({
      id: 7,
      ok: false,
      code: "hash_failed",
    });
  });

  it("refuses malformed messages without acting on them", async () => {
    const { ctx } = stubContext({ data: new Uint8ClampedArray(0), width: 0, height: 0 });
    // No id: nothing to key a reply to.
    expect(await handleHashRequest({ kind: "pixels" }, ctx)).toBeNull();
    expect(await handleHashRequest(null, ctx)).toBeNull();
    expect(await handleHashRequest("pixels", ctx)).toBeNull();
    expect(await handleHashRequest({ id: -1, kind: "pixels" }, ctx)).toBeNull();
    expect(await handleHashRequest({ id: 1.5, kind: "pixels" }, ctx)).toBeNull();
    // An id but an unknown kind: answered with the fixed refusal, so the
    // request can never hang.
    expect(await handleHashRequest({ id: 8, kind: "video" }, ctx)).toEqual({ id: 8, ok: false, code: "bad_request" });
    expect(await handleHashRequest({ id: 9 }, ctx)).toEqual({ id: 9, ok: false, code: "bad_request" });
    expect(await handleHashRequest({ id: 10, kind: "file" }, ctx)).toEqual({ id: 10, ok: false, code: "bad_request" });
    expect(await handleHashRequest({ id: 11, kind: "bitmap" }, ctx)).toEqual({ id: 11, ok: false, code: "bad_request" });
  });
});

describe("hash worker replies carry no media", () => {
  it("serializes to exactly the id, the ok flag, the hash and the quality", async () => {
    const pixels = loadImage("bridge-1-original.jpg");
    const direct = computePdqHash(pixels);
    const bitmap = { close: () => {} } as unknown as ImageBitmap;
    const requests = [
      { id: 20, kind: "pixels", input: pixels },
      { id: 21, kind: "file", file: {} as File },
      { id: 22, kind: "bitmap", bitmap },
    ];
    for (const request of requests) {
      const { ctx } = stubContext(pixels);
      const reply = await handleHashRequest(request, ctx);
      expect(reply).toBeTruthy();
      const keys = Object.keys(reply!).sort();
      if (reply!.ok) expect(keys).toEqual(["hash", "id", "ok", "quality"]);
      else expect(keys).toEqual(["code", "id", "ok"]);
      const json = JSON.stringify(reply);
      expect(json).not.toContain("data:");
      expect(json).not.toContain("base64");
      expect(json).not.toContain("pixels");
    }
    // The only string payload is the 64-hex hash.
    expect(direct.hash).toMatch(PDQ_HASH_PATTERN);
  });
});

describe("hash worker wiring (source pins, WP42 P1/P2/P13)", () => {
  it("loads the worker lazily as a module worker from a real file URL", () => {
    const client = readSource("lib/pdq/hash-client.ts");
    expect(client).toContain('new Worker(new URL("./hash.worker.ts", import.meta.url), { type: "module" })');
    // The client posts only the file and bitmap kinds; video frames are
    // transferred, not copied.
    expect(client).toContain("hashBitmap(bitmap: ImageBitmap): Promise<PdqResult>");
    expect(client).toContain("this.post({ kind: \"bitmap\", bitmap }, [bitmap])");
    expect(client).toContain("this.post({ kind: \"file\", file })");
  });

  it("keeps SubmitForm free of static pdq imports and loads the entry only when a file is chosen", () => {
    const form = readSource("app/(auth)/submit/SubmitForm.tsx");
    // Every reference to the pdq modules must be the single type-only
    // import (erased at build time) or the lazy hash-file import.
    const references = form.match(/from "@\/lib\/pdq\/(pdq|vpdq)"/g) ?? [];
    expect(references).toEqual(['from "@/lib/pdq/vpdq"']);
    expect(form).toContain('import type { VideoFrameHash, VpdqErrorCode } from "@/lib/pdq/vpdq";');
    expect(form).toContain('await import("@/lib/pdq/hash-file")');
  });

  it("hashes video frames in the worker and keeps the main-thread fallback", () => {
    const vpdq = readSource("lib/pdq/vpdq.ts");
    // Frame selection is unchanged: the same seeks, seconds and draw.
    expect(vpdq).toContain("ctx.drawImage(video, 0, 0, width, height)");
    expect(vpdq).toContain("const times = sampleTimes(duration)");
    // The frame goes to the worker as a transferable ImageBitmap...
    expect(vpdq).toContain("createImageBitmap(ctx.canvas)");
    expect(vpdq).toContain("hashBitmapInWorker(bitmap)");
    // ...and where no worker can run, the frame is hashed where it was drawn.
    expect(vpdq).toContain("return computePdqHash(ctx.getImageData(0, 0, width, height));");
  });

  it("keeps the image fallback on the same full-resolution path", () => {
    const entry = readSource("lib/pdq/hash-file.ts");
    expect(entry).toContain("hashFileInWorker(file)");
    expect(entry).toContain("ctx.getImageData(0, 0, bitmap.width, bitmap.height)");
    expect(entry).toContain("canvas.width = 0");
  });

  it("allows the same-origin worker in the CSP, a blob worker only on the C2PA pages", () => {
    const csp = readSource("lib/csp.ts");
    // WP42: the PDQ hashing worker is a real same-origin script the bundler
    // emits, so the policy's worker-src is 'self'. WP38 (merged with WP42)
    // keeps blob: for the C2PA engine's inline development worker, behind
    // the c2pa flag only — never on the pages the hashing worker runs on.
    expect(csp).toContain("\"worker-src 'self'\"");
    expect(csp).toContain("...(c2pa ? [\"worker-src 'self' blob:\"] : [\"worker-src 'self'\"]),");
  });
});
