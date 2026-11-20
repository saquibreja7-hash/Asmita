/**
 * Decoder child process: image bytes in, `{ pdq, quality, rss }` or an error
 * code out. Nothing else crosses the boundary.
 *
 * This process is started by DecoderPool (decoder-pool.ts) with:
 *   - a scrubbed environment (no service key, no config, no secrets);
 *   - Node's permission model: no filesystem writes, no child processes, no
 *     worker threads, reads limited to this bundle and sharp/libvips;
 *   - a JS heap cap, and stdout/stderr discarded by the parent.
 * It never receives the fingerprint pool, URLs or the service key through
 * its environment, argv or messages. It has no network code. The permission
 * model is not a sandbox against native code, and this process runs as the
 * same OS user as the parent: see README "Decoder isolation" for exactly
 * what that does and does not protect.
 *
 * The parent decides when this process is recycled (task count and the RSS
 * reported with every reply); this process never exits on its own while it
 * may hold a task, so no image is lost to a recycle.
 */
import { ERROR_CODES, toCrawlError } from "../errors.ts";
import { hashImage, hashSpriteImage } from "./hash-image.ts";

type Request = { id: number; bytes: Uint8Array; minSide: number; sprite?: true };

const ERROR_SET = new Set<string>(ERROR_CODES);

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
  return (
    Number.isInteger(r.id) &&
    r.bytes instanceof Uint8Array &&
    Number.isInteger(r.minSide) &&
    // A sprite request (video-fingerprints spec WP21) says so with exactly
    // `sprite: true`; the parent never sends `false` or any other value.
    (r.sprite === undefined || r.sprite === true)
  );
}

process.on("message", (m: unknown) => {
  void (async () => {
    if (!isRequest(m)) {
      // The parent only sends well-formed requests; anything else is a bug.
      process.exit(65);
    }
    let reply: Record<string, unknown>;
    try {
      const bytes = Buffer.from(m.bytes.buffer, m.bytes.byteOffset, m.bytes.byteLength);
      if (m.sprite === true) {
        // One decode, one reply carrying every tile's hash (WP21): the
        // same fixed shape a normal reply has, never a URL or a name.
        const r = await hashSpriteImage(bytes, { minSide: m.minSide });
        reply = { id: m.id, ok: true, sprite: true, tiles: r.tiles.map((t) => ({ pdq: t.hash, quality: t.quality })) };
      } else {
        const r = await hashImage(bytes, { minSide: m.minSide });
        reply = { id: m.id, ok: true, pdq: r.hash, quality: r.quality };
      }
    } catch (err) {
      const code = toCrawlError(err).code;
      reply = { id: m.id, ok: false, code: ERROR_SET.has(code) ? code : "image_decode_failed" };
    }
    // Resident memory after this task, so the parent can recycle on it.
    reply.rss = process.memoryUsage.rss();
    await send(reply);
  })();
});

// Never print anything: no stack traces, no bytes. Exit codes only.
process.on("uncaughtException", () => process.exit(70));
process.on("unhandledRejection", () => process.exit(70));
process.on("disconnect", () => process.exit(0));
