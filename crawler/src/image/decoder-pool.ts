/**
 * Runs image decoding + PDQ in separate child processes.
 *
 * Why: libvips is a large native decoder fed attacker-controlled bytes. The
 * fingerprint pool and matcher live only in this (parent) process's memory,
 * and a child is a separate address space, so a decoder exploit cannot read
 * them through memory. child_process was chosen over worker_threads because
 * worker threads share the parent's address space; a process boundary costs
 * one IPC copy per image (measured in README "Decoder isolation").
 *
 * Each child:
 *   - gets ONLY image bytes and a minimum side, and returns ONLY
 *     { pdq, quality, rss } or a fixed error code; replies are validated
 *     strictly and anything unexpected kills the child;
 *   - has a scrubbed environment (decoderEnv(): no key, no config), and the
 *     key is never on its argv;
 *   - runs under Node's permission model: no fs writes, no child processes,
 *     no worker threads, fs reads limited to its own bundle and sharp/libvips
 *     (decoderExecArgv());
 *   - has a JS heap cap; native memory is bounded by the pixel limit and the
 *     image byte cap;
 *   - is recycled BY THE PARENT after maxTasksPerChild tasks or when the RSS
 *     it reports exceeds maxChildRssBytes, before it is given another task,
 *     which also bounds how long a compromised child lives;
 *   - has a per-task timeout: on timeout or crash it is killed and replaced;
 *     an image whose child died before answering is retried ONCE on a fresh
 *     child (never more, so a poison image cannot loop);
 *   - has stdout/stderr discarded, so crash output (which could contain
 *     bytes) never reaches our logs. Only exit codes are counted.
 *
 * What this does NOT give: the child runs as the same OS user as the parent,
 * and Node's permission model does not restrict native code (sharp is an
 * addon). Native code running in an exploited child can make raw syscalls:
 * open the network, read any file that user can read (including
 * /proc/<parent pid>/environ, which on Linux shows the parent's INITIAL
 * environment even after runMain deletes the key from the live environment), and
 * ptrace or read /proc/<pid>/mem of the parent where the kernel allows it.
 * Closing that needs deployment hardening (separate UID or a syscall sandbox
 * for the decoder, no egress for it, key mounted as a file the decoder's
 * user cannot read): see README "What this does not protect against".
 */
import { fork, type ChildProcess } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CrawlError, ERROR_CODES, type ErrorCode } from "../errors.ts";

export type DecodeResult = { pdq: string; quality: number };

/** What the crawler needs from a decoder (tests may substitute their own). */
export type ImageDecoder = {
  hash(bytes: Buffer): Promise<DecodeResult>;
  close(): Promise<void>;
  readonly stats: DecoderStats;
};

export type DecoderStats = {
  started: number;
  crashes: number;
  timeouts: number;
  protocolErrors: number;
  /** Children retired by the parent (task count or RSS), never mid-task. */
  recycled: number;
  /** Images re-run on a fresh child after their child died before answering. */
  retried: number;
};

/** Defaults for parent-side recycling (bounds leaks and a compromised child's life). */
export const DEFAULT_MAX_TASKS_PER_CHILD = 500;
export const DEFAULT_MAX_CHILD_RSS_BYTES = 768 * 1024 * 1024;

export type DecoderPoolOptions = {
  size: number;
  taskTimeoutMs: number;
  minSide: number;
  /** JS heap cap per child, MB. */
  maxOldSpaceMb?: number;
  /** Override the worker script (tests use a fake worker). */
  workerPath?: string;
  /** Retire a child after this many answered tasks (tests inject a low value). */
  maxTasksPerChild?: number;
  /** Retire a child whose reported RSS exceeds this, in bytes. */
  maxChildRssBytes?: number;
};

const HEX64 = /^[0-9a-f]{64}$/;
const ERROR_SET = new Set<string>(ERROR_CODES);
/** Unwritable on purpose: any temp-file attempt by native code fails. */
const NO_TMP = process.platform === "win32" ? "C:\\nonexistent-no-temp-files" : "/nonexistent-no-temp-files";

/** The worker built next to the running entrypoint (dist/decoder-worker.js). */
export function defaultWorkerPath(): string {
  const here = fileURLToPath(import.meta.url);
  // Bundled: dist/main.js -> dist/decoder-worker.js. Source (tests, tsx):
  // src/image/decoder-pool.ts -> dist/decoder-worker.js (built by scripts/build.mjs).
  return here.endsWith(".js") ? join(dirname(here), "decoder-worker.js") : join(dirname(here), "..", "..", "dist", "decoder-worker.js");
}

/** The ONLY environment a decoder child gets. */
export function decoderEnv(): Record<string, string> {
  return { VIPS_DISC_THRESHOLD: "2g", TMPDIR: NO_TMP, TMP: NO_TMP, TEMP: NO_TMP };
}

/**
 * What a decoder child may read: its own bundle and sharp with its native
 * libvips binaries and runtime dependencies. Nothing else in the app root
 * (no package.json, no src/, no .env in a non-container run).
 */
export const DECODER_READABLE_PACKAGES = ["sharp", "@img", "detect-libc", "semver"] as const;

export function decoderReadPaths(workerPath: string): string[] {
  // The app root holds dist/ and node_modules/ (sharp's native addon).
  const appRoot = dirname(dirname(workerPath));
  return [workerPath, ...DECODER_READABLE_PACKAGES.map((p) => join(appRoot, "node_modules", p, "*"))];
}

/** Node flags for a decoder child; exported so tests can prove what they deny. */
export function decoderExecArgv(workerPath: string, maxOldSpaceMb = 256): string[] {
  return [
    "--permission",
    "--allow-addons", // sharp is a native addon; see README for what this implies
    ...decoderReadPaths(workerPath).map((p) => `--allow-fs-read=${p}`),
    `--max-old-space-size=${maxOldSpaceMb}`,
    "--disallow-code-generation-from-strings",
    "--no-warnings",
  ];
}

type Task = {
  bytes: Uint8Array;
  /** True once this image has been re-run after its child died. */
  retried: boolean;
  resolve: (r: DecodeResult) => void;
  reject: (e: CrawlError) => void;
};

type Slot = {
  child: ChildProcess | null;
  /** Tasks the current child has answered. */
  tasksDone: number;
  task: (Task & { id: number; timer: NodeJS.Timeout }) | null;
};

export class DecoderPool implements ImageDecoder {
  readonly stats: DecoderStats = { started: 0, crashes: 0, timeouts: 0, protocolErrors: 0, recycled: 0, retried: 0 };
  private readonly slots: Slot[];
  private readonly queue: Task[] = [];
  private readonly workerPath: string;
  private readonly maxTasks: number;
  private readonly maxRss: number;
  private nextId = 1;
  private closed = false;

  constructor(private readonly opts: DecoderPoolOptions) {
    this.workerPath = opts.workerPath ?? defaultWorkerPath();
    this.maxTasks = Math.max(1, opts.maxTasksPerChild ?? DEFAULT_MAX_TASKS_PER_CHILD);
    this.maxRss = opts.maxChildRssBytes ?? DEFAULT_MAX_CHILD_RSS_BYTES;
    this.slots = Array.from({ length: Math.max(1, opts.size) }, () => ({ child: null, tasksDone: 0, task: null }));
  }

  hash(bytes: Buffer): Promise<DecodeResult> {
    if (this.closed) return Promise.reject(new CrawlError("aborted"));
    return new Promise((resolve, reject) => {
      // Copy into a fresh, exactly-sized view: never send a slice of a larger
      // pooled buffer (it could carry unrelated bytes across the boundary).
      this.queue.push({ bytes: new Uint8Array(bytes), retried: false, resolve, reject });
      this.pump();
    });
  }

  private pump(): void {
    for (const slot of this.slots) {
      if (this.queue.length === 0) return;
      if (slot.task) continue;
      const task = this.queue.shift()!;
      this.run(slot, task);
    }
  }

  private spawn(slot: Slot): ChildProcess {
    const child = fork(this.workerPath, [], {
      execArgv: decoderExecArgv(this.workerPath, this.opts.maxOldSpaceMb),
      env: decoderEnv(),
      cwd: dirname(dirname(this.workerPath)),
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      serialization: "advanced",
    });
    this.stats.started++;
    child.on("message", (m: unknown) => this.onMessage(slot, child, m));
    child.on("exit", () => this.onExit(slot, child));
    child.on("error", () => this.onExit(slot, child));
    return child;
  }

  private run(slot: Slot, task: Task): void {
    if (!slot.child) {
      slot.child = this.spawn(slot);
      slot.tasksDone = 0;
    }
    const id = this.nextId++;
    const timer = setTimeout(() => {
      this.stats.timeouts++;
      this.fail(slot, "image_decode_timeout");
    }, this.opts.taskTimeoutMs);
    slot.task = { ...task, id, timer };
    const child = slot.child;
    child.send({ id, bytes: task.bytes, minSide: this.opts.minSide }, (err) => {
      // The child went away before taking the task: same as dying mid-task.
      if (err && slot.child === child) {
        child.kill("SIGKILL");
        this.onExit(slot, child);
      }
    });
  }

  private onMessage(slot: Slot, child: ChildProcess, m: unknown): void {
    const task = slot.task;
    if (slot.child !== child || !task) return;
    const r = parseReply(m, task.id);
    if (!r) {
      // A reply we did not ask for, or with the wrong shape: treat the child
      // as compromised and replace it.
      this.stats.protocolErrors++;
      this.fail(slot, "image_decoder_crashed");
      return;
    }
    clearTimeout(task.timer);
    slot.task = null;
    slot.tasksDone++;
    // The parent decides recycling, before this child is given another task,
    // so no image is ever handed to a child that is about to exit.
    if (slot.tasksDone >= this.maxTasks || r.rss > this.maxRss) this.retire(slot);
    if (r.ok) task.resolve({ pdq: r.pdq, quality: r.quality });
    else task.reject(new CrawlError(r.code));
    this.pump();
  }

  /** Replace an idle child; the next task spawns a fresh one. */
  private retire(slot: Slot): void {
    const child = slot.child;
    slot.child = null;
    slot.tasksDone = 0;
    if (!child) return;
    this.stats.recycled++;
    child.kill("SIGKILL");
  }

  private onExit(slot: Slot, child: ChildProcess): void {
    if (slot.child !== child) return;
    slot.child = null;
    slot.tasksDone = 0;
    if (slot.task) {
      this.stats.crashes++;
      const task = slot.task;
      clearTimeout(task.timer);
      slot.task = null;
      if (!task.retried && !this.closed) {
        // The child died before answering: the image may be fine (the child
        // could have died of something else). Run it once more on a fresh
        // child; a second death is final, so a poison image cannot loop.
        this.stats.retried++;
        this.queue.unshift({ bytes: task.bytes, retried: true, resolve: task.resolve, reject: task.reject });
      } else {
        task.reject(new CrawlError("image_decoder_crashed"));
      }
    }
    // An idle child that exits is respawned lazily.
    this.pump();
  }

  /** Kill the slot's child, reject its task, and carry on with a fresh child. */
  private fail(slot: Slot, code: ErrorCode): void {
    const task = slot.task;
    const child = slot.child;
    slot.task = null;
    slot.child = null;
    if (task) {
      clearTimeout(task.timer);
      task.reject(new CrawlError(code));
    }
    slot.tasksDone = 0;
    child?.kill("SIGKILL");
    this.pump();
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const t of this.queue.splice(0)) t.reject(new CrawlError("aborted"));
    await Promise.all(
      this.slots.map(async (slot) => {
        const child = slot.child;
        if (slot.task) this.fail(slot, "aborted");
        slot.child = null;
        if (!child || child.exitCode !== null) return;
        await new Promise<void>((r) => {
          child.once("exit", () => r());
          child.kill("SIGKILL");
        });
      }),
    );
  }
}

type Reply = { ok: true; pdq: string; quality: number; rss: number } | { ok: false; code: ErrorCode; rss: number };

/** Strictly validate a child's reply; null for anything unexpected. */
export function parseReply(m: unknown, expectedId: number): Reply | null {
  if (!m || typeof m !== "object" || Array.isArray(m)) return null;
  const r = m as Record<string, unknown>;
  if (r.id !== expectedId) return null;
  const keys = Object.keys(r).sort().join(",");
  // Resident set size in bytes, reported with every reply for recycling.
  if (typeof r.rss !== "number" || !Number.isSafeInteger(r.rss) || r.rss < 0) return null;
  if (r.ok === true) {
    if (keys !== "id,ok,pdq,quality,rss") return null;
    if (typeof r.pdq !== "string" || !HEX64.test(r.pdq)) return null;
    if (typeof r.quality !== "number" || !Number.isFinite(r.quality) || r.quality < 0 || r.quality > 100) return null;
    return { ok: true, pdq: r.pdq, quality: r.quality, rss: r.rss };
  }
  if (r.ok === false) {
    if (keys !== "code,id,ok,rss") return null;
    if (typeof r.code !== "string" || !ERROR_SET.has(r.code)) return null;
    return { ok: false, code: r.code as ErrorCode, rss: r.rss };
  }
  return null;
}
