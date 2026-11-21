/**
 * Main-thread client of the hashing Web Worker (web audit WP42).
 *
 * The worker is created lazily, on the first hashing request after she
 * chooses a file (WP42 P13: this module's users load it on demand too), and
 * is one per page. Replies are validated strictly - an unknown id, a missing
 * field or a hash that is not 64 lowercase hex chars marks the worker as
 * broken: it is terminated and every pending request fails with
 * HashWorkerError, which the callers treat as "hash on the main thread
 * instead" so she never loses a fingerprint to a worker that cannot run.
 *
 * Nothing here touches the network. What crosses the boundary is her file
 * or frame bitmap (inside her own browser) and what comes back is only
 * { hash, quality }.
 */

import type { HashRequest, HashResponse } from "./hash-protocol";
import { PDQ_HASH_PATTERN, type PdqResult } from "./pdq";

/** The fixed failures the callers fall back on: the worker cannot be used. */
export type HashWorkerErrorCode = "worker_unavailable" | "worker_failed";

export class HashWorkerError extends Error {
  readonly code: HashWorkerErrorCode;

  constructor(code: HashWorkerErrorCode) {
    super(code);
    this.name = "HashWorkerError";
    this.code = code;
  }
}

const REPLY_CODES = new Set(["decode_failed", "hash_failed", "bad_request"]);

function parseReply(data: unknown): HashResponse | null {
  if (typeof data !== "object" || data === null) return null;
  const reply = data as Record<string, unknown>;
  if (typeof reply.id !== "number" || !Number.isInteger(reply.id)) return null;
  if (reply.ok === true) {
    if (typeof reply.hash !== "string" || !PDQ_HASH_PATTERN.test(reply.hash)) return null;
    if (typeof reply.quality !== "number" || !Number.isInteger(reply.quality) || reply.quality < 0 || reply.quality > 100) {
      return null;
    }
    return { id: reply.id, ok: true, hash: reply.hash, quality: reply.quality };
  }
  if (reply.ok === false && typeof reply.code === "string" && REPLY_CODES.has(reply.code)) {
    return { id: reply.id, ok: false, code: reply.code as "decode_failed" | "hash_failed" | "bad_request" };
  }
  return null;
}

type Settle = (value: PdqResult | HashWorkerError) => void;

// The kinds the main thread ever posts (the `pixels` kind is the worker's
// testable core and never crosses the boundary from the page).
type PostRequest = { kind: "file"; file: File } | { kind: "bitmap"; bitmap: ImageBitmap };

class HashWorkerClient {
  private worker: Worker | null = null;
  /** A worker that never answered is not retried for the page's lifetime. */
  private dead = false;
  /** A worker that answered once may be rebuilt after a later crash. */
  private everWorked = false;
  private nextId = 1;
  private pending = new Map<number, Settle>();

  supported(): boolean {
    return (
      !this.dead &&
      typeof Worker === "function" &&
      typeof OffscreenCanvas === "function" &&
      typeof createImageBitmap === "function"
    );
  }

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL("./hash.worker.ts", import.meta.url), { type: "module" });
    worker.addEventListener("message", (event: MessageEvent<unknown>) => {
      this.onMessage(event.data);
    });
    // A script that fails to load (blocked, missing) surfaces as "error"
    // before any reply; a crash mid-session surfaces the same way later.
    worker.addEventListener("error", () => {
      this.dispose("worker_failed");
    });
    worker.addEventListener("messageerror", () => {
      this.dispose("worker_failed");
    });
    this.worker = worker;
    return worker;
  }

  private onMessage(data: unknown): void {
    const reply = parseReply(data);
    if (!reply) {
      this.dispose("worker_failed");
      return;
    }
    const settle = this.pending.get(reply.id);
    if (!settle) {
      // Every posted id is pending until answered; anything else is desync.
      this.dispose("worker_failed");
      return;
    }
    this.pending.delete(reply.id);
    if (!this.everWorked) this.everWorked = true;
    if (reply.ok) settle({ hash: reply.hash, quality: reply.quality });
    else settle(new HashWorkerError("worker_failed"));
  }

  private dispose(code: HashWorkerErrorCode): void {
    const worker = this.worker;
    this.worker = null;
    if (!this.everWorked) this.dead = true;
    worker?.terminate();
    const pending = this.pending;
    this.pending = new Map();
    for (const settle of pending.values()) settle(new HashWorkerError(code));
  }

  private post(request: PostRequest, transfer?: Transferable[]): Promise<PdqResult> {
    return new Promise<PdqResult>((resolve, reject) => {
      if (!this.supported()) {
        reject(new HashWorkerError("worker_unavailable"));
        return;
      }
      let worker: Worker;
      try {
        worker = this.ensure();
      } catch {
        this.dispose("worker_unavailable");
        reject(new HashWorkerError("worker_unavailable"));
        return;
      }
      const id = this.nextId++;
      this.pending.set(id, (value) => {
        if (value instanceof HashWorkerError) reject(value);
        else resolve(value);
      });
      try {
        worker.postMessage({ id, ...request } satisfies HashRequest, transfer ?? []);
      } catch {
        this.pending.delete(id);
        this.dispose("worker_unavailable");
        reject(new HashWorkerError("worker_unavailable"));
      }
    });
  }

  /** Hashes her chosen file in the worker; the file is decoded there (P1). */
  hashFile(file: File): Promise<PdqResult> {
    return this.post({ kind: "file", file });
  }

  /** Hashes one video frame in the worker; the bitmap is transferred (P2). */
  hashBitmap(bitmap: ImageBitmap): Promise<PdqResult> {
    return this.post({ kind: "bitmap", bitmap }, [bitmap]);
  }
}

export const hashWorker = new HashWorkerClient();

/** True while the worker path can be used for the next hashing request. */
export function hashWorkerSupported(): boolean {
  return hashWorker.supported();
}

export function hashFileInWorker(file: File): Promise<PdqResult> {
  return hashWorker.hashFile(file);
}

export function hashBitmapInWorker(bitmap: ImageBitmap): Promise<PdqResult> {
  return hashWorker.hashBitmap(bitmap);
}
