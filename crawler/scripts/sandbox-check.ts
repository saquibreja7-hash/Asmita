/**
 * The WP25 sandbox probe: a standalone entry that answers one question —
 * can Chromium's own sandbox start in this runtime? — without a key, a
 * config, a source or any network. It forks the real browser worker with
 * the same scrubbed environment the crawler gives it, asks it to launch
 * Chromium sandboxed on about:blank (the same self-test a run performs the
 * first time a page needs a browser), and prints one JSON line of booleans,
 * ids and codes only:
 *
 *   {"event":"sandbox_check","sandboxTested":true,"sandboxOn":true,"workerUid":1000}
 *
 * Exit codes: 0 the sandbox works; 1 the runtime refused it (this is what a
 * run records as sandboxOn: false — browser rendering then stays disabled
 * for real sites); 2 the worker itself failed, which is not a sandbox
 * verdict. Usage, in the image or locally:
 *
 *   node dist/sandbox-check.js
 *
 * The runbook points operators at it for a direct answer; a run that
 * actually rendered pages also carries the same facts in its run_summary
 * (browser.sandboxTested / browser.sandboxOn / browser.workerUid).
 */
import { type ChildProcess } from "node:child_process";
import { dirname } from "node:path";
import { defaultBrowserWorkerPath, defaultBrowsersPath, spawnBrowserWorker } from "../src/browser/browser-renderer.ts";
import { LaunchMessageSchema, StopMessageSchema, parseWorkerMessage } from "../src/browser/protocol.ts";

const EXIT_SANDBOX_ON = 0;
const EXIT_SANDBOX_OFF = 1;
const EXIT_WORKER_FAILED = 2;
/** The worker gets the same bound a run's launch handshake gives it. */
const PROBE_TIMEOUT_MS = 30_000;

const tmpDir = process.env.BROWSER_TMP_DIR ?? "/dev/shm";
const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH ?? defaultBrowsersPath();
const workerPath = defaultBrowserWorkerPath();
// The same spawn path a run uses, including the container image's setuid
// drop helper (CRAWLER_BROWSER_WORKER_HELPER): the probe answers for the
// real run, so it must not take a shortcut the run never takes.
const child: ChildProcess = spawnBrowserWorker({
  workerPath,
  helper: process.env.CRAWLER_BROWSER_WORKER_HELPER,
  tmpDir,
  browsersPath,
  cwd: dirname(dirname(workerPath)),
});

type Answer = { ok: true; workerUid: number } | { ok: false; code: "browser_sandbox_unavailable" | "browser_launch_failed" | "browser_protocol" | "probe_timeout" };

const answer = await new Promise<Answer>((resolve) => {
  let settled = false;
  const settle = (a: Answer) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    child.off("message", on);
    resolve(a);
  };
  const timer = setTimeout(() => settle({ ok: false, code: "probe_timeout" }), PROBE_TIMEOUT_MS);
  const on = (m: unknown) => {
    const msg = parseWorkerMessage(m);
    if (msg === null) return settle({ ok: false, code: "browser_protocol" });
    if (msg.kind === "ready") {
      // The worker echoes the mode it launched under and its own uid.
      if (msg.sandboxed) return settle({ ok: true, workerUid: msg.uid });
      return settle({ ok: false, code: "browser_sandbox_unavailable" });
    }
    if (msg.kind === "failed" && msg.id === 0) {
      return settle({ ok: false, code: msg.code === "browser_sandbox_unavailable" ? "browser_sandbox_unavailable" : "browser_launch_failed" });
    }
  };
  child.on("message", on);
  child.on("exit", () => settle({ ok: false, code: "browser_launch_failed" }));
  child.send(LaunchMessageSchema.parse({ kind: "launch", proxyPort: 1, userAgentSuffix: "AsmitaCrawler/sandbox-check", sandboxed: true }));
});

// Shut the worker down: stop closes Chromium, then the process exits.
await new Promise<void>((resolve) => {
  const kill = setTimeout(() => child.kill("SIGKILL"), 5_000);
  child.once("exit", () => {
    clearTimeout(kill);
    resolve();
  });
  try {
    if (child.connected) child.send(StopMessageSchema.parse({ kind: "stop" }));
    else child.kill("SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
});

if (answer.ok) {
  console.log(JSON.stringify({ event: "sandbox_check", sandboxTested: true, sandboxOn: true, workerUid: answer.workerUid }));
  process.exit(EXIT_SANDBOX_ON);
} else {
  console.log(JSON.stringify({ event: "sandbox_check", sandboxTested: true, sandboxOn: false, code: answer.code }));
  process.exit(answer.code === "browser_sandbox_unavailable" ? EXIT_SANDBOX_OFF : EXIT_WORKER_FAILED);
}
