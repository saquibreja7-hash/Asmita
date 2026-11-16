/**
 * Runs image decoding + PDQ in separate child processes.
 *
 * Why: libvips is a large native decoder fed attacker-controlled bytes. The
 * fingerprint pool, matcher and service key live in the parent; a decoder
 * exploit in a child process (separate address space) cannot read them.
 * child_process was chosen over worker_threads because worker threads share
 * the parent's address space, so a native-code exploit there could read the
 * pool directly; a process boundary costs one IPC copy per image (measured
 * in README "Decoder isolation").
 *
 * Each child:
 *   - gets ONLY image bytes and a minimum side, and returns ONLY
 *     { pdq, quality } or a fixed error code; replies are validated strictly
 *     and anything unexpected kills the child;
 *   - has a scrubbed environment (decoderEnv(): no key, no config);
 *   - runs under Node's permission model: no fs writes, no child processes,
 *     no worker threads, fs reads limited to the application directory;
 *   - has a JS heap cap; native memory is bounded by the pixel limit and the
 *     image byte cap, and the child recycles itself above an RSS ceiling;
 *   - has a per-task timeout: on timeout or crash it is killed and replaced;
 *   - has stdout/stderr discarded, so crash output (which could contain
 *     bytes) never reaches our logs. Only exit codes are counted.
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

export type DecoderStats = { started: number; crashes: number; timeouts: number; protocolErrors: number };

export type DecoderPoolOptions = {
  size: number;
  taskTimeoutMs: number;
  minSide: number;
  /** JS heap cap per child, MB. */
  maxOldSpaceMb?: number;
  /** Override the worker script (tests use a fake worker). */
  workerPath?: string;
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

/** Node flags for a decoder child; exported so tests can prove what they deny. */
export function decoderExecArgv(workerPath: string, maxOldSpaceMb = 256): string[] {
  // The app root holds dist/ and node_modules/ (sharp's native addon).
  const appRoot = dirname(dirname(workerPath));
  return [
    "--permission",
    "--allow-addons", // sharp is a native addon; see README for what this implies
    `--allow-fs-read=${join(appRoot, "*")}`,
    `--max-old-space-size=${maxOldSpaceMb}`,
    "--disallow-code-generation-from-strings",
    "--no-warnings",
  ];
}

type Task = {
  bytes: Uint8Array;
  resolve: (r: DecodeResult) => void;
  reject: (e: CrawlError) => void;
};

type Slot = {
  child: ChildProcess | null;
  task: (Task & { id: number; timer: NodeJS.Timeout }) | null;
};

export class DecoderPool implements ImageDecoder {
  readonly stats: DecoderStats = { started: 0, crashes: 0, timeouts: 0, protocolErrors: 0 };
  private readonly slots: Slot[];
  private readonly queue: Task[] = [];
  private readonly workerPath: string;
  private nextId = 1;
  private closed = false;

  constructor(private readonly opts: DecoderPoolOptions) {
    this.workerPath = opts.workerPath ?? defaultWorkerPath();
    this.slots = Array.from({ length: Math.max(1, opts.size) }, () => ({ child: null, task: null }));
  }

  hash(bytes: Buffer): Promise<DecodeResult> {
    if (this.closed) return Promise.reject(new CrawlError("aborted"));
    return new Promise((resolve, reject) => {
      // Copy into a fresh, exactly-sized view: never send a slice of a larger
      // pooled buffer (it could carry unrelated bytes across the boundary).
      this.queue.push({ bytes: new Uint8Array(bytes), resolve, reject });
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
    if (!slot.child) slot.child = this.spawn(slot);
    const id = this.nextId++;
    const timer = setTimeout(() => {
      this.stats.timeouts++;
      this.fail(slot, "image_decode_timeout");
    }, this.opts.taskTimeoutMs);
    slot.task = { ...task, id, timer };
    slot.child.send({ id, bytes: task.bytes, minSide: this.opts.minSide }, (err) => {
      if (err) this.fail(slot, "image_decoder_crashed");
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
    if (r.ok) task.resolve({ pdq: r.pdq, quality: r.quality });
    else task.reject(new CrawlError(r.code));
    this.pump();
  }

  private onExit(slot: Slot, child: ChildProcess): void {
    if (slot.child !== child) return;
    slot.child = null;
    if (slot.task) {
      this.stats.crashes++;
      const task = slot.task;
      clearTimeout(task.timer);
      slot.task = null;
      task.reject(new CrawlError("image_decoder_crashed"));
    }
    // An idle child that exits (recycled after MAX_TASKS) is respawned lazily.
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

type Reply = { ok: true; pdq: string; quality: number } | { ok: false; code: ErrorCode };

/** Strictly validate a child's reply; null for anything unexpected. */
export function parseReply(m: unknown, expectedId: number): Reply | null {
  if (!m || typeof m !== "object" || Array.isArray(m)) return null;
  const r = m as Record<string, unknown>;
  if (r.id !== expectedId) return null;
  const keys = Object.keys(r).sort().join(",");
  if (r.ok === true) {
    if (keys !== "id,ok,pdq,quality") return null;
    if (typeof r.pdq !== "string" || !HEX64.test(r.pdq)) return null;
    if (typeof r.quality !== "number" || !Number.isFinite(r.quality) || r.quality < 0 || r.quality > 100) return null;
    return { ok: true, pdq: r.pdq, quality: r.quality };
  }
  if (r.ok === false) {
    if (keys !== "code,id,ok") return null;
    if (typeof r.code !== "string" || !ERROR_SET.has(r.code)) return null;
    return { ok: false, code: r.code as ErrorCode };
  }
  return null;
}
