/**
 * Runs the crawler as a real process (tests/support/fixture-entry.ts drives
 * runMain with the test policy injected in code) and scans ALL of its stdout
 * and stderr for URLs, hostnames, fingerprints and the service key. This
 * also covers output that bypasses our Logger call sites: uncaught errors,
 * Node warnings, dependency console output.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FIXTURE_HOSTS, TEST_KEY } from "../support/fixture-site.ts";
import { assertCleanLog } from "../support/log-scan.ts";

const ENTRY = fileURLToPath(new URL("../support/fixture-entry.ts", import.meta.url));
const CWD = fileURLToPath(new URL("../..", import.meta.url));

type Run = { code: number | null; signal: string | null; stdout: string; stderr: string; marker: string };

function runEntry(env: Record<string, string>, onStart?: (kill: (sig: NodeJS.Signals) => void, stdout: () => string) => void): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", ENTRY], {
      cwd: CWD,
      env: { PATH: process.env.PATH ?? "", SYSTEMROOT: process.env.SYSTEMROOT ?? "", VIPS_DISC_THRESHOLD: "2g", ...env },
      stdio: ["ignore", "pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let marker = "";
    child.stdout!.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
    child.stderr!.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
    (child.stdio[3] as NodeJS.ReadableStream).on("data", (d: Buffer) => (marker += d.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ code, signal, stdout, stderr, marker }));
    onStart?.((sig) => child.kill(sig), () => stdout);
  });
}

describe("crawler process output", () => {
  it("prints only sanitised JSON logs for a full fixture run", async () => {
    const run = await runEntry({ FIXTURE_EXPECT_ALL: "1" });
    expect(run.stderr).toBe("");
    expect(run.code).toBe(0);
    const marker = JSON.parse(run.marker) as { created: number; expected: number };
    expect(marker.created).toBe(marker.expected);
    const lines = run.stdout.trim().split("\n");
    expect(lines.length).toBeGreaterThan(3);
    for (const l of lines) expect(() => JSON.parse(l)).not.toThrow();
    expect(lines.some((l) => l.includes('"event":"run_summary"'))).toBe(true);
    assertCleanLog(run.stdout, { hostnames: FIXTURE_HOSTS, hashes: [], secrets: [TEST_KEY] });
  }, 90_000);

  it.skipIf(process.platform === "win32")(
    "on SIGTERM finishes in-flight work, flushes and exits 0",
    async () => {
      const run = await runEntry({ FIXTURE_DELAY_MS: "300" }, (kill, stdout) => {
        const t = setInterval(() => {
          if (stdout().includes('"event":"pool_loaded"')) {
            clearInterval(t);
            setTimeout(() => kill("SIGTERM"), 400);
          }
        }, 50);
      });
      expect(run.code).toBe(0);
      expect(run.stderr).toBe("");
      const summary = run.stdout
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l) as { event: string; summary?: { outcome: string } })
        .find((l) => l.event === "run_summary");
      expect(summary?.summary?.outcome).toBe("stopped");
      assertCleanLog(run.stdout, { hostnames: FIXTURE_HOSTS, hashes: [], secrets: [TEST_KEY] });
    },
    90_000,
  );
});
