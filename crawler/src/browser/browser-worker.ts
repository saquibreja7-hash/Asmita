/**
 * The browser worker child process (crawler v2 WP7), bundled separately as
 * dist/browser-worker.js. It hosts Playwright Chromium for pages that need
 * rendering: sources with render = BROWSER, or AUTO pages whose HTML has
 * scripts and no image candidates.
 *
 * What this process may see: page content, image bytes, and the parent's
 * verdicts. What it never sees: the service key, the fingerprint pool, any
 * fingerprint, or any config (its environment is scrubbed and it runs under
 * Node's permission model: no filesystem access outside its own bundle,
 * playwright-core and the browser, writes only to the memory-backed temp
 * dir, no worker threads, no addons).
 *
 * Hard rules implemented here, on top of the parent's proxy:
 *   - every network request of the page is intercepted first: counted
 *     against a per-page cap, navigation requests are kept inside the
 *     source's scope, and each request waits for the parent's robots.txt
 *     verdict before it is allowed to continue;
 *   - nothing on disk: no persistent profile (Playwright's throwaway
 *     profile lives in the memory-backed TMPDIR the parent set), disk cache
 *     disabled, downloads refused, service workers blocked;
 *   - one honest User-Agent: Chromium's own with the crawler's appended;
 *     no stealth plugins, no fingerprint spoofing;
 *   - image bytes are taken from intercepted responses, in memory, capped
 *     per image, and handed to the parent as they arrive;
 *   - time and resource caps per page: a deadline, a bounded number of
 *     scrolls to trigger lazy loading, a request cap, and the parent's
 *     per-page byte budget at the proxy;
 *   - stdout and stderr are discarded by the parent: nothing this process
 *     could print (a URL, page text) reaches the logs.
 */
import { chromium } from "playwright-core";
import { inScope } from "../crawl/url.ts";
import {
  AbortMessageSchema,
  LaunchMessageSchema,
  RenderMessageSchema,
  StopMessageSchema,
  VerdictMessageSchema,
  type LaunchMessage,
  type RenderMessage,
} from "./protocol.ts";

type Browser = Awaited<ReturnType<typeof chromium.launch>>;

let browser: Browser | null = null;
let proxyPort = 0;
let userAgentSuffix = "";
let defaultUserAgent = "";
let active: RenderMessage | null = null;
let checkSeq = 0;
const pendingChecks = new Map<number, (allow: boolean) => void>();
/** Settled when the active render has answered (rendered or failed). */
let answered = true;

function send(message: unknown): void {
  if (process.connected) process.send!(message);
}

function failActive(code: "browser_failed" | "browser_aborted"): void {
  const task = active;
  active = null;
  if (task) send({ kind: "failed", id: task.id, code });
}

/** The parent's verdict on one request the page wants to make. */
function askVerdict(url: string, resourceType: string): Promise<boolean> {
  const task = active;
  if (!task) return Promise.resolve(false);
  const seq = ++checkSeq;
  return new Promise<boolean>((resolve) => {
    pendingChecks.set(seq, resolve);
    send({ kind: "check", id: task.id, seq, url, resourceType });
    // A parent that does not answer is a dead parent: fail closed.
    setTimeout(() => {
      if (pendingChecks.delete(seq)) resolve(false);
    }, 10_000).unref?.();
  });
}

async function ensureBrowser(): Promise<Browser> {
  if (browser && browser.isConnected()) return browser;
  browser = null;
  // Headless Chromium, no persistent profile, disk cache disabled. No
  // stealth plugins; the sandbox flag is off because the container runs
  // read-only without the setuid helper (documented in README).
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disk-cache-size=0", "--media-cache-size=0"],
  });
  // Chromium's own User-Agent, read once from a blank page (no network).
  const probe = await browser.newContext();
  try {
    const page = await probe.newPage();
    defaultUserAgent = await page.evaluate("navigator.userAgent");
  } finally {
    await probe.close();
  }
  return browser;
}

async function handleLaunch(m: LaunchMessage): Promise<void> {
  proxyPort = m.proxyPort;
  userAgentSuffix = m.userAgentSuffix;
  try {
    await ensureBrowser();
    send({ kind: "ready" });
  } catch {
    send({ kind: "failed", id: 0, code: "browser_failed" });
  }
}

async function handleRender(task: RenderMessage): Promise<void> {
  const b = await ensureBrowser();
  active = task;
  answered = false;
  let requests = 0;
  let imagesSent = 0;
  let imagesSkipped = 0;
  const pendingBodies = new Set<Promise<void>>();
  const url = task.url;

  const context = await b.newContext({
    userAgent: `${defaultUserAgent} ${userAgentSuffix}`,
    proxy: { server: `socks5://127.0.0.1:${proxyPort}`, bypass: "<-loopback>" },
    serviceWorkers: "block",
    acceptDownloads: false,
  });
  try {
    const page = await context.newPage();
    let mainStatus = 200;

    // Every request is counted, scoped (documents) and robots-checked (the
    // parent's verdict) before it may continue.
    await page.route("**/*", (route) => {
      void (async () => {
        try {
          requests += 1;
          const req = route.request();
          if (requests > task.maxRequests) return void route.abort("blockedbyclient");
          if (req.resourceType() === "document" && !inScope(new URL(req.url()), task.scopeHost)) {
            return void route.abort("blockedbyclient");
          }
          if (!(await askVerdict(req.url(), req.resourceType()))) return void route.abort("blockedbyclient");
          return void route.continue();
        } catch {
          return void route.abort("blockedbyclient");
        }
      })();
    });

    page.on("response", (res) => {
      // Image bytes are taken from the intercepted response, in memory.
      void (async () => {
        const type = (res.headers()["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
        if (!type.startsWith("image/") || type === "image/svg+xml") return;
        const target = res.url();
        if (!/^https?:\/\//.test(target)) return;
        if (imagesSent + imagesSkipped >= task.maxImages) {
          imagesSkipped += 1;
          return;
        }
        const done = (async () => {
          try {
            const body = await res.body();
            if (body.byteLength === 0 || body.byteLength > task.maxImageBytes) {
              imagesSkipped += 1;
              return;
            }
            imagesSent += 1;
            send({ kind: "image", id: task.id, url: target, contentType: type, bytes: new Uint8Array(body) });
          } catch {
            imagesSkipped += 1;
          }
        })();
        pendingBodies.add(done);
        void done.finally(() => pendingBodies.delete(done));
      })();
    });

    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: task.timeoutMs });
    if (response) mainStatus = response.status();

    // Bounded scrolling to trigger lazy loading (infinite scroll).
    for (let i = 0; i < task.scrolls; i++) {
      await page.evaluate("window.scrollBy(0, Math.max(window.innerHeight, 400))");
      if (task.scrollWaitMs > 0) await page.waitForTimeout(task.scrollWaitMs);
    }
    if (task.scrollWaitMs > 0) await page.waitForTimeout(task.scrollWaitMs); // let late responses land
    await Promise.all([...pendingBodies]);

    const html = await page.content();
    const truncated = html.length > task.maxHtmlBytes;
    if (answered) return;
    answered = true;
    send({
      kind: "rendered",
      id: task.id,
      url: page.url(),
      status: mainStatus,
      html: truncated ? html.slice(0, task.maxHtmlBytes) : html,
      truncated,
      stats: { requests, imagesSkipped },
    });
  } catch {
    if (!answered) {
      answered = true;
      failActive("browser_failed");
    }
  } finally {
    active = null;
    await context.close().catch(() => undefined);
  }
}

process.on("message", (raw: unknown) => {
  const kind = (raw as { kind?: unknown } | null)?.kind;
  if (kind === "launch") {
    const parsed = LaunchMessageSchema.safeParse(raw);
    if (parsed.success) void handleLaunch(parsed.data);
    return;
  }
  if (kind === "render") {
    const parsed = RenderMessageSchema.safeParse(raw);
    if (parsed.success) void handleRender(parsed.data);
    return;
  }
  if (kind === "verdict") {
    const parsed = VerdictMessageSchema.safeParse(raw);
    if (parsed.success) pendingChecks.get(parsed.data.seq)?.(parsed.data.allow);
    return;
  }
  if (kind === "abort") {
    const parsed = AbortMessageSchema.safeParse(raw);
    // The parent aborts only the render it knows is active; closing the
    // context makes every in-flight operation reject, which fails the task.
    if (parsed.success) {
      answered = true;
      const task = active;
      active = null;
      if (task) send({ kind: "failed", id: task.id, code: "browser_aborted" });
    }
    return;
  }
  if (kind === "stop") {
    if (StopMessageSchema.safeParse(raw).success) {
      send({ kind: "stopped" });
      void browser?.close().finally(() => process.exit(0));
    }
  }
});

// The parent is gone: nothing left to render for, and no page may outlive it.
process.on("disconnect", () => {
  void browser?.close().finally(() => process.exit(0));
});
