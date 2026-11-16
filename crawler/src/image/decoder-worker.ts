/**
 * Decoder child process: image bytes in, `{ pdq, quality }` or an error code
 * out. Nothing else crosses the boundary.
 *
 * This process is started by DecoderPool (decoder-pool.ts) with:
 *   - a scrubbed environment (no service key, no config, no secrets);
 *   - Node's permission model: no filesystem writes, no child processes, no
 *     worker threads, reads limited to the application directory;
 *   - a JS heap cap, and stdout/stderr discarded by the parent.
 * It never receives the fingerprint pool, URLs or the service key, so an
 * exploited decoder (libvips is native code) can see only the image it was
 * handed. It has no network code; see README "Decoder isolation" for what
 * the permission model does not restrict.
 */
import { ERROR_CODES, toCrawlError } from "../errors.ts";
import { hashImage } from "./hash-image.ts";

type Request = { id: number; bytes: Uint8Array; minSide: number };

const ERROR_SET = new Set<string>(ERROR_CODES);
/** Recycle the process after this many tasks or above this RSS (bounds leaks). */
const MAX_TASKS = 500;
const MAX_RSS_BYTES = 768 * 1024 * 1024;

// Belt and braces: this process has no business making network requests.
for (const name of ["fetch", "WebSocket", "EventSource"]) {
  Reflect.deleteProperty(globalThis, name);
}

function send(msg: unknown): Promise<void> {
  return new Promise((resolve) => {
    if (!process.send) return resolve();
    process.send(msg, undefined, {}, () => resolve());
  });
}

function isRequest(m: unknown): m is Request {
  if (!m || typeof m !== "object") return false;
  const r = m as Record<string, unknown>;
  return Number.isInteger(r.id) && r.bytes instanceof Uint8Array && Number.isInteger(r.minSide);
}

let tasks = 0;

process.on("message", (m: unknown) => {
  void (async () => {
    if (!isRequest(m)) {
      // The parent only sends well-formed requests; anything else is a bug.
      process.exit(65);
    }
    let reply: unknown;
    try {
      const bytes = Buffer.from(m.bytes.buffer, m.bytes.byteOffset, m.bytes.byteLength);
      const r = await hashImage(bytes, { minSide: m.minSide });
      reply = { id: m.id, ok: true, pdq: r.hash, quality: r.quality };
    } catch (err) {
      const code = toCrawlError(err).code;
      reply = { id: m.id, ok: false, code: ERROR_SET.has(code) ? code : "image_decode_failed" };
    }
    await send(reply);
    tasks++;
    if (tasks >= MAX_TASKS || process.memoryUsage().rss > MAX_RSS_BYTES) process.exit(0);
  })();
});

// Never print anything: no stack traces, no bytes. Exit codes only.
process.on("uncaughtException", () => process.exit(70));
process.on("unhandledRejection", () => process.exit(70));
process.on("disconnect", () => process.exit(0));

