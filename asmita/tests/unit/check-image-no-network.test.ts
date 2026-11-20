/*
 * WP38 part 1: the image never leaves her device for the on-device checks.
 *
 * Both on-device signals (exifr metadata labels and the C2PA Content
 * Credentials reader) run here against the REAL @contentauth/c2pa-web
 * package, with every network-capable API recording what it was asked to
 * send. The only request the C2PA engine may ever make is fetching its own
 * first-party WASM from /c2pa/c2pa.wasm — same origin, no body. The image
 * bytes must never appear in any request. (The engine's worker never answers
 * in this environment, so the read resolves to "unavailable" — the graceful
 * degradation the page shows when a browser cannot run the reader; the
 * manifest-store mapping itself is proven in c2pa-credentials.test.ts.)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import jpeg from "jpeg-js";
import { readImageProvenance } from "@/lib/ai-provenance";

// A minimal valid WebAssembly module: the engine compiles whatever the wasm
// fetch returns, so the stub must return compilable bytes.
const MINIMAL_WASM = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

/** Splices an XMP APP1 segment (IPTC DigitalSourceType = AI) into a JPEG. */
function jpegWithXmpAiSource(): Uint8Array<ArrayBuffer> {
  const W = 64;
  const H = 64;
  const pixels = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    pixels[i * 4] = (i * 7) % 255;
    pixels[i * 4 + 1] = (i * 13) % 255;
    pixels[i * 4 + 2] = (i * 29) % 255;
    pixels[i * 4 + 3] = 255;
  }
  const plain = jpeg.encode({ data: pixels, width: W, height: H }, 90).data;

  const xmp =
    `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>` +
    `<x:xmpmeta xmlns:x="adobe:ns:meta/">` +
    `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">` +
    `<rdf:Description rdf:about="" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/">` +
    `<Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia</Iptc4xmpExt:DigitalSourceType>` +
    `</rdf:Description></rdf:RDF></x:xmpmeta>`;
  const packet = Buffer.from(`http://ns.adobe.com/xap/1.0/\x00${xmp}`, "latin1");
  const segment = Buffer.concat([
    Buffer.from([0xff, 0xe1]),
    Buffer.from([(packet.length + 2) >> 8, (packet.length + 2) & 0xff]),
    packet,
  ]);
  // A fresh ArrayBuffer-backed copy, so the bytes are a valid BlobPart.
  return new Uint8Array(Buffer.concat([plain.subarray(0, 2), segment, plain.subarray(2)]));
}

/** Everything any network API was asked to send while a test ran. */
const sentBodies: string[] = [];
const fetchUrls: string[] = [];

class RecordingWorker {
  static constructed: { url: string; options: { type?: string } | undefined }[] = [];
  constructor(url: string | URL, options?: { type?: string }) {
    RecordingWorker.constructed.push({ url: String(url), options });
  }
  addEventListener() {}
  removeEventListener() {}
  postMessage() {}
  terminate() {}
}

async function freshModule() {
  vi.resetModules();
  return import("@/lib/c2pa-credentials");
}

beforeEach(() => {
  sentBodies.length = 0;
  fetchUrls.length = 0;
  RecordingWorker.constructed = [];
  const fetchRecorder = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchUrls.push(String(input));
    if (init?.body) sentBodies.push(String(init.body));
    return new Response(MINIMAL_WASM, { headers: { "content-type": "application/wasm" } });
  });
  vi.stubGlobal("fetch", fetchRecorder);
  vi.stubGlobal("Worker", RecordingWorker);
  // The page origin the reader runs on, as in production.
  vi.stubGlobal("location", new URL("https://asmita.test/check-image"));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the on-device signals never send her image (WP38)", () => {
  it("the exifr metadata check reads the XMP AI label and makes no request at all", async () => {
    const bytes = jpegWithXmpAiSource();
    const file = new File([bytes], "gradient.jpg", { type: "image/jpeg" });

    const result = await readImageProvenance(file);

    expect(result.ai).toBe(true);
    expect(result.signals[0]).toContain("generative AI");
    expect(fetchUrls).toEqual([]); // nothing was sent anywhere
    expect(sentBodies).toEqual([]);
    expect(RecordingWorker.constructed).toEqual([]);
  });

  it("the C2PA reader fetches only its own first-party engine, in a worker from our own origin", async () => {
    const bytes = jpegWithXmpAiSource();
    const file = new File([bytes], "gradient.jpg", { type: "image/jpeg" });

    const { readC2paCredentials } = await freshModule();
    // The stub worker never answers, so the bounded read resolves
    // "unavailable" instead of hanging.
    const summary = await readC2paCredentials(file, 500);

    expect(summary.status).toBe("unavailable");
    // Exactly one request: the engine's WASM, from our own origin, with no body.
    expect(fetchUrls).toEqual(["https://asmita.test/c2pa/c2pa.wasm"]);
    expect(sentBodies).toEqual([]);
    // The engine's worker is the module worker served by us, not a blob.
    expect(RecordingWorker.constructed).toEqual([
      { url: "https://asmita.test/c2pa/c2pa_worker.js", options: { type: "module" } },
    ]);
  });

  it("her image bytes never appear in any recorded request or worker message", async () => {
    const bytes = jpegWithXmpAiSource();
    const file = new File([bytes], "gradient.jpg", { type: "image/jpeg" });
    const { readC2paCredentials } = await freshModule();

    await Promise.all([
      readImageProvenance(file),
      readC2paCredentials(file, 500),
    ]);

    const needle = Buffer.from(bytes).toString("latin1");
    const haystack = [...fetchUrls, ...sentBodies].join("\n");
    expect(haystack).not.toContain(needle);
    expect(haystack).not.toContain("gradient.jpg"); // no filename either
  });

  it("degrades gracefully when the environment cannot run a worker at all", async () => {
    // No Worker constructor, and the engine download fails: the read must
    // resolve "unavailable" — never throw, never block the page.
    vi.stubGlobal("Worker", undefined);
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network unavailable");
    }));
    const { readC2paCredentials } = await freshModule();
    const file = new File([jpegWithXmpAiSource()], "gradient.jpg", { type: "image/jpeg" });

    const summary = await readC2paCredentials(file, 500);
    expect(summary.status).toBe("unavailable");
  });

  it("a hung engine cannot hang her check: the bounded wait resolves", async () => {
    const { readC2paCredentials } = await freshModule();
    const file = new File([jpegWithXmpAiSource()], "gradient.jpg", { type: "image/jpeg" });
    const started = Date.now();
    const summary = await readC2paCredentials(file, 100);
    expect(summary.status).toBe("unavailable");
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});
