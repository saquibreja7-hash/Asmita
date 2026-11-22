/*
 * WP94 (docs/lab/beta-spec.md): the C2PA engine loader for server-side
 * stamping — the exact WebAssembly engine the site already serves
 * first-party for the on-device reader (public/c2pa/c2pa.wasm, copied from
 * @contentauth/c2pa-web at install time; @contentauth/c2pa-wasm, the same
 * Rust core, wraps the reading and building API around it).
 *
 * Where the reader runs it inside a browser Web Worker, the stamp runs it
 * in-process: initSync with the bytes of our own /c2pa/c2pa.wasm, fetched
 * from our own origin so the same file serves both tools and nothing new
 * enters the bundle. One engine per isolate, loaded once.
 *
 * Two shims keep the browser-oriented engine runnable in the Node dev
 * server, in vitest and in workerd:
 * - The engine reads the source image through FileReaderSync (a Worker-only
 *   browser API). Where it is missing we install a minimal shim that
 *   reads bytes we pinned on the Blob — the bytes we just handed it, so
 *   nothing is read from anywhere else.
 * - The engine is one shared instance, so stamp operations are serialized
 *   per isolate: a sign awaits our WebCrypto callback, and a second
 *   visitor's operation must not interleave with it inside the same
 *   WebAssembly memory.
 */

import { C2PA_WASM_PATH } from "@/lib/c2pa-credentials";

type EngineModule = typeof import("@contentauth/c2pa-wasm");

export class StampEngineError extends Error {
  constructor(public readonly code: "engine_unavailable") {
    super(code);
  }
}

/** The bytes a Blob carries, pinned for runtimes without FileReaderSync.
 *  A process-wide registry: the engine module can be re-evaluated (tests
 *  reset the module registry), and the installed shim must keep finding
 *  the bytes pinned by whichever instance handed the Blob over. */
const PINNED_BLOBS = Symbol.for("asmita.lab.stamp.pinned-blobs");
const globalRegistry = globalThis as typeof globalThis & { [PINNED_BLOBS]?: WeakMap<Blob, Uint8Array> };
const pinnedBlobs = (globalRegistry[PINNED_BLOBS] ??= new WeakMap<Blob, Uint8Array>());

/** A Blob the engine can read synchronously where FileReaderSync is missing. */
function syncBlob(bytes: Uint8Array): Blob {
  const blob = new Blob([bytes as unknown as BlobPart]);
  pinnedBlobs.set(blob, bytes);
  return blob;
}

function installFileReaderSyncShim() {
  const global = globalThis as typeof globalThis & { FileReaderSync?: unknown };
  if (typeof global.FileReaderSync === "function") return;
  // Browsers (and any runtime that adds it later) keep the real thing: a
  // genuine Blob is readable through it, pinned bytes or not.
  global.FileReaderSync = class {
    readAsArrayBuffer(blob: Blob): ArrayBuffer {
      const bytes = pinnedBlobs.get(blob);
      if (!bytes) throw new Error("c2pa_engine_blob_not_pinned");
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      return copy.buffer;
    }
  };
}

let enginePromise: Promise<EngineModule> | null = null;

async function loadEngine(origin: string): Promise<EngineModule> {
  // Our own first-party engine, the same file the browser reader fetches —
  // never a third-party CDN, never a new dependency in the bundle.
  let response: Response;
  try {
    response = await fetch(new URL(C2PA_WASM_PATH, origin), {
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new StampEngineError("engine_unavailable");
  }
  if (!response.ok) throw new StampEngineError("engine_unavailable");
  const wasmBytes = new Uint8Array(await response.arrayBuffer());
  const wasmModule = (await import("@contentauth/c2pa-wasm")) as EngineModule;
  wasmModule.initSync({ module: wasmBytes as unknown as WebAssembly.Module });
  installFileReaderSyncShim();
  return wasmModule;
}

/** The engine for this isolate, loading it from our own origin on first use. */
function engine(origin: string): Promise<EngineModule> {
  if (!enginePromise) {
    enginePromise = loadEngine(origin);
    enginePromise.catch(() => {
      // A failed load is retried on the next stamp.
      enginePromise = null;
    });
  }
  return enginePromise;
}

let queue: Promise<unknown> = Promise.resolve();

/** Run one engine operation at a time per isolate (shared wasm memory). */
function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const next = queue.then(operation, operation);
  queue = next.catch(() => undefined);
  return next;
}

export { engine, serialized, syncBlob };
