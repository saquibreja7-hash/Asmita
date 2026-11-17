/**
 * The parent-side manager for browser rendering (crawler v2 WP7).
 *
 * Owns two things:
 *   - the in-process SOCKS5 proxy (net/browser-proxy.ts) that applies the
 *     address policy to all browser traffic, started with the same NetPolicy
 *     safe-fetch uses;
 *   - one worker child process (dist/browser-worker.js) that hosts Playwright
 *     Chromium. The worker is spawned lazily (sources that never need a
 *     browser never pay for one), gets a scrubbed environment and Node's
 *     permission model, and is killed and replaced on any protocol
 *     violation, timeout or crash — the decoder pool applies the same rules.
 *
 * Renders are serialised: one page at a time, always. A source crawling in
 * parallel with another simply waits for the shared worker. The pool, the
 * matcher and the service key stay in this process; the worker only ever
 * sees the page it is told to render, the bytes it hands back, and
 * yes/no verdicts.
 */
import { fork, type ChildProcess } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ErrorCode } from "../errors.ts";
import type { Logger } from "../log.ts";
import type { RunMetrics } from "../metrics.ts";
import type { NetPolicy } from "../net/policy.ts";
import { BrowserProxy } from "../net/browser-proxy.ts";
import {
  AbortMessageSchema,
  LaunchMessageSchema,
  RenderMessageSchema,
  StopMessageSchema,
  VerdictMessageSchema,
  parseWorkerMessage,
  type RenderMessage,
} from "./protocol.ts";

/** The worker built next to the running entrypoint (dist/browser-worker.js). */
export function defaultBrowserWorkerPath(): string {
  const here = fileURLToPath(import.meta.url);
  return here.endsWith(".js") ? join(dirname(here), "browser-worker.js") : join(dirname(here), "..", "..", "dist", "browser-worker.js");
}

/** Where Playwright's Chromium lives unless configured otherwise. */
export function defaultBrowsersPath(): string {
  return join(homedir(), ".cache", "ms-playwright");
}

/** The ONLY environment the browser worker gets: no key, no config. */
export function browserWorkerEnv(tmpDir: string, browsersPath: string): Record<string, string> {
  return { TMPDIR: tmpDir, TMP: tmpDir, TEMP: tmpDir, HOME: tmpDir, PLAYWRIGHT_BROWSERS_PATH: browsersPath };
}

/** Node flags for the worker: reads confined to its bundle, playwright-core,
 *  the browser and system metadata; writes confined to the memory temp dir. */
export function browserWorkerExecArgv(workerPath: string, tmpDir: string, browsersPath: string): string[] {
  const appRoot = dirname(dirname(workerPath));
  return [
    "--permission",
    "--allow-child-process",
    `--allow-fs-read=${workerPath}`,
    // The directory listing of node_modules is needed to resolve the import
    // of playwright-core; the package files themselves are granted below.
    `--allow-fs-read=${join(appRoot, "node_modules")}`,
    `--allow-fs-read=${join(appRoot, "node_modules", "playwright-core", "*")}`,
    `--allow-fs-read=${browsersPath}`,
    `--allow-fs-read=${join(browsersPath, "*")}`,
    // No /proc: the worker's Node code does not need it (Playwright's only
    // /proc reads are WSL/Docker probes in its xdg-open helper, which catch
    // the denial), and /proc/<pid>/environ of the parent would hold the
    // service key if it were ever passed inline. Chromium is a separate
    // native process and is not bound by Node's permission model either way.
    "--allow-fs-read=/etc/*",
    "--allow-fs-read=/sys/*",
    "--allow-fs-read=/dev/*",
    `--allow-fs-read=${tmpDir}/*`,
    `--allow-fs-write=${tmpDir}`,
    "--max-old-space-size=512",
    "--no-warnings",
  ];
}

export type BrowserImage = { url: URL; contentType: string; bytes: Buffer };

export type BrowserRenderResult =
  | { ok: true; url: URL; status: number; html: string; truncated: boolean; requests: number; imagesSkipped: number }
  | { ok: false; code: ErrorCode };

export type BrowserRendererOptions = {
  policy: NetPolicy;
  config: {
    userAgent: string;
    tmpDir: string;
    pageTimeoutMs: number;
    scrolls: number;
    scrollWaitMs: number;
    maxRequests: number;
    maxPageBytes: number;
    maxImages: number;
    maxImageBytes: number;
    maxHtmlBytes: number;
    connectTimeoutMs: number;
    /** Grace beyond the page deadline before the worker is SIGKILLed (tests lower it). */
    renderGraceMs?: number;
    /** How long close() waits for a graceful stop before SIGKILL (tests lower it). */
    stopGraceMs?: number;
  };
  /** Override the worker script (tests use a fake worker). */
  workerPath?: string;
  /** Where Playwright's Chromium is installed. */
  browsersPath?: string;
  log: Logger;
  metrics: RunMetrics;
  /** May the page request this URL? (robots.txt; the parent owns the rules.) */
  checkRequest?: (url: URL, resourceType: string) => Promise<boolean>;
};

/** Give up launching after this many consecutive failures (fail closed). */
const MAX_LAUNCH_FAILURES = 2;
const LAUNCH_TIMEOUT_MS = 30_000;
/** Default grace beyond the page deadline, then SIGKILL. */
const DEFAULT_RENDER_GRACE_MS = 10_000;
const KILL_GRACE_MS = 5_000;
/** close(): wait this long for the worker to stop gracefully, then SIGKILL. */
const STOP_GRACE_MS = 5_000;

type ActiveRender = {
  id: number;
  resolve: (r: BrowserRenderResult) => void;
  onImage: (img: BrowserImage) => Promise<boolean>;
  settled: boolean;
  overBudget: boolean;
  deadline: NodeJS.Timeout;
  killTimer: NodeJS.Timeout | null;
};

export class BrowserRenderer {
  private proxy: BrowserProxy | null = null;
  private child: ChildProcess | null = null;
  private nextRenderId = 1;
  private launchFailures = 0;
  private dead = false;
  private chain: Promise<unknown> = Promise.resolve();
  private current: ActiveRender | null = null;
  private readonly workerPath: string;
  private readonly browsersPath: string;

  constructor(private readonly opts: BrowserRendererOptions) {
    this.workerPath = opts.workerPath ?? defaultBrowserWorkerPath();
    this.browsersPath = opts.browsersPath ?? defaultBrowsersPath();
  }

  /**
   * Render one page. Serialised: one page at a time, always. The onImage
   * callback receives intercepted image responses while the page loads and
   * may return false to abort the render early (budget, stop).
   */
  render(url: URL, scopeHost: string, onImage: (img: BrowserImage) => Promise<boolean>, signal?: AbortSignal): Promise<BrowserRenderResult> {
    const run = () => this.renderOne(url, scopeHost, onImage, signal);
    const result = this.chain.then(run, run);
    this.chain = result.catch(() => undefined);
    return result;
  }

  /**
   * Stop everything: abort the active render, ask the worker to stop (it
   * closes Chromium, so Playwright removes its temporary profile), SIGKILL
   * it if it has not exited within the grace, and close the proxy.
   */
  async close(): Promise<void> {
    this.dead = true;
    this.failCurrent("browser_aborted");
    const child = this.child;
    this.child = null;
    if (child && child.exitCode === null && child.signalCode === null) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => child.kill("SIGKILL"), this.opts.config.stopGraceMs ?? STOP_GRACE_MS);
        child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
        try {
          if (child.connected) child.send(StopMessageSchema.parse({ kind: "stop" }));
          else child.kill("SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      });
    }
    await this.proxy?.stop();
    this.proxy = null;
  }

  // --- worker lifecycle -------------------------------------------------------

  private killWorker(): void {
    const child = this.child;
    this.child = null;
    child?.kill("SIGKILL");
  }

  private spawnWorker(): ChildProcess {
    const child = fork(this.workerPath, [], {
      execArgv: browserWorkerExecArgv(this.workerPath, this.opts.config.tmpDir, this.browsersPath),
      env: browserWorkerEnv(this.opts.config.tmpDir, this.browsersPath),
      cwd: dirname(dirname(this.workerPath)),
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      serialization: "advanced",
    });
    // Crash output never reaches our logs; only exit codes and counters.
    // Exit/error handlers check the identity: a stale exit of a worker we
    // already replaced must not take the new one down with it.
    child.on("message", (m: unknown) => this.onWorkerMessage(m));
    const gone = () => {
      if (this.child === child) {
        this.child = null;
        this.failCurrent("browser_failed");
      }
    };
    child.on("exit", gone);
    child.on("error", gone);
    return child;
  }

  private async ensureWorker(): Promise<{ ok: true } | { ok: false; code: ErrorCode }> {
    if (this.dead) return { ok: false, code: "browser_launch_failed" };
    if (this.child && this.child.connected) return { ok: true };
    if (!this.proxy) {
      this.proxy = new BrowserProxy(this.opts.policy, {
        maxBytes: this.opts.config.maxPageBytes,
        connectTimeoutMs: this.opts.config.connectTimeoutMs,
        onRefusal: (code) => this.opts.metrics.error(code),
      });
      await this.proxy.start();
    }
    const child = this.spawnWorker();
    this.child = child;
    const launch = LaunchMessageSchema.parse({
      kind: "launch",
      proxyPort: this.proxy.listenPort,
      userAgentSuffix: this.opts.config.userAgent,
    });
    const ready = new Promise<boolean>((resolve) => {
      const settle = (v: boolean) => {
        clearTimeout(timer);
        resolve(v);
      };
      const timer = setTimeout(() => settle(false), LAUNCH_TIMEOUT_MS);
      const on = (m: unknown) => {
        const msg = parseWorkerMessage(m);
        if (msg?.kind === "ready") {
          settle(true);
        } else if (msg?.kind === "failed" && msg.id === 0) {
          // The worker could not launch Chromium; do not wait out the timer.
          settle(false);
        }
      };
      child.on("message", on);
      // A worker that dies before saying ready is a failed launch.
      child.on("exit", () => settle(false));
    });
    child.send(launch);
    const launched = await ready;
    if (!launched) {
      this.killWorker();
      this.launchFailures += 1;
      this.opts.log.warn("browser_launch_failed", { code: "browser_launch_failed" });
      if (this.launchFailures >= MAX_LAUNCH_FAILURES) {
        this.dead = true;
        this.opts.log.error("browser_disabled_for_run", { code: "browser_launch_failed" });
      }
      return { ok: false, code: "browser_launch_failed" };
    }
    this.launchFailures = 0;
    return { ok: true };
  }

  // --- protocol ---------------------------------------------------------------

  private onWorkerMessage(raw: unknown): void {
    const msg = parseWorkerMessage(raw);
    if (msg === null) {
      this.opts.metrics.error("browser_protocol");
      this.opts.log.warn("browser_protocol_violation", { code: "browser_protocol" });
      this.killWorker();
      this.failCurrent("browser_protocol");
      return;
    }
    if (msg.kind === "ready" || msg.kind === "stopped") return; // the launch wait / close() handle these
    if (msg.kind === "failed" && msg.id === 0) return; // launch failure handled by the launch wait
    // A render id this renderer never issued is a violation. An id it issued
    // earlier is a stale render still unwinding in the worker (aborted or
    // timed out): its messages are dropped, and its robots questions are
    // answered "no", so it can neither credit images nor fail the current one.
    if (msg.id < 1 || msg.id >= this.nextRenderId) return this.protocolViolation();
    const current = this.current;
    if (!current || msg.id !== current.id) {
      if (msg.kind === "check") {
        const reply = VerdictMessageSchema.safeParse({ kind: "verdict", id: msg.id, seq: msg.seq, allow: false });
        if (reply.success) this.child?.send(reply.data);
      }
      return;
    }
    switch (msg.kind) {
      case "failed":
        this.failCurrent(msg.code === "browser_aborted" ? "browser_aborted" : "browser_failed");
        return;
      case "check": {
        void (async () => {
          let allow: boolean;
          try {
            const u = new URL(msg.url);
            allow = this.opts.checkRequest ? await this.opts.checkRequest(u, msg.resourceType) : false;
          } catch {
            allow = false;
          }
          const reply = VerdictMessageSchema.safeParse({ kind: "verdict", id: current.id, seq: msg.seq, allow });
          if (reply.success) this.child?.send(reply.data);
        })();
        return;
      }
      case "image": {
        if (msg.bytes.byteLength === 0 || msg.bytes.byteLength > this.opts.config.maxImageBytes) {
          return this.protocolViolation();
        }
        let url: URL;
        try {
          url = new URL(msg.url);
        } catch {
          return this.protocolViolation();
        }
        this.opts.metrics.browser.images += 1;
        void current
          .onImage({ url, contentType: msg.contentType, bytes: Buffer.from(msg.bytes) })
          .then((keepGoing) => {
            if (!keepGoing && this.current === current) this.abortRender(current);
          })
          .catch(() => this.abortRender(current));
        return;
      }
      case "rendered": {
        if (msg.html.length > this.opts.config.maxHtmlBytes) return this.protocolViolation();
        const finalUrl = new URL(msg.url);
        this.finish(current, {
          ok: true,
          url: finalUrl,
          status: msg.status,
          html: msg.html,
          truncated: msg.truncated,
          requests: msg.stats.requests,
          imagesSkipped: msg.stats.imagesSkipped,
        });
        return;
      }
    }
  }

  private protocolViolation(): void {
    this.opts.metrics.error("browser_protocol");
    this.opts.log.warn("browser_protocol_violation", { code: "browser_protocol" });
    this.killWorker();
    this.failCurrent("browser_protocol");
  }

  private failCurrent(code: ErrorCode): void {
    const current = this.current;
    if (!current) return;
    this.finish(current, { ok: false, code });
  }

  /** Resolve the active render and clean its timers up. */
  private finish(current: ActiveRender, result: BrowserRenderResult): void {
    if (current.settled) return;
    current.settled = true;
    clearTimeout(current.deadline);
    if (current.killTimer) clearTimeout(current.killTimer);
    if (this.current === current) this.current = null;
    this.proxy?.endAccount();
    if (!result.ok) this.opts.metrics.browser.failed += 1;
    current.resolve(result);
  }

  private abortRender(current: ActiveRender): void {
    if (current.settled || this.current !== current) return;
    const abort = AbortMessageSchema.parse({ kind: "abort", id: current.id });
    this.child?.send(abort);
    // Give the worker a moment to tear the page down, then resolve.
    const killTimer = setTimeout(() => {
      if (this.current === current && !current.settled) {
        this.killWorker();
        this.finish(current, { ok: false, code: "browser_aborted" });
      }
    }, this.opts.config.renderGraceMs ?? KILL_GRACE_MS);
    killTimer.unref?.();
    current.killTimer = killTimer;
  }

  // --- one render -------------------------------------------------------------

  private async renderOne(
    url: URL,
    scopeHost: string,
    onImage: (img: BrowserImage) => Promise<boolean>,
    signal?: AbortSignal,
  ): Promise<BrowserRenderResult> {
    const started = await this.ensureWorker();
    if (!started.ok) return { ok: false, code: started.code };
    this.opts.metrics.browser.renders += 1;
    const child = this.child;
    if (!child) return { ok: false, code: "browser_launch_failed" };
    const id = this.nextRenderId++;
    const message: RenderMessage = RenderMessageSchema.parse({
      kind: "render",
      id,
      url: url.href,
      scopeHost,
      timeoutMs: this.opts.config.pageTimeoutMs,
      scrolls: this.opts.config.scrolls,
      scrollWaitMs: this.opts.config.scrollWaitMs,
      maxRequests: this.opts.config.maxRequests,
      maxImages: this.opts.config.maxImages,
      maxImageBytes: this.opts.config.maxImageBytes,
      maxHtmlBytes: this.opts.config.maxHtmlBytes,
    });
    const result = new Promise<BrowserRenderResult>((resolve) => {
      const current: ActiveRender = {
        id,
        resolve,
        onImage,
        settled: false,
        overBudget: false,
        deadline: setTimeout(() => {
          // Deadline (the worker's own deadline plus a grace) overrun: the
          // worker is SIGKILLed whatever it would answer, so a render that
          // ignores its deadline can never outlive it. The next render
          // spawns a fresh worker.
          if (this.current === current && !current.settled) {
            this.killWorker();
            this.finish(current, { ok: false, code: "browser_timeout" });
          }
        }, this.opts.config.pageTimeoutMs + (this.opts.config.renderGraceMs ?? DEFAULT_RENDER_GRACE_MS)),
        killTimer: null,
      };
      current.deadline.unref?.();
      this.current = current;
      this.proxy?.beginAccount(this.opts.config.maxPageBytes, () => {
        // The page blew its byte budget at the proxy: record and abort.
        this.opts.metrics.error("body_too_large");
        if (current === this.current) {
          current.overBudget = true;
          this.abortRender(current);
        }
      });
      child.send(message);
    });
    if (signal) {
      const onAbort = () => {
        if (this.current) this.abortRender(this.current);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      // A stop that came while this render waited its turn (or the launch).
      if (signal.aborted) onAbort();
      void result.finally(() => signal.removeEventListener("abort", onAbort));
    }
    return result;
  }
}
