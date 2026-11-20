/**
 * The isolated SSCD child pool (WP28) over the real IPC boundary with the
 * fake worker: strict reply validation (a vector of exactly the configured
 * dimension, finite, in range), timeout and crash handling with the
 * once-only retry, parent-side recycling by task count and reported RSS,
 * and the child's isolation set (scrubbed environment, keyless argv with
 * the model path, permission flags that include the model file and
 * onnxruntime).
 */
import { afterAll, describe, expect, it } from "vitest";
import { CrawlError } from "../../src/errors.ts";
import { SscdPool } from "../../src/image/sscd-pool.ts";

const FAKE = new URL("../support/fake-sscd-worker.mjs", import.meta.url).pathname;

const pool = (opts: Partial<ConstructorParameters<typeof SscdPool>[0]> = {}) =>
  new SscdPool({
    size: 1,
    taskTimeoutMs: 400,
    minSide: 1,
    modelPath: "/test/model/sscd.onnx",
    expectedDim: 16,
    workerPath: FAKE,
    maxOldSpaceMb: 64,
    ...opts,
  });

const pools: SscdPool[] = [];
const make = (opts?: Partial<ConstructorParameters<typeof SscdPool>[0]>) => {
  const p = pool(opts);
  pools.push(p);
  return p;
};

/** First byte chooses the fake worker's behaviour. */
const img = (byte: number) => Buffer.from([byte, 1, 2, 3, 4, 5, 6, 7, 8]);

const codeOf = async (p: SscdPool, bytes: Buffer) => {
  try {
    await p.embed(bytes);
    return null;
  } catch (raw) {
    return raw instanceof CrawlError ? raw.code : "not_a_crawl_error";
  }
};

afterAll(async () => {
  await Promise.all(pools.map((p) => p.close()));
});

describe("SscdPool (WP28)", () => {
  it("returns the child's vector and counts the child", async () => {
    const p = make();
    const v = await p.embed(img(0x00));
    expect(v.length).toBe(16);
    for (const x of v) expect(Number.isFinite(x)).toBe(true);
    expect(p.stats.started).toBe(1);
    expect(p.stats.protocolErrors).toBe(0);
  });

  it("kills a child whose vector has the wrong length or a bad value", async () => {
    const p = make();
    expect(await codeOf(p, img(0x09))).toBe("sscd_worker_crashed");
    expect(await codeOf(p, img(0x0a))).toBe("sscd_worker_crashed");
    expect(await codeOf(p, img(0x03))).toBe("sscd_worker_crashed");
    expect(await codeOf(p, img(0x04))).toBe("sscd_worker_crashed");
    expect(p.stats.protocolErrors).toBe(4);
    // The pool replaced the child every time and keeps working.
    const v = await p.embed(img(0x00));
    expect(v.length).toBe(16);
    expect(p.stats.started).toBe(5);
  });

  it("times a hung child out, kills it and replaces it", async () => {
    const p = make();
    expect(await codeOf(p, img(0x01))).toBe("sscd_timeout");
    expect(p.stats.timeouts).toBe(1);
    const v = await p.embed(img(0x00));
    expect(v.length).toBe(16);
  });

  it("retries an image whose child died before answering exactly once", async () => {
    const p = make();
    expect(await codeOf(p, img(0x02))).toBe("sscd_worker_crashed");
    expect(p.stats.crashes).toBe(2); // the first child and the retry's child
    expect(p.stats.retried).toBe(1);
  });

  it("passes a fixed error code through without killing the child", async () => {
    const p = make();
    expect(await codeOf(p, img(0x0b))).toBe("sscd_inference_failed");
    expect(p.stats.protocolErrors).toBe(0);
    expect(p.stats.started).toBe(1);
    const v = await p.embed(img(0x00));
    expect(v.length).toBe(16);
    expect(p.stats.started).toBe(1); // the same child answered both
  });

  it("retires a child by task count and by reported RSS", async () => {
    const one = make({ maxTasksPerChild: 1 });
    await one.embed(img(0x00));
    expect(one.stats.recycled).toBe(1);
    await one.embed(img(0x00));
    expect(one.stats.started).toBe(2);

    const rss = make({ maxChildRssBytes: 1024 });
    await rss.embed(img(0x08)); // a valid reply reporting a huge RSS
    expect(rss.stats.recycled).toBe(1);
    expect(rss.stats.started).toBe(1);
  });

  it("gives the child a scrubbed environment, the model path on argv, and the right permission flags", async () => {
    const p = make();
    // The fake worker's 0x06 case checks every guarantee and answers
    // sscd_inference_failed only when all of them held; any broken
    // guarantee would answer a different code.
    expect(await codeOf(p, img(0x06))).toBe("sscd_inference_failed");
    expect(p.stats.protocolErrors).toBe(0);
  });

  it("refuses work after close and aborts a pending task", async () => {
    const p = make();
    const pending = p.embed(img(0x01)); // hangs until the timeout
    // Attach the rejection expectation before close() rejects it, so the
    // rejection is never unhandled.
    const assertion = expect(pending).rejects.toThrow();
    await p.close();
    await assertion;
    await expect(p.embed(img(0x00))).rejects.toThrow();
  });
});
