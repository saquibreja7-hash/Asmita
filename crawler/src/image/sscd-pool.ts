/**
 * Runs SSCD embeddings in a separate child process (WP28) — the second
 * isolated child next to the decoder, with the same discipline
 * (decoder-pool.ts, which this file mirrors):
 *
 *   - the child gets ONLY image bytes and a minimum side, and returns ONLY
 *     a fixed-shape vector and its RSS, or a fixed error code; replies are
 *     validated strictly and anything unexpected kills the child;
 *   - scrubbed environment (no key, no config); the model path and the
 *     expected dimension ride its argv — neither is secret, and the
 *     service key is never there;
 *   - Node's permission model: no fs writes, no child processes, no worker
 *     threads, fs reads limited to its own bundle, sharp, onnxruntime-node
 *     and the pinned model file;
 *   - a JS heap cap; native memory is bounded by the pixel limit, the byte
 *     cap and the model's own size, and the parent recycles the child by
 *     task count and reported RSS;
 *   - a per-task timeout: on timeout or crash it is killed and replaced;
 *     an image whose child died before answering is retried ONCE on a
 *     fresh child (never more);
 *   - stdout/stderr discarded: crash output never reaches our logs.
 *
 * A separate child rather than a third request kind on the decoder child,
 * because onnxruntime's native memory profile (the ~98 MB model resident
 * plus its working set) is very different from sharp's: the decoder's
 * budgets, protocol and tests stay untouched, and nothing about it changes
 * while ENABLE_SSCD is off — this child is never spawned then.
 */
import { fork, type ChildProcess } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CrawlError, ERROR_CODES, type ErrorCode } from "../errors.ts";
import { decoderEnv, DECODER_READABLE_PACKAGES } from "./decoder-pool.ts";

/** What the crawler needs from an embedder (tests substitute their own). */
export type SscdDecoder = {
  embed(bytes: Buffer): Promise<number[]>;
  close(): Promise<void>;
  readonly stats: SscdStats;
};

export type SscdStats = {
  started: number;
  crashes: number;
  timeouts: number;
  protocolErrors: number;
  /** Children retired by the parent (task count or RSS), never mid-task. */
  recycled: number;
  /** Images re-run on a fresh child after their child died before answering. */
  retried: number;
};

/**
 * Parent-side recycling. Larger than the decoder's 768 MB on purpose: the
 * ONNX runtime keeps the ~98 MB model resident plus a working set, so an
 * honest child would otherwise be recycled on every task. Still bounded.
 */
export const DEFAULT_MAX_SSCD_TASKS_PER_CHILD = 500;
export const DEFAULT_MAX_SSCD_CHILD_RSS_BYTES = 1536 * 1024 * 1024;

export type SscdPoolOptions = {
  size: number;
  taskTimeoutMs: number;
  minSide: number;
  /** Where the pinned ONNX weights live (SSCD_MODEL_FILE). */
  modelPath: string;
  /** The embedding dimension every reply must carry (SSCD_EMBED_DIM). */
  expectedDim: number;
  /** JS heap cap per child, MB. Default 512: the model is native memory. */
  maxOldSpaceMb?: number;
  /** Override the worker script (tests use a fake worker). */
  workerPath?: string;
  /** Retire a child after this many answered tasks (tests inject a low value). */
  maxTasksPerChild?: number;
  /** Retire a child whose reported RSS exceeds this, in bytes. */
  maxChildRssBytes?: number;
};

const ERROR_SET = new Set<string>(ERROR_CODES);

/** The worker built next to the running entrypoint (dist/sscd-worker.js). */
export function defaultSscdWorkerPath(): string {
  const here = fileURLToPath(import.meta.url);
  // Bundled: dist/main.js -> dist/sscd-worker.js. Source (tests, tsx):
  // src/image/sscd-pool.ts -> dist/sscd-worker.js (built by scripts/build.mjs).
  return here.endsWith(".js") ? join(dirname(here), "sscd-worker.js") : join(dirname(here), "..", "..", "dist", "sscd-worker.js");
}

/**
 * What an SSCD child may read: its own bundle, sharp/libvips and the
 * onnxruntime packages with their native binaries, and the pinned model
 * file. Nothing else in the app root.
 */
export const SSCD_READABLE_PACKAGES = [...DECODER_READABLE_PACKAGES, "onnxruntime-node", "onnxruntime-common"] as const;

export function sscdReadPaths(workerPath: string, modelPath: string): string[] {
  const appRoot = dirname(dirname(workerPath));
  return [workerPath, modelPath, ...SSCD_READABLE_PACKAGES.map((p) => join(appRoot, "node_modules", p, "*"))];
}

/** Node flags for an SSCD child; exported so tests can prove what they deny. */
export function sscdExecArgv(workerPath: string, modelPath: string, maxOldSpaceMb = 512): string[] {
  return [
    "--permission",
    "--allow-addons", // sharp and onnxruntime-node are native addons
    ...sscdReadPaths(workerPath, modelPath).map((p) => `--allow-fs-read=${p}`),
    `--max-old-space-size=${maxOldSpaceMb}`,
    "--disallow-code-generation-from-strings",
    "--no-warnings",
  ];
}

type Task = {
  bytes: Uint8Array;
  /** True once this image has been re-run after its child died. */
  retried: boolean;
  settle: (vector: number[]) => void;
  reject: (e: CrawlError) => void;
};

type Slot = {
  child: ChildProcess | null;
  /** Tasks the current child has answered. */
  tasksDone: number;
  task: (Task & { id: number; timer: NodeJS.Timeout }) | null;
};

export class SscdPool implements SscdDecoder {
  readonly stats: SscdStats = { started: 0, crashes: 0, timeouts: 0, protocolErrors: 0, recycled: 0, retried: 0 };
  private readonly slots: Slot[];
  private readonly queue: Task[] = [];
  private readonly workerPath: string;
  private readonly maxTasks: number;
  private readonly maxRss: number;
  private nextId = 1;
  private closed = false;

  constructor(private readonly opts: SscdPoolOptions) {
    this.workerPath = opts.workerPath ?? defaultSscdWorkerPath();
    this.maxTasks = Math.max(1, opts.maxTasksPerChild ?? DEFAULT_MAX_SSCD_TASKS_PER_CHILD);
    this.maxRss = opts.maxChildRssBytes ?? DEFAULT_MAX_SSCD_CHILD_RSS_BYTES;
    this.slots = Array.from({ length: Math.max(1, opts.size) }, () => ({ child: null, tasksDone: 0, task: null }));
  }

  embed(bytes: Buffer): Promise<number[]> {
    if (this.closed) return Promise.reject(new CrawlError("aborted"));
    return new Promise((resolve, reject) => {
      // Copy into a fresh, exactly-sized view: never send a slice of a
      // larger pooled buffer across the boundary.
      this.queue.push({ bytes: new Uint8Array(bytes), retried: false, settle: resolve, reject });
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
    const child = fork(this.workerPath, [this.opts.modelPath, String(this.opts.expectedDim)], {
      execArgv: sscdExecArgv(this.workerPath, this.opts.modelPath, this.opts.maxOldSpaceMb),
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
      this.fail(slot, "sscd_timeout");
    }, this.opts.taskTimeoutMs);
    slot.task = { ...task, id, timer };
    const child = slot.child;
    // The same three-field request shape the decoder child always had.
    child.send({ id, bytes: task.bytes, minSide: this.opts.minSide }, (err) => {
      if (err && slot.child === child) {
        child.kill("SIGKILL");
        this.onExit(slot, child);
      }
    });
  }

  private onMessage(slot: Slot, child: ChildProcess, m: unknown): void {
    const task = slot.task;
    if (slot.child !== child || !task) return;
    const r = parseSscdReply(m, task.id, this.opts.expectedDim);
    if (r === null) {
      // A reply we did not ask for, or with the wrong shape: treat the
      // child as compromised and replace it.
      this.stats.protocolErrors++;
      this.fail(slot, "sscd_worker_crashed");
      return;
    }
    clearTimeout(task.timer);
    slot.task = null;
    slot.tasksDone++;
    if (slot.tasksDone >= this.maxTasks || r.rss > this.maxRss) this.retire(slot);
    if (r.ok === false) task.reject(new CrawlError(r.code));
    else task.settle(r.vector);
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
        // The child died before answering: the image may be fine. Run it
        // once more on a fresh child; a second death is final.
        this.stats.retried++;
        this.queue.unshift({ bytes: task.bytes, retried: true, settle: task.settle, reject: task.reject });
      } else {
        task.reject(new CrawlError("sscd_worker_crashed"));
      }
    }
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

type Reply =
  | { ok: true; vector: number[]; rss: number }
  | { ok: false; code: ErrorCode; rss: number };

/**
 * Strictly validate an SSCD child's reply; null for anything unexpected.
 * The vector must be exactly the configured dimension, all finite, all
 * within the L2-normalised range (rounded to 1e-6, so a little slack) —
 * anything else is a child that is not the protocol.
 */
export function parseSscdReply(m: unknown, expectedId: number, expectedDim: number): Reply | null {
  if (!m || typeof m !== "object" || Array.isArray(m)) return null;
  const r = m as Record<string, unknown>;
  if (r.id !== expectedId) return null;
  const keys = Object.keys(r).sort().join(",");
  if (typeof r.rss !== "number" || !Number.isSafeInteger(r.rss) || r.rss < 0) return null;
  if (r.ok === true) {
    if (keys !== "id,ok,rss,vector" || !Array.isArray(r.vector) || r.vector.length !== expectedDim) return null;
    for (const v of r.vector) {
      if (typeof v !== "number" || !Number.isFinite(v) || v < -1.001 || v > 1.001) return null;
    }
    return { ok: true, vector: r.vector, rss: r.rss };
  }
  if (r.ok === false) {
    if (keys !== "code,id,ok,rss") return null;
    if (typeof r.code !== "string" || !ERROR_SET.has(r.code)) return null;
    return { ok: false, code: r.code as ErrorCode, rss: r.rss };
  }
  return null;
}
