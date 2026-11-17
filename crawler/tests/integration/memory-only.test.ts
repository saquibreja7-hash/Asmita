/**
 * MEMORY ONLY: a full fixture crawl (download, decode, hash, match, post)
 * with every Node filesystem write API patched to throw and record the call.
 * The crawl must still produce its findings and no write may be attempted.
 *
 * Scope: this catches writes from JavaScript in the crawler process (our code
 * and JS dependencies). Decoding happens in a child process, which cannot
 * write at all: it runs with Node's permission model and no fs-write grant
 * (tests/unit/decoder-isolation.test.ts proves writes are denied there).
 * libvips writes from native code would not pass through node:fs; those are
 * covered by hashing with toBuffer() only (never toFile) and, in the
 * container, VIPS_DISC_THRESHOLD, an unwritable TMPDIR and a read-only root
 * filesystem (see Dockerfile and README).
 */
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFixture, fixtureSeedUrl, SOURCE_DOMAIN, TEST_KEY, type Fixture } from "../support/fixture-site.ts";
import { MockAsmita } from "../support/mock-asmita.ts";
import { runFixtureCrawl } from "../support/run-fixture.ts";

const SYNC_WRITERS = [
  "writeFileSync",
  "appendFileSync",
  "writeSync",
  "writevSync",
  "mkdtempSync",
  "mkdirSync",
  "copyFileSync",
  "renameSync",
  "symlinkSync",
  "linkSync",
  "truncateSync",
  "ftruncateSync",
  "cpSync",
] as const;
const CB_WRITERS = [
  "writeFile",
  "appendFile",
  "write",
  "writev",
  "mkdtemp",
  "mkdir",
  "copyFile",
  "rename",
  "symlink",
  "link",
  "truncate",
  "ftruncate",
  "cp",
  "createWriteStream",
] as const;
const PROMISE_WRITERS = ["writeFile", "appendFile", "mkdtemp", "mkdir", "copyFile", "rename", "symlink", "link", "truncate", "cp"] as const;

const WRITE_FLAGS = /[wa+]/;

type AnyFn = (...args: unknown[]) => unknown;

function patchFs(attempts: string[]): () => void {
  const restore: (() => void)[] = [];
  const replace = (obj: Record<string, unknown>, name: string, make: (orig: AnyFn) => AnyFn) => {
    const orig = obj[name] as AnyFn | undefined;
    if (typeof orig !== "function") return;
    obj[name] = make(orig);
    restore.push(() => {
      obj[name] = orig;
    });
  };
  const block = (label: string) => () => {
    attempts.push(label);
    throw Object.assign(new Error("filesystem write blocked by test"), { code: "EWRITEBLOCKED" });
  };
  const target = fs as unknown as Record<string, unknown>;
  for (const n of [...SYNC_WRITERS, ...CB_WRITERS]) replace(target, n, () => block(`fs.${n}`));
  // open/openSync are allowed for reading only.
  for (const n of ["open", "openSync"]) {
    replace(target, n, (orig) => (...args: unknown[]) => {
      const flags = args[1];
      if (typeof flags === "string" && WRITE_FLAGS.test(flags)) return block(`fs.${n}`)();
      if (typeof flags === "number" && (flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_APPEND)) !== 0)
        return block(`fs.${n}`)();
      return orig(...args);
    });
  }
  const promises = fs.promises as unknown as Record<string, unknown>;
  const rejectWith = (label: string) => () => {
    try {
      return block(label)();
    } catch (err) {
      return Promise.reject(err);
    }
  };
  for (const n of PROMISE_WRITERS) replace(promises, n, () => rejectWith(`fs.promises.${n}`));
  replace(promises, "open", (orig) => (...args: unknown[]) => {
    const flags = args[1];
    if (typeof flags === "string" && WRITE_FLAGS.test(flags)) return rejectWith("fs.promises.open")();
    return orig(...args);
  });
  syncBuiltinESMExports();
  return () => {
    for (const r of restore.reverse()) r();
    syncBuiltinESMExports();
  };
}

let fx: Fixture;
let api: MockAsmita;

beforeAll(async () => {
  fx = await buildFixture();
  api = await new MockAsmita({
    key: TEST_KEY,
    pool: fx.pool,
    sources: [{ id: "src-fixture", kind: "site", domain: SOURCE_DOMAIN, pageBudget: 50, delayMs: 0 }],
    seedUrl: fixtureSeedUrl(fx.site.port),
  }).start();
}, 60_000);

afterAll(async () => {
  await fx?.site.stop();
  await api?.stop();
});

describe("memory-only image handling", () => {
  it("crawls, hashes and reports with every fs write API throwing", async () => {
    const attempts: string[] = [];
    const unpatch = patchFs(attempts);
    let findings: number | undefined;
    try {
      // Control: the patch really is in force, for both the CJS object and
      // the ESM named exports other modules import.
      expect(() => fs.writeFileSync("never-written.txt", "x")).toThrow(/blocked/);
      const esm = await import("node:fs");
      expect(() => esm.appendFileSync("never-written.txt", "x")).toThrow(/blocked/);
      const fsp = await import("node:fs/promises");
      await expect(fsp.mkdtemp("never-")).rejects.toThrow(/blocked/);
      expect(() => esm.createWriteStream("never-written.txt")).toThrow(/blocked/);
      attempts.length = 0;

      const { result } = await runFixtureCrawl(fx.site, api);
      findings = result.summary.findingsAccepted as number;
      expect(result.summary.imagesHashed as number).toBeGreaterThan(5);
      // Decoding really went through the isolated child process. The child
      // itself runs under Node's permission model with no fs-write grant
      // (proved in tests/unit/decoder-isolation.test.ts).
      expect((result.summary.decoder as { started: number }).started).toBeGreaterThan(0);
      expect(result.summary.decoder).toMatchObject({ recycled: 0, retried: 0, crashes: 0 });
    } finally {
      unpatch();
    }
    expect(attempts).toEqual([]);
    expect(findings).toBe(fx.expected.length);
  }, 60_000);
});
