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
 *   - WP25: Chromium launches exactly as the parent's launch message says
 *     — sandboxed (chromiumSandbox: true, no --no-sandbox) or, only after
 *     the parent decided so on the dev override, unsandboxed. A sandboxed
 *     launch the runtime refuses is reported as browser_sandbox_unavailable
 *     and never retried by this process: the parent fails closed or
 *     respawns with sandboxed: false; the launch plus one about:blank
 *     probe is the sandbox self-test, bounded by SELFTEST_TIMEOUT_MS;
 *   - after scrolling, the render waits for network quiet instead of a
 *     fixed wait: no request in flight for 500 ms, so a slow or chained
 *     lazy-loader is waited for, bounded by the page's deadline and
 *     never longer than the old fixed wait on a page that is quiet already;
 *   - crawler v3 WP16: after the quiet wait the render gathers image
 *     candidates from every frame (page.frames(), about:srcdoc frames
 *     included) and from open shadow roots — the same candidates the static
 *     extractor reads — and makes the browser load the ones the page has
 *     not requested. Those loads are ordinary routed image requests: same
 *     proxy, same robots verdict, same request and image caps, and an
 *     out-of-scope frame contributes nothing: its navigation is refused
 *     before any request leaves (scope and robots checks as before), so
 *     it keeps only the empty initial document;
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
import { IMAGE_EXT, LAZY_SRC_ATTRS, LAZY_SRCSET_ATTRS, largestFromSrcset, styleBackgroundImages } from "../crawl/extract.ts";
import { inScope } from "../crawl/url.ts";
import { blockedRequestHost, blockedResourceType } from "./blocked-requests.ts";
import { chromiumArgs } from "./chromium-args.ts";
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
/**
 * The longest one network-quiet wait may last (review fix): the upper limit
 * BROWSER_SCROLL_WAIT_MS accepts (config.ts), so no configured scroll wait
 * is ever cut short, while a page that never goes quiet stops being waited
 * for. The page deadline minus `quietMargin` caps it further.
 */
const QUIET_WAIT_MAX_MS = 30_000;
/**
 * Time a quiet wait leaves before the page deadline for what follows it
 * (the frame gather, the second quiet wait and page.content()): a quarter
 * of the page timeout, at most one evaluate bound.
 */
const quietMargin = (task: Task): number => Math.min(EVALUATE_TIMEOUT_MS, Math.floor(task.msg.timeoutMs / 4));
/**
 * Crawler v3 WP16: frames one render's gather walks (page.frames() is
 * unbounded, so the walk is capped; the main frame is always first).
 */
const MAX_GATHER_FRAMES = 64;
/** Raw candidate strings taken from one frame's DOM per list. */
const MAX_GATHER_RAW = 200;
/** Elements the in-page walk visits per frame (a hostile page is bounded). */
const MAX_GATHER_VISITS = 20_000;
/** Forced loads started per page.evaluate, so one bad chunk cannot stall. */
const GATHER_CHUNK = 16;
/** Routed request URLs remembered per render, for the gather's dedup. */
const MAX_REMEMBERED_URLS = 4096;

let browser: Browser | null = null;
let proxyPort = 0;
let userAgentSuffix = "";
let defaultUserAgent = "";
/** WP25: the sandbox mode the parent told us to launch under (launch msg). */
let launchSandboxed = true;

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
  /**
   * The hop-0 URLs the page's requests were routed under (crawler v3 WP16):
   * what the gather must not ask for again, whether they were served or
   * refused. Bounded by MAX_REMEMBERED_URLS.
   */
  routedUrls: Set<string>;
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

/**
 * WP25: bound on the sandbox self-test — the launch plus one about:blank
 * probe. Chromium refuses a runtime without user namespaces immediately, so
 * the bound exists only to turn a hung launch into a failure before the
 * parent's own launch timeout.
 */
const SELFTEST_TIMEOUT_MS = 20_000;

async function ensureBrowser(): Promise<Browser> {
  if (browser && browser.isConnected()) return browser;
  browser = null;
  // Headless Chromium, no persistent profile, disk cache disabled, WebRTC
  // confined to the proxy. No stealth plugins. WP25: Chromium's own sandbox
  // is on whenever the parent's launch said so — `chromiumSandbox: true` is
  // what withholds Playwright's implicit --no-sandbox, and Chromium's user
  // namespace sandbox does the rest; the launch fails hard when the runtime
  // does not allow it (never a silent fallback), which handleLaunch reports
  // as browser_sandbox_unavailable (sandboxed) or browser_failed.
  browser = await chromium.launch({ headless: true, chromiumSandbox: launchSandboxed, args: chromiumArgs(launchSandboxed) });
  // Chromium's own User-Agent, read once from a blank page (no network).
  // Opening that page is also the second half of the sandbox self-test: a
  // renderer that cannot start (sandbox refused) fails here.
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
  launchSandboxed = m.sandboxed;
  try {
    await Promise.race([
      ensureBrowser(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("selftest_timeout")), SELFTEST_TIMEOUT_MS).unref?.();
      }),
    ]);
    send({ kind: "ready", sandboxed: launchSandboxed, uid: process.getuid?.() ?? 0 });
  } catch {
    // The worker never falls back by itself: an unsandboxed retry is the
    // parent's decision (CRAWLER_ALLOW_UNSANDBOXED_BROWSER), made by
    // respawning this process with sandboxed: false.
    void browser?.close().catch(() => undefined);
    browser = null;
    send({ kind: "failed", id: 0, code: launchSandboxed ? "browser_sandbox_unavailable" : "browser_failed" });
  }
}

const isRedirect = (status: number): boolean => status === 301 || status === 302 || status === 303 || status === 307 || status === 308;

/**
 * Network quiet (crawler v3 WP15): wait until no request has been in flight
 * for the quiet window, bounded by the render's deadline. Unlike the old
 * fixed wait plus a one-shot wait for already-known requests, this also
 * waits for requests the page's own loading chain spawns late (a lazy-loader
 * whose onload inserts the next image), because the window restarts whenever
 * anything is in flight.
 *
 * A page that never goes quiet (it polls forever) must still render (review
 * fix): `remaining()` never drops below 1 ms, so the old `left <= 0` exit
 * never fired and such a page ran into its deadline and failed. The wait now
 * gives up at the earlier of QUIET_WAIT_MAX_MS after it started and the
 * deadline minus a margin kept for the gather and page.content(), and the
 * render proceeds with whatever arrived.
 */
async function waitNetworkQuiet(task: Task): Promise<void> {
  const quietMs = Math.min(QUIET_MS, task.msg.scrollWaitMs);
  const giveUpAt = Math.min(Date.now() + QUIET_WAIT_MAX_MS, task.deadlineAt - quietMargin(task));
  let quietSince: number | null = null;
  while (!task.done) {
    const left = giveUpAt - Date.now();
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
 * Crawler v3 WP16: the in-page half of the gather. Walks one frame's DOM —
 * OPEN shadow roots included, closed ones are invisible by design — and
 * returns the raw image-candidate attributes the static extractor would
 * read: an <img> that has not loaded (its src), raw srcsets, the lazy
 * data-* attributes, <video> posters, inline background styles, and anchor
 * hrefs straight to an image file. It resolves and fetches nothing; the
 * worker decides what to load. Bounded: elements visited, raw strings per
 * list, and one evaluate per frame (the render deadline bounds them all).
 */
const GATHER_SCRIPT = `(() => {
  const out = { base: document.baseURI, urls: [], srcsets: [], styles: [], anchors: [] };
  const lazy = ${JSON.stringify(LAZY_SRC_ATTRS)};
  const lazyset = ${JSON.stringify(LAZY_SRCSET_ATTRS)};
  // Mirrors extract.ts IMAGE_EXT, tolerant of a query string or fragment;
  // the worker re-checks the parsed pathname with the real rule.
  const toImage = /\\.(jpe?g|png|gif|webp|avif)(?:[?#][\\s\\S]*)?$/i;
  let visits = 0;
  const push = (list, v) => {
    if (typeof v === "string" && v.trim() !== "" && list.length < ${MAX_GATHER_RAW}) list.push(v);
  };
  // An icon or spacer by declared size is no candidate (extract.ts rule).
  const tiny = (el) => {
    const w = Number(el.getAttribute("width"));
    const h = Number(el.getAttribute("height"));
    return (Number.isFinite(w) && w > 0 && w < 32) || (Number.isFinite(h) && h > 0 && h < 32);
  };
  const walk = (el) => {
    if (visits >= ${MAX_GATHER_VISITS}) return;
    visits++;
    const tag = el.tagName;
    if (tag === "IMG" && !tiny(el)) {
      if (!(el.complete && el.naturalWidth > 0)) push(out.urls, el.getAttribute("src"));
      for (const a of lazy) push(out.urls, el.getAttribute(a));
      push(out.srcsets, el.getAttribute("srcset"));
      for (const a of lazyset) push(out.srcsets, el.getAttribute(a));
    } else if (tag === "SOURCE") {
      push(out.srcsets, el.getAttribute("srcset"));
    } else if (tag === "VIDEO") {
      push(out.urls, el.getAttribute("poster"));
    } else if (tag === "A") {
      const href = el.getAttribute("href");
      if (typeof href === "string" && toImage.test(href.trim())) push(out.anchors, href);
    }
    const style = el.getAttribute("style");
    if (typeof style === "string" && style.indexOf("background") >= 0) push(out.styles, style);
    const shadow = el.shadowRoot;
    if (shadow) for (const c of shadow.children) walk(c);
    for (const c of el.children) walk(c);
  };
  for (const c of document.documentElement.children) walk(c);
  return out;
})()`;

/**
 * Starts the loads the gather decided on. The URLs are inlined into the
 * expression: Playwright runs a string argument as an expression, not as a
 * function to call with the second argument, so the callable form
 * (fn, args) silently does nothing here.
 */
const forceLoad = (urls: string[]): string =>
  `(function (urls) { for (const u of urls) { var i = new Image(); i.src = u; } })(${JSON.stringify(urls)})`;

/**
 * Crawler v3 WP16: galleries in frames and components. The page's own
 * scripts are not the only thing that can name an image: a gallery can live
 * inside a frame (an iframe document, an about:srcdoc frame) or inside a
 * web component's open shadow root, and its images may never be requested
 * by the page itself (a lazy loader waiting for an event that never comes,
 * or a frame nobody scrolls). After the network-quiet wait the render walks
 * every frame of the page and every open shadow root, collects the same
 * image candidates the static extractor reads, and makes the browser load
 * the ones the page has not asked for — as ordinary image requests, so they
 * leave through the same proxy, wait for the same robots verdict, and count
 * against the same request and image caps as the page's own images. Nothing
 * is loaded that the page requested already (served or refused), nothing
 * beyond the remaining image slots, and an out-of-scope frame contributes
 * nothing: its navigation was refused before any request left, so it
 * keeps only the empty initial document and the walk of it finds no
 * candidates. Returns the number of loads started.
 */
async function gatherFrameImages(task: Task): Promise<number> {
  const page = task.page;
  if (page === null || task.done) return 0;
  const room = task.msg.maxImages - task.imagesSent - task.imagesSkipped;
  if (room <= 0) return 0;
  const wanted: string[] = [];
  const seen = new Set<string>();
  /** One raw candidate string, resolved against the frame's base URL. */
  const consider = (raw: string, base: URL, anchor: boolean): void => {
    let url: URL;
    try {
      url = new URL(raw.trim(), base);
    } catch {
      return;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return;
    url.hash = "";
    if (/\.svgz?$/i.test(url.pathname)) return; // the static extractor's svg rule
    if (anchor && !IMAGE_EXT.test(url.pathname)) return;
    const href = url.href;
    if (seen.has(href) || task.routedUrls.has(href)) return;
    seen.add(href);
    if (wanted.length < room) wanted.push(href);
  };
  for (const frame of page.frames().slice(0, MAX_GATHER_FRAMES)) {
    if (task.done || wanted.length >= room) break;
    let found: unknown;
    try {
      found = await bounded(task, frame.evaluate(GATHER_SCRIPT), EVALUATE_TIMEOUT_MS);
    } catch {
      continue; // a detached frame, or a script that blocked the evaluate
    }
    const g = found as { base?: unknown; urls?: unknown; srcsets?: unknown; styles?: unknown; anchors?: unknown } | null;
    if (g === null || typeof g !== "object" || typeof g.base !== "string") continue;
    let base: URL;
    try {
      base = new URL(g.base);
    } catch {
      continue;
    }
    for (const raw of Array.isArray(g.urls) ? g.urls : []) if (typeof raw === "string") consider(raw, base, false);
    for (const raw of Array.isArray(g.srcsets) ? g.srcsets : []) {
      if (typeof raw !== "string") continue;
      const best = largestFromSrcset(raw);
      if (best !== null) consider(best, base, false);
    }
    for (const raw of Array.isArray(g.styles) ? g.styles : []) {
      if (typeof raw !== "string") continue;
      for (const u of styleBackgroundImages(raw)) consider(u, base, false);
    }
    for (const raw of Array.isArray(g.anchors) ? g.anchors : []) if (typeof raw === "string") consider(raw, base, true);
  }
  for (let i = 0; i < wanted.length; i += GATHER_CHUNK) {
    if (task.done) break;
    const chunk = wanted.slice(i, i + GATHER_CHUNK);
    try {
      await bounded(task, page.evaluate(forceLoad(chunk)), EVALUATE_TIMEOUT_MS);
    } catch {
      break; // the page is gone or blocked the evaluate: whatever started stays
    }
  }
  return wanted.length;
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
    // Crawler v3 WP16: the first hop's address is what the page asked for —
    // the gather must not ask for it again, whether it was served or refused.
    if (hop === 0 && task.routedUrls.size < MAX_REMEMBERED_URLS) task.routedUrls.add(u.href);
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
    routedUrls: new Set(),
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

    // Crawler v3 WP16: galleries in frames and components. After the page
    // has settled, the render gathers image candidates from every frame and
    // open shadow root and makes the browser load the ones the page never
    // asked for; the extra requests are ordinary routed image requests, so
    // the quiet wait runs once more to let them (and their bytes) arrive. A
    // page that needs nothing extra gathers nothing and waits no longer.
    if (!task.done && !!(await gatherFrameImages(task)) && !task.done) await waitNetworkQuiet(task);

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
