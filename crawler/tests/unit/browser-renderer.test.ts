/**
 * The BrowserRenderer (WP7) against a fake worker script through the real IPC
 * boundary: the launch handshake, images streamed mid-render, the verdict
 * round-trip, the scrubbed environment, strict protocol validation (a wrong
 * id, an unexpected field or an oversize image kills the worker and fails
 * the render as a protocol violation), the deadline, an aborted render, a
 * crashed worker, and the restart on the next render.
 */
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BrowserRenderer, browserWorkerExecArgv, type BrowserImage } from "../../src/browser/browser-renderer.ts";
import { chromiumArgs } from "../../src/browser/chromium-args.ts";
import { Logger } from "../../src/log.ts";
import { RunMetrics } from "../../src/metrics.ts";
import { productionPolicy } from "../../src/net/policy.ts";

const FAKE_WORKER = fileURLToPath(new URL("../support/fake-browser-worker.mjs", import.meta.url));
const NO_SANDBOX_WORKER = fileURLToPath(new URL("../support/fake-browser-worker-nosandbox.mjs", import.meta.url));

let renderer: BrowserRenderer;
let metrics: RunMetrics;
let lines: string[] = [];
let images: BrowserImage[] = [];
const checkRequests: string[] = [];

type Child = { pid: number; exitCode: number | null; signalCode: string | null; once: (e: string, f: () => void) => void };
const childOf = (r: BrowserRenderer) => (r as unknown as { child: Child | null }).child;
const exited = (c: Child) =>
  new Promise<void>((resolve) => {
    if (c.exitCode !== null || c.signalCode !== null) return resolve();
    c.once("exit", () => resolve());
  });

function make(overrides: { stopGraceMs?: number } = {}): BrowserRenderer {
  metrics = new RunMetrics();
  lines = [];
  images = [];
  checkRequests.length = 0;
  return new BrowserRenderer({
    policy: productionPolicy(),
    workerPath: FAKE_WORKER,
    log: new Logger({ sink: (l) => lines.push(l), level: "debug" }),
    metrics,
    config: {
      userAgent: "AsmitaCrawler/0.1 (test)",
      tmpDir: "/dev/shm",
      pageTimeoutMs: 1000,
      scrolls: 2,
      scrollWaitMs: 10,
      maxRequests: 50,
      maxPageBytes: 1024 * 1024,
      maxImages: 10,
      maxImageBytes: 4096,
      maxHtmlBytes: 64 * 1024,
      connectTimeoutMs: 2000,
      renderGraceMs: 300,
      ...overrides,
    },
    checkRequest: async (u) => {
      checkRequests.push(u.pathname);
      return u.pathname !== "/denied";
    },
  });
}

const render = (path: string, signal?: AbortSignal) =>
  renderer.render(
    new URL(`http://page.test${path}`),
    "page.test",
    (img) => {
      images.push(img);
      return Promise.resolve(true);
    },
    signal,
  );

beforeAll(() => {
  renderer = make();
});

afterAll(async () => {
  await renderer?.close();
});

describe("browser renderer", () => {
  it("launches the worker lazily, streams images and resolves the render", async () => {
    // Nothing is spawned before the first render needs it.
    expect((renderer as unknown as { child: unknown }).child).toBeNull();
    const result = await render("/ok");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.html).toBe("<p>rendered</p>");
    expect(result.url.href).toBe("http://page.test/ok");
    expect(result.requests).toBe(2);
    expect(images).toHaveLength(1);
    expect(images[0]!.url.href).toBe("http://img.example/x.png");
    expect([...images[0]!.bytes]).toEqual([1, 2, 3]);
    expect(metrics.browser.renders).toBe(1);
    expect(metrics.browser.images).toBe(1);
    expect(metrics.browser.failed).toBe(0);
  });

  it("answers the worker's robots question and hands the verdict back", async () => {
    const allowed = await render("/check");
    expect(allowed.ok).toBe(true);
    if (allowed.ok) expect(allowed.html).toBe("verdict:1");
    expect(checkRequests).toEqual(["/sub"]);
  });

  it("spawns the worker with a scrubbed environment and argv", async () => {
    // The parent process carries a secret; the worker must not see it.
    process.env.CRAWLER_TEST_PARENT_SECRET = "parent-secret";
    try {
      const env = await render("/env");
      expect(env.ok).toBe(true);
      if (env.ok) expect(env.html).toBe("env-ok");
    } finally {
      delete process.env.CRAWLER_TEST_PARENT_SECRET;
    }
  });

  it("fails the render and replaces the worker on a wrong render id", async () => {
    const bad = await render("/wrong-id");
    expect(bad).toEqual({ ok: false, code: "browser_protocol" });
    expect(metrics.errors.browser_protocol).toBe(1);
    // The next render spawns a fresh worker and succeeds.
    const good = await render("/ok");
    expect(good.ok).toBe(true);
  });

  it("fails the render on an oversize image message", async () => {
    const bad = await render("/oversize");
    expect(bad).toEqual({ ok: false, code: "browser_protocol" });
  });

  it("fails the render on an unexpected message field", async () => {
    const bad = await render("/junk");
    expect(bad).toEqual({ ok: false, code: "browser_protocol" });
  });

  it("kills a worker that never answers (deadline)", async () => {
    const result = await render("/hang");
    expect(result).toEqual({ ok: false, code: "browser_timeout" });
    // And recovers on a fresh worker.
    const good = await render("/ok");
    expect(good.ok).toBe(true);
  });

  it("resolves an aborted render as browser_aborted", async () => {
    const stop = new AbortController();
    const pending = render("/abort", stop.signal);
    stop.abort();
    const result = await pending;
    expect(result).toEqual({ ok: false, code: "browser_aborted" });
  });

  it("fails the render when the worker dies mid-render", async () => {
    const result = await render("/die");
    expect(result).toEqual({ ok: false, code: "browser_failed" });
    const good = await render("/ok");
    expect(good.ok).toBe(true);
  });

  it("renders one page at a time (serialised)", async () => {
    const results = await Promise.all([render("/ok"), render("/ok"), render("/ok")]);
    for (const r of results) expect(r.ok).toBe(true);
    expect(metrics.browser.renders).toBeGreaterThanOrEqual(3);
  });

  it("fails closed without a checkRequest hook (nothing is allowed)", async () => {
    // A renderer whose checkRequest is undefined denies every request; the
    // fake worker records the verdict, so the html says 0.
    const bare = new BrowserRenderer({
      policy: productionPolicy(),
      workerPath: FAKE_WORKER,
      log: new Logger({ sink: () => undefined }),
      metrics: new RunMetrics(),
      config: {
        userAgent: "AsmitaCrawler/0.1 (test)",
        tmpDir: "/dev/shm",
        pageTimeoutMs: 1000,
        scrolls: 0,
        scrollWaitMs: 0,
        maxRequests: 50,
        maxPageBytes: 1024 * 1024,
        maxImages: 10,
        maxImageBytes: 4096,
        maxHtmlBytes: 64 * 1024,
        connectTimeoutMs: 2000,
        renderGraceMs: 300,
      },
    });
    try {
      const result = await bare.render(new URL("http://page.test/check"), "page.test", () => Promise.resolve(true));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.html).toBe("verdict:0");
    } finally {
      await bare.close();
    }
  });

  it("gives up launching after repeated failures and fails closed thereafter", async () => {
    // A renderer pointed at a script that cannot launch anything: every
    // render answers browser_launch_failed, and after MAX_LAUNCH_FAILURES
    // the renderer is dead for the rest of the run.
    const missing = new BrowserRenderer({
      policy: productionPolicy(),
      workerPath: "/nonexistent/browser-worker.js",
      log: new Logger({ sink: () => undefined }),
      metrics,
      config: {
        userAgent: "AsmitaCrawler/0.1 (test)",
        tmpDir: "/dev/shm",
        pageTimeoutMs: 1000,
        scrolls: 0,
        scrollWaitMs: 0,
        maxRequests: 50,
        maxPageBytes: 1024 * 1024,
        maxImages: 10,
        maxImageBytes: 4096,
        maxHtmlBytes: 64 * 1024,
        connectTimeoutMs: 2000,
        renderGraceMs: 300,
      },
    });
    try {
      const first = await missing.render(new URL("http://page.test/ok"), "page.test", () => Promise.resolve(true));
      expect(first).toEqual({ ok: false, code: "browser_launch_failed" });
      const second = await missing.render(new URL("http://page.test/ok"), "page.test", () => Promise.resolve(true));
      expect(second).toEqual({ ok: false, code: "browser_launch_failed" });
      const third = await missing.render(new URL("http://page.test/ok"), "page.test", () => Promise.resolve(true));
      expect(third).toEqual({ ok: false, code: "browser_launch_failed" });
    } finally {
      await missing.close();
    }
  });

  it("close() kills the worker and stops the proxy", async () => {
    const one = make();
    const result = await one.render(new URL("http://page.test/ok"), "page.test", () => Promise.resolve(true));
    expect(result.ok).toBe(true);
    const child = (one as unknown as { child: { pid: number; exitCode: number | null } }).child;
    expect(child).not.toBeNull();
    await one.close();
    expect((one as unknown as { child: unknown }).child).toBeNull();
  });

  it("SIGKILLs the worker on the deadline even when it would answer the abort", async () => {
    // /abort answers an abort politely; on the deadline the parent must not
    // ask, it kills, so a render that overran can never keep running.
    const before = (await render("/ok")).ok;
    expect(before).toBe(true);
    const child = childOf(renderer)!;
    const result = await render("/abort");
    expect(result).toEqual({ ok: false, code: "browser_timeout" });
    await exited(child);
    expect(child.signalCode).toBe("SIGKILL");
    const good = await render("/ok");
    expect(good.ok).toBe(true);
  });

  it("ignores a stale render's late messages instead of failing the next render", async () => {
    const stop = new AbortController();
    const pending = render("/stale", stop.signal);
    stop.abort();
    expect(await pending).toEqual({ ok: false, code: "browser_aborted" });
    const violations = metrics.errors.browser_protocol ?? 0;
    const imagesBefore = images.length;
    const checksBefore = checkRequests.length;
    // The stale messages arrive while this render is in flight.
    const next = await render("/slow-ok");
    expect(next.ok).toBe(true);
    if (next.ok) expect(next.html).toBe("<p>slow</p>");
    expect(metrics.errors.browser_protocol ?? 0).toBe(violations);
    expect(images.length).toBe(imagesBefore); // the stale image was not credited
    expect(checkRequests.length).toBe(checksBefore); // the stale question was refused unasked
  });

  it("close() stops the worker gracefully when it obeys", async () => {
    const one = make();
    expect((await one.render(new URL("http://page.test/ok"), "page.test", () => Promise.resolve(true))).ok).toBe(true);
    const child = childOf(one)!;
    await one.close();
    await exited(child);
    expect(child.exitCode).toBe(0);
    expect(child.signalCode).toBeNull();
  });

  it("close() SIGKILLs a worker that ignores the stop", async () => {
    const one = make({ stopGraceMs: 200 });
    expect((await one.render(new URL("http://page.test/ignore-stop"), "page.test", () => Promise.resolve(true))).ok).toBe(true);
    const child = childOf(one)!;
    await one.close();
    await exited(child);
    expect(child.signalCode).toBe("SIGKILL");
  });
});

describe("browser worker launch settings", () => {
  it("keeps WebRTC off any path but the proxy (no non-proxied UDP)", () => {
    for (const sandboxed of [true, false]) {
      const args = chromiumArgs(sandboxed);
      expect(args).toContain("--force-webrtc-ip-handling-policy=disable_non_proxied_udp");
      expect(args).toContain("--webrtc-ip-handling-policy=disable_non_proxied_udp");
    }
  });

  it("does not let the worker read /proc", () => {
    const argv = browserWorkerExecArgv("/app/dist/browser-worker.js", "/dev/shm", "/app/browsers");
    expect(argv.some((a) => a.startsWith("--allow-fs-read=/proc"))).toBe(false);
    expect(argv).toContain("--permission");
  });
});

describe("browser sandbox self-test (WP25)", () => {
  /** A renderer around a worker whose sandboxed launches always fail. */
  const noSandboxRenderer = (opts: { allowUnsandboxed: boolean; lines: string[]; metrics: RunMetrics }) =>
    new BrowserRenderer({
      policy: productionPolicy(),
      workerPath: NO_SANDBOX_WORKER,
      log: new Logger({ sink: (l) => opts.lines.push(l), level: "debug" }),
      metrics: opts.metrics,
      config: {
        userAgent: "AsmitaCrawler/0.1 (test)",
        tmpDir: "/dev/shm",
        pageTimeoutMs: 1000,
        scrolls: 0,
        scrollWaitMs: 0,
        maxRequests: 50,
        maxPageBytes: 1024 * 1024,
        maxImages: 10,
        maxImageBytes: 4096,
        maxHtmlBytes: 64 * 1024,
        connectTimeoutMs: 2000,
        renderGraceMs: 300,
        allowUnsandboxed: opts.allowUnsandboxed,
      },
    });

  const firstRender = (r: BrowserRenderer) =>
    r.render(new URL("http://page.test/ok"), "page.test", () => Promise.resolve(true));

  it("records sandbox on when the sandboxed launch answers", async () => {
    const one = make();
    try {
      expect((await firstRender(one)).ok).toBe(true);
      expect(metrics.browser.sandboxTested).toBe(true);
      expect(metrics.browser.sandboxOn).toBe(true);
      expect(metrics.browser.workerUid).toBe(process.getuid?.() ?? 0);
    } finally {
      await one.close();
    }
  });

  it("fails closed when the runtime refuses the sandbox: sticky, no respawn", async () => {
    const lines: string[] = [];
    const m = new RunMetrics();
    const renderer = noSandboxRenderer({ allowUnsandboxed: false, lines, metrics: m });
    try {
      // The self-test ran (the launch was the test): the verdict is recorded
      // in the summary booleans — on/off, never a URL.
      expect(await firstRender(renderer)).toEqual({ ok: false, code: "browser_sandbox_unavailable" });
      expect(m.browser.sandboxTested).toBe(true);
      expect(m.browser.sandboxOn).toBe(false);
      expect(m.browser.workerUid).toBe(-1);
      expect(renderer.renderingRefused()).toBe(true);
      // Every further render answers the same code without spawning a
      // worker: the renderer is refused for the run, logged exactly once.
      expect(await firstRender(renderer)).toEqual({ ok: false, code: "browser_sandbox_unavailable" });
      expect(lines.filter((l) => l.includes("browser_rendering_disabled"))).toHaveLength(1);
      // Refused renders are not counted as render failures in the summary's
      // browser object (no render ever started); the code is in errors.
      expect(m.browser.renders).toBe(0);
      expect(m.browser.failed).toBe(0);
    } finally {
      await renderer.close();
    }
  });

  it("renders unsandboxed only under the local-development override", async () => {
    const lines: string[] = [];
    const m = new RunMetrics();
    const renderer = noSandboxRenderer({ allowUnsandboxed: true, lines, metrics: m });
    try {
      const result = await firstRender(renderer);
      expect(result.ok).toBe(true);
      // The self-test still ran and still recorded its verdict: sandbox off.
      expect(m.browser.sandboxTested).toBe(true);
      expect(m.browser.sandboxOn).toBe(false);
      expect(lines.some((l) => l.includes("browser_unsandboxed_override"))).toBe(true);
      expect(renderer.renderingRefused()).toBe(false);
    } finally {
      await renderer.close();
    }
  });
});
