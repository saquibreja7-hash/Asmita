/**
 * The hashing Web Worker (web audit WP42): PDQ for images and video frames
 * runs here, off the page's main thread.
 *
 * Loaded lazily from src/lib/pdq/hash-client.ts when she first chooses a
 * file, as a module worker (`new Worker(new URL("./hash.worker.ts",
 * import.meta.url), { type: "module" })`). The bundler emits it as a real
 * same-origin script - both the Next.js (Turbopack) and the vinext/Vite
 * Cloudflare builds do - which is why the CSP grants worker-src 'self' and
 * not blob:: the worker is never an inline blob.
 *
 * The media rule is unchanged: her file or frame arrives here by structured
 * clone inside her own browser, is decoded into pixels on an OffscreenCanvas
 * through the same full-resolution path the main thread used (so the hashes
 * stay bit-identical), hashed, and freed - every bitmap is closed. Nothing
 * leaves the device; the only reply is { hash, quality }.
 */

import { handleHashRequest, type HashRequest, type HashResponse } from "./hash-protocol";

// The DOM lib that types the rest of the app has no DedicatedWorkerGlobalScope;
// this is exactly the surface the worker entry uses.
type WorkerScope = {
  addEventListener(type: "message", listener: (event: MessageEvent<HashRequest>) => void): void;
  postMessage(message: HashResponse): void;
};

function decodeFile(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

function bitmapToPixels(bitmap: ImageBitmap): { data: Uint8ClampedArray; width: number; height: number } {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("offscreen_canvas_unavailable");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

const scope = self as unknown as WorkerScope;

scope.addEventListener("message", async (event: MessageEvent<HashRequest>) => {
  let reply: HashResponse | null = null;
  try {
    reply = await handleHashRequest(event.data, { decodeFile, bitmapToPixels });
  } catch {
    // Unreachable while handleHashRequest catches its own steps, but a
    // handler that dies silently would hang the request: answer with the
    // fixed refusal code whenever the message carried an id.
    const id = (event.data as { id?: unknown } | null)?.id;
    reply = typeof id === "number" && Number.isInteger(id) ? { id, ok: false, code: "bad_request" } : null;
  }
  if (reply) scope.postMessage(reply);
});
