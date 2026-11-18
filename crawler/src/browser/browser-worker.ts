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
 *   - every network request of the context (the page, its frames, and any
 *     popup) is intercepted first and fetched hop by hop, with redirects
 *     handled here and never by the browser: each hop is counted against a
 *     per-page cap, navigation hops are kept inside the source's scope, and
 *     each hop waits for the parent's robots.txt verdict before it is made.
 *     Chromium follows a redirect it receives without consulting the route
 *     again, so no 3xx is ever handed to it: a subresource's redirect is
 *     followed here (up to 5 hops), and a main-frame redirect makes the
 *     render navigate to the checked target itself;
 *   - popups (window.open) are closed and their requests refused;
 *   - WebSockets are refused (they would skip robots and the request cap);
 *   - nothing on disk: no persistent profile (Playwright's throwaway
 *     profile lives in the memory-backed TMPDIR the parent set), disk cache
 *     disabled, downloads refused, service workers blocked;
 *   - one honest User-Agent: Chromium's own with the crawler's appended;
 *     no stealth plugins, no fingerprint spoofing;
 *   - crawler v3 WP15: font requests, audio and video media, and requests
 *     to a small built-in list of advertising/analytics hosts are aborted
 *     before any routing work — never fetched, never asked about, never
 *     counted against the per-page request cap, which therefore keeps its
 *     room for the page's images (blocked-requests.ts);
 *   - after scrolling, the render waits for network quiet instead of a
 *     fixed wait: no request in flight for the quiet window, so a slow or
 *     chained lazy-loader is waited for, bounded by the page's deadline and
 *     never longer than the old fixed wait on a page that is quiet already;
 *   - image bytes are taken from the fetched responses, in memory, capped
 *     per image, and handed to the parent as they arrive, under the address
 *     of the hop that served them;
 *   - time and resource caps per page: a deadline (every step is bounded by
 *     it, and the parent SIGKILLs this process if it is overrun), a bounded
 *     number of scrolls to trigger lazy loading, a request cap, and the
 *     parent's per-page byte budget at the proxy;
 *   - per-render state only: an aborted render closes its context, and
 *     nothing it does afterwards reaches the parent or touches the next
 *     render;
 *   - stdout and stderr are discarded by the parent: nothing this process
 *     could print (a URL, page text) reaches the logs.
 */
import { chromium, type Browser, type BrowserContext as Context, type Page, type Route } from "playwright-core";
import { inScope } from "../crawl/url.ts";
import { blockedRequestHost, blockedResourceType } from "./blocked-requests.ts";
import { CHROMIUM_ARGS } from "./chromium-args.ts";
import {
  AbortMessageSchema,
  LaunchMessageSchema,
  RenderMessageSchema,
  StopMessageSchema,
  VerdictMessageSchema,
  type LaunchMessage,
  type RenderMessage,
} from "./protocol.ts";


/** Redirect hops followed per request (safe-fetch's limit). */
const MAX_REDIRECTS = 5;
/** A parent that does not answer a robots question within this is dead. */
const VERDICT_TIMEOUT_MS = 10_000;
/** Upper bound on one page.evaluate (a script can block the main thread). */
const EVALUATE_TIMEOUT_MS = 5_000;
/**
 * Network quiet (crawler v3 WP15): after scrolling, the render waits until
 * no request has been in flight for this long. The window is capped by the
 * configured scroll wait (BROWSER_SCROLL_WAIT_MS), so a page that is quiet
 * right away is waited for no longer than the old fixed wait was.
 */
const QUIET_MS = 500;
/** How often the network-quiet wait re-checks the in-flight set. */
const QUIET_POLL_MS = 25;

let browser: Browser | null = null;
let proxyPort = 0;
let userAgentSuffix = "";
let defaultUserAgent = "";

/**
 * One render's state. Nothing about a render is global: an aborted render
 * that is still unwinding cannot send for, or clear, the next one.
 */
type Task = {
  msg: RenderMessage;
  /** Answered (rendered/failed) or aborted: nothing more is sent for it. */
  done: boolean;
  context: Context | null;
  page: Page | null;
  deadlineAt: number;
  requests: number;
  imagesSent: number;
  imagesSkipped: number;
  /** A main-frame redirect target the render should navigate to itself. */
  mainRedirect: string | null;
  /** Requests still being fetched (their images may not have been sent yet). */
  inflight: Set<Promise<void>>;
};

const tasks = new Map<number, Task>();
let checkSeq = 0;
const pendingChecks = new Map<number, { taskId: number; resolve: (allow: boolean) => void }>();

function send(message: unknown): void {
  if (process.connected) process.send!(message);
}

/** Send for a render only while it is live. */
function sendFor(task: Task, message: unknown): void {
  if (!task.done) send(message);
}

/** The render's one answer; after it nothing more is sent for this id. */
function answer(task: Task, message: unknown): void {
  if (task.done) return;
  task.done = true;
  send(message);
}

/** End a render early: answer once, refuse its checks, close its context. */
function endTask(task: Task, code: "browser_failed" | "browser_aborted"): void {
  answer(task, { kind: "failed", id: task.msg.id, code });
  for (const [seq, pending] of pendingChecks) {
    if (pending.taskId === task.msg.id) {
      pendingChecks.delete(seq);
      pending.resolve(false);
    }
  }
  // Closing the context makes every in-flight page operation reject.
  void task.context?.close().catch(() => undefined);
}

const remaining = (task: Task): number => Math.max(1, task.deadlineAt - Date.now());

/** A promise bounded by a timeout (and by the render's deadline). */
function bounded<T>(task: Task, p: Promise<T>, ms: number): Promise<T> {
  const limit = Math.min(ms, remaining(task));
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("step_timeout")), limit);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        reject(new Error("step_failed"));
      },
    );
  });
}

/** The parent's verdict on one request hop the page wants to make. */
function askVerdict(task: Task, url: string, resourceType: string): Promise<boolean> {
  if (task.done) return Promise.resolve(false);
  const seq = ++checkSeq;
  return new Promise<boolean>((resolve) => {
    pendingChecks.set(seq, { taskId: task.msg.id, resolve });
    sendFor(task, { kind: "check", id: task.msg.id, seq, url, resourceType });
    // A parent that does not answer is a dead parent: fail closed.
    setTimeout(() => {
      if (pendingChecks.delete(seq)) resolve(false);
    }, VERDICT_TIMEOUT_MS).unref?.();
  });
}

async function ensureBrowser(): Promise<Browser> {
  if (browser && browser.isConnected()) return browser;
  browser = null;
  // Headless Chromium, no persistent profile, disk cache disabled, WebRTC
  // confined to the proxy. No stealth plugins. Why --no-sandbox, and what
  // has to change before real sites are rendered: chromium-args.ts.
  browser = await chromium.launch({ headless: true, args: [...CHROMIUM_ARGS] });
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

const isRedirect = (status: number): boolean => status === 301 || status === 302 || status === 303 || status === 307 || status === 308;

/**
 * Network quiet (crawler v3 WP15): wait until no request has been in flight
 * for the quiet window, bounded by the render's deadline. Unlike the old
 * fixed wait plus a one-shot wait for already-known requests, this also
 * waits for requests the page's own loading chain spawns late (a lazy-loader
 * whose onload inserts the next image), because the window restarts whenever
 * anything is in flight. A page that never goes quiet still ends at its
 * deadline.
 */
async function waitNetworkQuiet(task: Task): Promise<void> {
  const quietMs = Math.min(QUIET_MS, task.msg.scrollWaitMs);
  let quietSince: number | null = null;
  while (!task.done) {
    const left = remaining(task);
    if (left <= 0) return;
    if (task.inflight.size === 0) {
      quietSince ??= Date.now();
      if (Date.now() - quietSince >= quietMs) return;
    } else {
      quietSince = null;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(QUIET_POLL_MS, left)));
  }
}

/**
 * One intercepted request, fetched here hop by hop (redirects are never
 * left to Chromium, which would follow them unrouted). Every hop: request
 * cap, scope for navigations, robots verdict; then a fetch through the
 * context (the same SOCKS proxy, the same User-Agent) with redirects off.
 * Fonts, audio/video media and the built-in advertising/analytics hosts are
 * aborted before any of that work (crawler v3 WP15).
 */
async function handleRoute(task: Task, route: Route): Promise<void> {
  const req = route.request();
  const abort = () => route.abort("blockedbyclient").catch(() => undefined);
  if (task.done || !task.page) return void (await abort());
  // Requests of a popup (or of anything that is not this render's page) are
  // refused; the popup itself is closed by the context's page listener.
  let frame;
  try {
    frame = req.frame();
  } catch {
    return void (await abort()); // no frame: a service worker's request
  }
  if (frame.page() !== task.page) return void (await abort());
  const navigation = req.isNavigationRequest();
  const mainFrame = navigation && frame === task.page.mainFrame();
  const resourceType = req.resourceType();
  let target = req.url();
  // Crawler v3 WP15: fonts, audio and video media, and the built-in list of
  // advertising/analytics hosts are aborted before any routing work — never
  // fetched, never asked about, never counted against the per-page request
  // cap, which therefore keeps its room for the page's images.
  if (blockedResourceType(resourceType) || blockedRequestHost(target)) return void (await abort());
  for (let hop = 0; ; hop++) {
    task.requests += 1;
    if (task.requests > task.msg.maxRequests) return void (await abort());
    let u: URL;
    try {
      u = new URL(target);
    } catch {
      return void (await abort());
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") return void (await abort());
    // The host check again on every redirect hop, so nothing that is
    // followed can end on a blocked host either.
    if (blockedRequestHost(u)) return void (await abort());
    if (navigation && !inScope(u, task.msg.scopeHost)) return void (await abort());
    if (!(await askVerdict(task, target, resourceType))) return void (await abort());
    if (task.done) return void (await abort());
    const response = await route.fetch({ url: target, maxRedirects: 0, timeout: remaining(task) });
    const status = response.status();
    const location = response.headers()["location"];
    if (isRedirect(status) && location !== undefined) {
      await response.dispose().catch(() => undefined);
      if (hop >= MAX_REDIRECTS) return void (await abort());
      let next: URL;
      try {
        next = new URL(location, u);
      } catch {
        return void (await abort());
      }
      next.hash = "";
      if (mainFrame) {
        // The main document moved: the render navigates there itself, so
        // the new navigation is routed (scope, robots) like the first.
        task.mainRedirect = next.href;
        return void (await abort());
      }
      target = next.href;
      continue;
    }
    // The final hop answered. Image bytes are taken here, in memory, under
    // the address that actually served them.
    const type = (response.headers()["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
    if (type.startsWith("image/") && type !== "image/svg+xml") {
      if (task.imagesSent + task.imagesSkipped >= task.msg.maxImages) {
        task.imagesSkipped += 1;
      } else {
        try {
          const body = await response.body();
          if (body.byteLength === 0 || body.byteLength > task.msg.maxImageBytes) {
            task.imagesSkipped += 1;
          } else {
            task.imagesSent += 1;
            sendFor(task, { kind: "image", id: task.msg.id, url: target, contentType: type, bytes: new Uint8Array(body) });
          }
        } catch {
          task.imagesSkipped += 1;
        }
      }
    }
    if (task.done) return void (await abort());
    return void (await route.fulfill({ response }));
  }
}

async function handleRender(msg: RenderMessage): Promise<void> {
  const task: Task = {
    msg,
    done: false,
    context: null,
    page: null,
    deadlineAt: Date.now() + msg.timeoutMs,
    requests: 0,
    imagesSent: 0,
    imagesSkipped: 0,
    mainRedirect: null,
    inflight: new Set(),
  };
  tasks.set(msg.id, task);
  // The render's own deadline; the parent SIGKILLs this process if even
  // this is overrun.
  const deadline = setTimeout(() => endTask(task, "browser_failed"), msg.timeoutMs);
  try {
    const b = await ensureBrowser();
    if (task.done) return;
    const context = await b.newContext({
      userAgent: `${defaultUserAgent} ${userAgentSuffix}`,
      proxy: { server: `socks5://127.0.0.1:${proxyPort}`, bypass: "<-loopback>" },
      serviceWorkers: "block",
      acceptDownloads: false,
    });
    task.context = context;
    if (task.done) return;

    // Every request of the context (page, frames, popups) is routed; no
    // WebSocket is ever connected (no connectToServer: the server is never
    // contacted).
    await context.route("**/*", (route) => {
      const handled = handleRoute(task, route).catch(() => route.abort("blockedbyclient").catch(() => undefined));
      task.inflight.add(handled);
      void handled.finally(() => task.inflight.delete(handled));
    });
    await context.routeWebSocket(/.*/, (ws) => {
      void ws.close().catch(() => undefined);
    });

    const page = await context.newPage();
    task.page = page;
    // Popups: any other page of this context is closed at once.
    context.on("page", (p) => {
      if (p !== page) void p.close().catch(() => undefined);
    });

    // Navigate, following main-frame redirects here (each target is routed,
    // scope- and robots-checked like the first request).
    let target = msg.url;
    let response = null;
    for (let hop = 0; ; hop++) {
      task.mainRedirect = null;
      try {
        response = await page.goto(target, { waitUntil: "domcontentloaded", timeout: remaining(task) });
      } catch (err) {
        if (task.mainRedirect === null || task.done) throw err;
      }
      if (task.mainRedirect === null) break;
      if (hop >= MAX_REDIRECTS) throw new Error("too_many_redirects");
      target = task.mainRedirect;
    }
    const mainStatus = response ? response.status() : 200;

    // Bounded scrolling to trigger lazy loading (infinite scroll); a page
    // script that blocks the main thread cannot hold an evaluate forever.
    for (let i = 0; i < msg.scrolls && !task.done; i++) {
      await bounded(task, page.evaluate("window.scrollBy(0, Math.max(window.innerHeight, 400))"), EVALUATE_TIMEOUT_MS);
      if (msg.scrollWaitMs > 0) await page.waitForTimeout(Math.min(msg.scrollWaitMs, remaining(task)));
    }
    // Crawler v3 WP15: the fixed wait after scrolling is gone. The render
    // waits for network quiet — no request in flight for the quiet window —
    // so late and chained lazy-loaders are waited for and their images are
    // not lost, bounded by the page's deadline.
    if (!task.done) await waitNetworkQuiet(task);

    const html = await bounded(task, page.content(), EVALUATE_TIMEOUT_MS);
    const truncated = html.length > msg.maxHtmlBytes;
    answer(task, {
      kind: "rendered",
      id: msg.id,
      url: page.url(),
      status: mainStatus,
      html: truncated ? html.slice(0, msg.maxHtmlBytes) : html,
      truncated,
      stats: { requests: task.requests, imagesSkipped: task.imagesSkipped },
    });
  } catch {
    endTask(task, "browser_failed");
  } finally {
    clearTimeout(deadline);
    // Over before closing, so nothing the closing context still triggers
    // is sent; only this render's own entry is removed.
    task.done = true;
    await task.context?.close().catch(() => undefined);
    if (tasks.get(msg.id) === task) tasks.delete(msg.id);
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
    if (!parsed.success) return;
    const pending = pendingChecks.get(parsed.data.seq);
    // A verdict for another render (or a stale one) is ignored.
    if (!pending || pending.taskId !== parsed.data.id) return;
    pendingChecks.delete(parsed.data.seq);
    pending.resolve(parsed.data.allow);
    return;
  }
  if (kind === "abort") {
    const parsed = AbortMessageSchema.safeParse(raw);
    if (!parsed.success) return;
    // Answer once and close that render's context; an unknown or finished
    // render has nothing left to abort.
    const task = tasks.get(parsed.data.id);
    if (task) endTask(task, "browser_aborted");
    return;
  }
  if (kind === "stop") {
    if (StopMessageSchema.safeParse(raw).success) {
      for (const task of tasks.values()) endTask(task, "browser_aborted");
      send({ kind: "stopped" });
      void (browser?.close() ?? Promise.resolve()).finally(() => process.exit(0));
    }
  }
});

// The parent is gone: nothing left to render for, and no page may outlive it.
process.on("disconnect", () => {
  void (browser?.close() ?? Promise.resolve()).finally(() => process.exit(0));
});
