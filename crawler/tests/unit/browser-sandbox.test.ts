/**
 * WP25 unit tests: the sandbox decision (every branch of the plan), the
 * Chromium launch flags (the sandboxed variant must never carry
 * --no-sandbox), the config override (strict, default false), and the
 * worker's environment and argv never containing the service key, its file
 * path, or anything else from the parent (defence in depth, on top of the
 * separate uid the container image gives the worker).
 */
import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../../src/config.ts";
import { chromiumArgs } from "../../src/browser/chromium-args.ts";
import { browserWorkerEnv, browserWorkerExecArgv } from "../../src/browser/browser-renderer.ts";
import { LaunchMessageSchema, ReadyMessageSchema, WORKER_FAIL_CODES } from "../../src/browser/protocol.ts";
import { sandboxLaunchPlan } from "../../src/browser/sandbox.ts";

describe("sandbox launch plan (WP25)", () => {
  it("renders sandboxed whenever the sandboxed launch works", () => {
    expect(sandboxLaunchPlan(true, false)).toEqual({ useSandbox: true, renderingAllowed: true });
    // The override changes nothing when the sandbox works: --no-sandbox is
    // never passed for a working sandbox.
    expect(sandboxLaunchPlan(true, true)).toEqual({ useSandbox: true, renderingAllowed: true });
  });

  it("fails closed when the runtime refuses the sandbox", () => {
    expect(sandboxLaunchPlan(false, false)).toEqual({ useSandbox: false, renderingAllowed: false });
  });

  it("renders unsandboxed only under the local-development override", () => {
    expect(sandboxLaunchPlan(false, true)).toEqual({ useSandbox: false, renderingAllowed: true });
  });
});

describe("chromium launch flags (WP25)", () => {
  it("never passes --no-sandbox when the sandbox is on", () => {
    const args = chromiumArgs(true);
    expect(args).not.toContain("--no-sandbox");
  });

  it("passes --no-sandbox only on the override path", () => {
    expect(chromiumArgs(false)).toContain("--no-sandbox");
  });

  it("keeps the cache and WebRTC flags in both modes", () => {
    for (const sandboxed of [true, false]) {
      const args = chromiumArgs(sandboxed);
      expect(args).toContain("--disable-dev-shm-usage");
      expect(args).toContain("--disk-cache-size=0");
      expect(args).toContain("--media-cache-size=0");
      expect(args).toContain("--force-webrtc-ip-handling-policy=disable_non_proxied_udp");
      expect(args).toContain("--webrtc-ip-handling-policy=disable_non_proxied_udp");
    }
  });
});

describe("CRAWLER_ALLOW_UNSANDBOXED_BROWSER config (WP25)", () => {
  const base = {
    ASMITA_API_URL: "https://asmita.example",
    CRAWLER_SERVICE_KEY: "test-service-key-0123456789-abcdefghij",
    CRAWLER_USER_AGENT: "AsmitaCrawler/0.1 (+https://asmita.example/crawler)",
  };

  it("defaults to false (fail closed)", () => {
    expect(loadConfig(base).CRAWLER_ALLOW_UNSANDBOXED_BROWSER).toBe(false);
  });

  it("accepts only the exact literals", () => {
    expect(loadConfig({ ...base, CRAWLER_ALLOW_UNSANDBOXED_BROWSER: "true" }).CRAWLER_ALLOW_UNSANDBOXED_BROWSER).toBe(true);
    expect(loadConfig({ ...base, CRAWLER_ALLOW_UNSANDBOXED_BROWSER: "false" }).CRAWLER_ALLOW_UNSANDBOXED_BROWSER).toBe(false);
    // A typo is a startup failure, never a silent enable.
    for (const bad of ["TRUE", "yes", "1"]) {
      try {
        loadConfig({ ...base, CRAWLER_ALLOW_UNSANDBOXED_BROWSER: bad });
        expect.unreachable("config must reject the value");
      } catch (err) {
        expect(err).toBeInstanceOf(ConfigError);
        expect((err as ConfigError).keys).toContain("CRAWLER_ALLOW_UNSANDBOXED_BROWSER");
      }
    }
  });
});

describe("the worker never holds the key (WP25)", () => {
  const KEY = "cwk_0123456789abcdef0123456789abcdef0123456789abcdef";
  const KEY_FILE = "/secrets/crawler-service-key";

  it("environment is the fixed allowlist: no key, no key file path", () => {
    const env = browserWorkerEnv("/dev/shm", "/app/browsers");
    expect(Object.keys(env).sort()).toEqual(["HOME", "PLAYWRIGHT_BROWSERS_PATH", "TEMP", "TMP", "TMPDIR"].sort());
    const flat = JSON.stringify(env);
    expect(flat).not.toContain(KEY);
    expect(flat).not.toContain("CRAWLER_SERVICE_KEY");
    expect(flat).not.toContain(KEY_FILE);
    expect(flat).not.toContain("crawler-service-key");
  });

  it("argv carries no key and never grants /proc", () => {
    const argv = browserWorkerExecArgv("/app/dist/browser-worker.js", "/dev/shm", "/app/browsers");
    const flat = argv.join(" ");
    expect(flat).not.toContain(KEY);
    expect(flat).not.toContain("CRAWLER_SERVICE_KEY");
    expect(flat).not.toContain(KEY_FILE);
    expect(argv).toContain("--permission");
    expect(argv.some((a) => a.startsWith("--allow-fs-read=/proc"))).toBe(false);
    expect(argv.some((a) => a.startsWith("--allow-fs-read=") && a.includes(KEY_FILE))).toBe(false);
  });
});

describe("the launch protocol carries the sandbox mode (WP25)", () => {
  it("a launch message must say whether Chromium runs sandboxed", () => {
    const ok = LaunchMessageSchema.safeParse({ kind: "launch", proxyPort: 1, userAgentSuffix: "AsmitaCrawler/0.1", sandboxed: true });
    expect(ok.success).toBe(true);
    const missing = LaunchMessageSchema.safeParse({ kind: "launch", proxyPort: 1, userAgentSuffix: "AsmitaCrawler/0.1" });
    expect(missing.success).toBe(false);
  });

  it("the ready answer confirms the mode and reports the worker's uid", () => {
    const ok = ReadyMessageSchema.safeParse({ kind: "ready", sandboxed: true, uid: 30000 });
    expect(ok.success).toBe(true);
    expect(ReadyMessageSchema.safeParse({ kind: "ready" }).success).toBe(false);
    expect(ReadyMessageSchema.safeParse({ kind: "ready", sandboxed: true, uid: -1 }).success).toBe(false);
  });

  it("the worker reports the sandbox refusal under its own code", () => {
    expect(WORKER_FAIL_CODES).toContain("browser_sandbox_unavailable");
  });
});
