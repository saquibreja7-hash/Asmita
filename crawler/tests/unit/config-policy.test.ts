/**
 * Config validation (fail closed) and static guarantees about src/:
 * no setting can loosen the network policy, nothing in src/ allows loopback,
 * src/ never imports node:fs or calls sharp's toFile.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ConfigError, ConfigSchema, loadConfig, userAgentToken } from "../../src/config.ts";

const good = {
  ASMITA_API_URL: "https://asmita.example",
  CRAWLER_SERVICE_KEY: "k".repeat(40),
  CRAWLER_USER_AGENT: "AsmitaCrawler/1.0 (+https://asmita.example/crawler)",
};

const keysOf = (env: Record<string, string | undefined>): string[] => {
  try {
    loadConfig(env);
    return [];
  } catch (e) {
    return e instanceof ConfigError ? e.keys : ["not-config-error"];
  }
};

describe("config", () => {
  it("applies safe defaults", () => {
    const c = loadConfig(good);
    expect(c.MAX_HTML_BYTES).toBe(2 * 1024 * 1024);
    expect(c.MAX_IMAGE_BYTES).toBe(10 * 1024 * 1024);
    expect(c.POOL_RESYNC_MINUTES).toBe(30);
    expect(c.GLOBAL_CONCURRENCY).toBe(4);
    expect(userAgentToken(c.CRAWLER_USER_AGENT)).toBe("AsmitaCrawler");
  });
  it("fails closed on missing or malformed values, naming keys only", () => {
    expect(keysOf({})).toEqual(["ASMITA_API_URL", "CRAWLER_SERVICE_KEY", "CRAWLER_USER_AGENT"]);
    expect(keysOf({ ...good, ASMITA_API_URL: "http://asmita.example" })).toEqual(["ASMITA_API_URL"]);
    expect(keysOf({ ...good, ASMITA_API_URL: "https://u:p@asmita.example" })).toEqual(["ASMITA_API_URL"]);
    expect(keysOf({ ...good, ASMITA_API_URL: "https://asmita.example/?x=1" })).toEqual(["ASMITA_API_URL"]);
    expect(keysOf({ ...good, CRAWLER_SERVICE_KEY: "short" })).toEqual(["CRAWLER_SERVICE_KEY"]);
    expect(keysOf({ ...good, CRAWLER_SERVICE_KEY: "has space ".repeat(5) })).toEqual(["CRAWLER_SERVICE_KEY"]);
    expect(keysOf({ ...good, CRAWLER_USER_AGENT: "Mozilla" })).toEqual(["CRAWLER_USER_AGENT"]);
    expect(keysOf({ ...good, POOL_RESYNC_MINUTES: "61" })).toEqual(["POOL_RESYNC_MINUTES"]);
    expect(keysOf({ ...good, GLOBAL_CONCURRENCY: "0" })).toEqual(["GLOBAL_CONCURRENCY"]);
    expect(keysOf({ ...good, MAX_PAGES: "lots" })).toEqual(["MAX_PAGES"]);
    expect(keysOf({ ...good, LOG_LEVEL: "trace" })).toEqual(["LOG_LEVEL"]);
  });
  it("allows plain http only for a loopback mock API", () => {
    expect(keysOf({ ...good, ASMITA_API_URL: "http://127.0.0.1:8787" })).toEqual([]);
    expect(keysOf({ ...good, ASMITA_API_URL: "http://localhost:8787" })).toEqual([]);
    expect(keysOf({ ...good, ASMITA_API_URL: "http://10.0.0.5:8787" })).toEqual(["ASMITA_API_URL"]);
  });
  it("has no setting that could loosen the crawl network policy", () => {
    const keys = Object.keys(ConfigSchema.shape);
    for (const k of keys) expect(k).not.toMatch(/LOOPBACK|PRIVATE|LOCAL|INSECURE|ALLOW|PORT|SSRF|UNSAFE|PROXY|DNS|RESOLV/i);
  });
});

const SRC = fileURLToPath(new URL("../../src", import.meta.url));
function sources(dir: string): { path: string; text: string }[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return name.endsWith(".ts") ? [{ path: p, text: readFileSync(p, "utf8") }] : [];
  });
}

/** Remove block and line comments (good enough for our own source files). */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
}

describe("static guarantees in src/", () => {
  const files = sources(SRC);
  it("finds the source files", () => expect(files.length).toBeGreaterThan(10));
  it("never imports node:fs or calls sharp toFile / temp-file APIs", () => {
    for (const f of files) {
      expect(f.text, f.path).not.toMatch(/from\s+["'](node:)?fs(\/promises)?["']/);
      expect(f.text, f.path).not.toMatch(/require\(["'](node:)?fs/);
      expect(f.text, f.path).not.toMatch(/\.toFile\(|mkdtemp|tmpdir\(|createWriteStream/);
    }
  });
  it("never allows loopback in the crawl network policy", () => {
    // ip.ts is the blocklist itself (its loopback ranges are proven blocked by
    // the classification table in ssrf.test.ts), so it is not scanned here.
    const scanned = files.filter((x) => /(policy|safe-fetch|crawler|cli|main)\.ts$/.test(x.path));
    expect(scanned).toHaveLength(5);
    for (const f of scanned) {
      expect(stripComments(f.text), f.path).not.toMatch(/127\.0\.0\.1|localhost|::1|isLoopback|allowLoopback/i);
    }
  });
  it("never passes the test-only CA or disables certificate checks", () => {
    for (const f of files.filter((x) => !x.path.endsWith("safe-fetch.ts"))) {
      expect(stripComments(f.text), f.path).not.toMatch(/testOnlyTrustedCa/);
    }
    for (const f of files) expect(stripComments(f.text), f.path).not.toMatch(/rejectUnauthorized:\s*false|NODE_TLS_REJECT_UNAUTHORIZED/);
  });
  it("reads process.env only in main.ts", () => {
    for (const f of files.filter((x) => !x.path.endsWith("main.ts"))) {
      expect(f.text, f.path).not.toMatch(/process\.env/);
    }
  });
});
