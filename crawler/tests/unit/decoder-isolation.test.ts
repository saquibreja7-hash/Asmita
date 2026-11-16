/**
 * Decoder isolation: decoding runs in a child process that gets only image
 * bytes and returns only { pdq, quality } or an error code; it has a scrubbed
 * environment, cannot write files or spawn processes, has a heap cap and a
 * per-task timeout, and is replaced after crashes, timeouts or bad replies.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { CrawlError } from "../../src/errors.ts";
import { hashImage } from "../../src/image/hash-image.ts";
import { DecoderPool, decoderEnv, decoderExecArgv, decoderReadPaths, defaultWorkerPath, parseReply } from "../../src/image/decoder-pool.ts";
import { patternImage } from "../support/synthetic.ts";

const FAKE = fileURLToPath(new URL("../support/fake-decoder-worker.mjs", import.meta.url));
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof CrawlError ? e.code : `other:${String(e)}`;
  }
};
const img = (first: number) => Buffer.from([first, 1, 2, 3]);

const pools: DecoderPool[] = [];
const pool = (opts: Partial<ConstructorParameters<typeof DecoderPool>[0]> = {}) => {
  const p = new DecoderPool({ size: 1, taskTimeoutMs: 3000, minSide: 1, ...opts });
  pools.push(p);
  return p;
};
afterEach(async () => {
  await Promise.all(pools.splice(0).map((p) => p.close()));
});

describe("real decoder child process", () => {
  it("returns the same fingerprint as decoding in-process", async () => {
    expect(existsSync(defaultWorkerPath())).toBe(true);
    const bytes = await patternImage(71, 320, 240, "jpeg");
    const p = pool();
    const isolated = await p.hash(bytes);
    const local = await hashImage(bytes, { minSide: 1 });
    expect(isolated).toEqual({ pdq: local.hash, quality: local.quality });
    expect(p.stats.started).toBe(1);
  });
  it("maps decode failures to error codes and keeps working", async () => {
    const p = pool();
    expect(await code(p.hash(Buffer.from("<html>not an image</html>")))).toBe("image_sniff_failed");
    expect((await p.hash(await patternImage(72, 200, 200, "png"))).pdq).toMatch(/^[0-9a-f]{64}$/);
    expect(p.stats.started).toBe(1);
  });
  it("runs tasks on several children in parallel", async () => {
    const p = pool({ size: 2 });
    const imgs = await Promise.all([73, 74, 75, 76].map((s) => patternImage(s, 300, 300, "png")));
    const out = await Promise.all(imgs.map((b) => p.hash(b)));
    expect(new Set(out.map((o) => o.pdq)).size).toBe(4);
    expect(p.stats.started).toBe(2);
  });
});

describe("what the child can see and do", () => {
  it("child environment is only the scrubbed set, never the service key or config", async () => {
    process.env.CRAWLER_SERVICE_KEY = "parent-secret-key-value-0123456789";
    try {
      expect(Object.keys(decoderEnv()).sort()).toEqual(["TEMP", "TMP", "TMPDIR", "VIPS_DISC_THRESHOLD"]);
      // The fake worker inspects its real process.env and the request shape.
      expect(await code(pool({ workerPath: FAKE }).hash(img(0x06)))).toBe("image_format");
    } finally {
      delete process.env.CRAWLER_SERVICE_KEY;
    }
  });

  it("the child's Node flags deny file writes and process spawning", () => {
    const target = join(ROOT, "decoder-write-probe.txt");
    const script = `
      const fs = require("node:fs");
      const out = [];
      try { fs.writeFileSync(${JSON.stringify(target)}, "x"); out.push("write-ok"); } catch (e) { out.push(e.code); }
      try { require("node:child_process").execSync("echo hi"); out.push("spawn-ok"); } catch (e) { out.push(e.code); }
      try { new (require("node:worker_threads").Worker)("1", { eval: true }); out.push("worker-ok"); } catch (e) { out.push(e.code); }
      try { fs.readFileSync(${JSON.stringify(join(ROOT, "..", "CLAUDE.md"))}); out.push("outside-read-ok"); } catch (e) { out.push(e.code); }
      process.stdout.write(out.join(","));`;
    const r = spawnSync(process.execPath, [...decoderExecArgv(defaultWorkerPath()), "-e", script], { env: decoderEnv(), encoding: "utf8" });
    expect(r.stdout).toBe("ERR_ACCESS_DENIED,ERR_ACCESS_DENIED,ERR_ACCESS_DENIED,ERR_ACCESS_DENIED");
    expect(existsSync(target)).toBe(false);
    const flags = decoderExecArgv(defaultWorkerPath());
    expect(flags).toContain("--permission");
    expect(flags.some((f) => f.startsWith("--allow-fs-write") || f.startsWith("--allow-child-process") || f.startsWith("--allow-worker"))).toBe(false);
  });

  it("the child may read only its own bundle and sharp/libvips, not the rest of the app root", () => {
    const tryRead = (p: string) => `try { fs.readFileSync(${JSON.stringify(p)}); out.push("ok"); } catch (e) { out.push(e.code); }`;
    const script = `
      const fs = require("node:fs");
      const out = [];
      ${tryRead(defaultWorkerPath())}
      ${tryRead(join(ROOT, "node_modules", "sharp", "package.json"))}
      ${tryRead(join(ROOT, "package.json"))}
      ${tryRead(join(ROOT, "src", "config.ts"))}
      ${tryRead(join(ROOT, "dist", "main.js"))}
      ${tryRead(join(ROOT, ".env"))}
      ${tryRead(join(ROOT, "node_modules", "undici", "package.json"))}
      process.stdout.write(out.join(","));`;
    const r = spawnSync(process.execPath, [...decoderExecArgv(defaultWorkerPath()), "-e", script], { env: decoderEnv(), encoding: "utf8" });
    expect(r.stdout).toBe(["ok", "ok", ...Array(5).fill("ERR_ACCESS_DENIED")].join(","));
    const reads = decoderExecArgv(defaultWorkerPath()).filter((f) => f.startsWith("--allow-fs-read="));
    expect(reads.map((f) => f.slice("--allow-fs-read=".length))).toEqual(decoderReadPaths(defaultWorkerPath()));
    expect(reads.some((f) => f === `--allow-fs-read=${join(ROOT, "*")}`)).toBe(false);
  });

  it("the service key is never on the child's argv or environment", async () => {
    process.env.CRAWLER_SERVICE_KEY = "parent-secret-key-value-0123456789";
    try {
      const flags = decoderExecArgv(defaultWorkerPath()).join(" ");
      expect(flags).not.toContain("parent-secret");
      // 0x06 replies "blocked_port" if argv/execArgv carries the key.
      expect(await code(pool({ workerPath: FAKE }).hash(img(0x06)))).toBe("image_format");
    } finally {
      delete process.env.CRAWLER_SERVICE_KEY;
    }
  });
});

describe("recycling is decided by the parent", () => {
  it("retires a child after maxTasksPerChild answered tasks, before giving it another", async () => {
    const p = pool({ workerPath: FAKE, maxTasksPerChild: 2 });
    for (let i = 0; i < 5; i++) expect((await p.hash(img(0x00))).quality).toBe(77);
    expect(p.stats).toMatchObject({ started: 3, recycled: 2, crashes: 0, retried: 0 });
  });
  it("loses no image when many are queued across recycles", async () => {
    const p = pool({ workerPath: FAKE, maxTasksPerChild: 3, size: 2 });
    const out = await Promise.all(Array.from({ length: 13 }, () => code(p.hash(img(0x00)))));
    expect(out).toEqual(Array(13).fill("ok"));
    expect(p.stats.crashes).toBe(0);
    expect(p.stats.recycled).toBeGreaterThanOrEqual(3);
  });
  it("retires a child whose reported RSS is over the ceiling", async () => {
    const p = pool({ workerPath: FAKE });
    expect((await p.hash(img(0x08))).quality).toBe(77);
    expect((await p.hash(img(0x00))).quality).toBe(77);
    expect(p.stats).toMatchObject({ started: 2, recycled: 1 });
    const q = pool({ workerPath: FAKE, maxChildRssBytes: 1 });
    await q.hash(img(0x00));
    await q.hash(img(0x00));
    expect(q.stats).toMatchObject({ started: 2, recycled: 2 });
  });
  it("the real decoder child does not exit on its own after answering", async () => {
    const p = pool({ maxTasksPerChild: 1000 });
    const bytes = await patternImage(77, 120, 120, "png");
    for (let i = 0; i < 3; i++) await p.hash(bytes);
    expect(p.stats).toMatchObject({ started: 1, recycled: 0, crashes: 0 });
  });
});

describe("an image whose child died before answering", () => {
  it("is retried once on a fresh child (a child dying after taking it loses nothing)", async () => {
    const p = pool({ workerPath: FAKE });
    // 0x07 answers, then ignores the next task and exits: the second image is
    // handed to a dying child, as with a child that recycles itself.
    const [a, b] = await Promise.all([code(p.hash(img(0x07))), code(p.hash(img(0x00)))]);
    expect([a, b]).toEqual(["ok", "ok"]);
    expect(p.stats).toMatchObject({ crashes: 1, retried: 1, started: 2 });
  });
  it("is not retried a second time, so a poison image cannot loop", async () => {
    const p = pool({ workerPath: FAKE });
    expect(await code(p.hash(img(0x02)))).toBe("image_decoder_crashed");
    expect(p.stats).toMatchObject({ crashes: 2, retried: 1, started: 2 });
  });
  it("timeouts and bad replies are not retried", async () => {
    const p = pool({ workerPath: FAKE, taskTimeoutMs: 300 });
    expect(await code(p.hash(img(0x01)))).toBe("image_decode_timeout");
    expect(await code(p.hash(img(0x03)))).toBe("image_decoder_crashed");
    expect(p.stats).toMatchObject({ retried: 0, started: 2 });
  });
});

describe("failure handling", () => {
  it("times out a hung task, kills the child and continues with a fresh one", async () => {
    const p = pool({ workerPath: FAKE, taskTimeoutMs: 300 });
    expect(await code(p.hash(img(0x01)))).toBe("image_decode_timeout");
    expect(await p.hash(img(0x00))).toEqual({ pdq: "0123456789abcdef".repeat(4), quality: 77 });
    expect(p.stats).toMatchObject({ timeouts: 1, started: 2 });
  });
  it("survives a crash; the child's output is discarded, not captured", async () => {
    const p = pool({ workerPath: FAKE });
    expect(await code(p.hash(img(0x02)))).toBe("image_decoder_crashed");
    expect((await p.hash(img(0x00))).quality).toBe(77);
    // The crashing image is retried once on a fresh child, then given up.
    expect(p.stats).toMatchObject({ crashes: 2, retried: 1, started: 3 });
  });
  it("treats malformed or unsolicited replies as a compromised child", async () => {
    const p = pool({ workerPath: FAKE });
    expect(await code(p.hash(img(0x03)))).toBe("image_decoder_crashed");
    expect(await code(p.hash(img(0x04)))).toBe("image_decoder_crashed");
    expect((await p.hash(img(0x00))).quality).toBe(77);
    expect(p.stats).toMatchObject({ protocolErrors: 2, started: 3 });
  });
  it("enforces the heap cap: a child that exhausts memory dies and is replaced", async () => {
    const p = pool({ workerPath: FAKE, maxOldSpaceMb: 32, taskTimeoutMs: 20_000 });
    expect(await code(p.hash(img(0x05)))).toBe("image_decoder_crashed");
    expect((await p.hash(img(0x00))).quality).toBe(77);
  }, 30_000);
  it("parseReply accepts only the exact reply shapes", () => {
    const h = "ab".repeat(32);
    expect(parseReply({ id: 1, ok: true, pdq: h, quality: 60, rss: 5 }, 1)).toEqual({ ok: true, pdq: h, quality: 60, rss: 5 });
    expect(parseReply({ id: 1, ok: false, code: "image_format", rss: 5 }, 1)).toEqual({ ok: false, code: "image_format", rss: 5 });
    for (const bad of [
      { id: 2, ok: true, pdq: h, quality: 60, rss: 5 },
      { id: 1, ok: true, pdq: h.toUpperCase(), quality: 60, rss: 5 },
      { id: 1, ok: true, pdq: h, quality: 101, rss: 5 },
      { id: 1, ok: true, pdq: h, quality: 60, rss: 5, url: "x" },
      { id: 1, ok: true, pdq: h, quality: 60 },
      { id: 1, ok: true, pdq: h, quality: 60, rss: -1 },
      { id: 1, ok: true, pdq: h, quality: 60, rss: 1.5 },
      { id: 1, ok: true, pdq: h, quality: 60, rss: "5" },
      { id: 1, ok: false, code: "https://leak.example/", rss: 5 },
      { id: 1, ok: false, code: "image_format", message: "boom", rss: 5 },
      { id: 1, ok: false, code: "image_format" },
      [1],
      "x",
      null,
    ]) {
      expect(parseReply(bad, 1)).toBeNull();
    }
  });
});

describe("process layout", () => {
  it("the crawler process never loads the image decoder", () => {
    const main = readFileSync(join(ROOT, "dist", "main.js"), "utf8");
    expect(main).not.toMatch(/from\s*"sharp"|require\("sharp"\)/);
    const worker = readFileSync(defaultWorkerPath(), "utf8");
    expect(worker).toMatch(/from\s*"sharp"/);
    // and the worker bundle carries no API client or config code
    expect(worker).not.toMatch(/CRAWLER_SERVICE_KEY|api\/crawler\/|Authorization|Bearer/i);
  });
});
