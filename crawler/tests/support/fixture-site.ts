/**
 * A local fixture "internet" on 127.0.0.1, routed by Host header:
 *   fixture.test / www.fixture.test   the approved source
 *   cdn.imgcdn.test                   an off-domain image CDN (fetching allowed)
 *   other.test                        an off-domain site (must never be requested)
 *
 * Every image is an ordinary synthetic pattern generated in code. Matching
 * images have their fingerprints in the mock pool; decoys and images behind
 * robots.txt, nofollow or off-domain links must not produce findings.
 */
import { createServer, type IncomingHttpHeaders, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import sharp from "sharp";
import type { Pool } from "../../src/asmita/client.ts";
import { hashImage } from "../../src/image/hash-image.ts";
import { flipBits, patternImage, pixelBombPng, randomFingerprint } from "./synthetic.ts";

export const SOURCE_DOMAIN = "fixture.test";
export const CDN_HOST = "cdn.imgcdn.test";
export const OFFSITE_HOST = "other.test";
export const FIXTURE_HOSTS = [SOURCE_DOMAIN, CDN_HOST, OFFSITE_HOST];

export type SeenRequest = { host: string; path: string; headers: IncomingHttpHeaders };

type Handler = (res: ServerResponse) => void | Promise<void>;

export type Expected = { fingerprintId: string; pagePath: string; imageHost: string; imagePath: string };

export type Fixture = {
  site: FixtureSite;
  pool: Pool;
  expected: Expected[];
  /** Every planted 64-hex fingerprint (for the log scan). */
  allHashes: string[];
};

export class FixtureSite {
  readonly requests: SeenRequest[] = [];
  private readonly routes = new Map<string, Handler>();
  private readonly fallbacks = new Map<string, (path: string) => Handler>();
  private server: Server | null = null;

  get port(): number {
    return (this.server!.address() as AddressInfo).port;
  }

  origin(host: string): string {
    return `http://${host}:${this.port}`;
  }

  route(host: string, path: string, handler: Handler): void {
    this.routes.set(`${host}${path}`, handler);
  }

  /** Handler for any path on `host` without an exact route. */
  routeAny(host: string, make: (path: string) => Handler): void {
    this.fallbacks.set(host, make);
  }

  async start(): Promise<this> {
    this.server = createServer((req, res) => {
      const host = (req.headers.host ?? "").replace(/:\d+$/, "");
      const path = req.url ?? "/";
      this.requests.push({ host, path, headers: req.headers });
      const h = this.routes.get(`${host}${path}`) ?? this.fallbacks.get(host)?.(path);
      if (!h) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("not found");
        return;
      }
      void Promise.resolve(h(res)).catch(() => res.destroy());
    });
    await new Promise<void>((r) => this.server!.listen(0, "127.0.0.1", r));
    return this;
  }

  async stop(): Promise<void> {
    this.server?.closeAllConnections();
    await new Promise<void>((r) => this.server?.close(() => r()));
  }

  requested(host: string, path?: string): boolean {
    return this.requests.some((r) => r.host === host && (path === undefined || r.path === path));
  }
}

const html = (body: string, head = "") => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

function sendHtml(content: string, extra: Record<string, string> = {}): Handler {
  return (res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", ...extra });
    res.end(content);
  };
}

function sendBytes(bytes: Buffer, type: string): Handler {
  return (res) => {
    res.writeHead(200, { "content-type": type, "content-length": String(bytes.length) });
    res.end(bytes);
  };
}

function redirect(location: string, status = 302): Handler {
  return (res) => {
    res.writeHead(status, { location });
    res.end();
  };
}

/** Build the fixture site, its pool and the exact findings expected. */
export async function buildFixture(): Promise<Fixture> {
  const site = await new FixtureSite().start();
  const o = (host: string) => site.origin(host);
  const S = SOURCE_DOMAIN;

  // Synthetic images. Each seed gives an unrelated pattern.
  const img = {
    matchA: await patternImage(101, 320, 240, "png"),
    matchB: await patternImage(102, 400, 300, "jpeg"),
    smallB: await patternImage(103, 120, 90, "jpeg"), // srcset small variant, not in pool
    matchC: await patternImage(104, 300, 300, "png"), // og:image on the CDN
    matchD: await patternImage(105, 256, 256, "webp"), // <picture><source>
    lazy: await patternImage(106, 280, 200, "png"),
    based: await patternImage(107, 260, 260, "png"), // resolved via <base href>
    redirected: await patternImage(108, 300, 220, "png"),
    linked: await patternImage(109, 333, 222, "jpeg"), // <a href="x.jpg">
    gzipped: await patternImage(110, 240, 240, "png"),
    twoIds: await patternImage(111, 300, 300, "png"), // matches two pool entries
    decoy: await patternImage(120, 300, 300, "png"), // not in pool
    privateMatch: await patternImage(130, 300, 300, "png"), // behind robots.txt
    nofollowMatch: await patternImage(131, 300, 300, "png"), // only via nofollow
    offsiteMatch: await patternImage(132, 300, 300, "png"), // only on other.test
    deepMatch: await patternImage(133, 300, 300, "png"), // beyond max depth
    flat: await sharp({ create: { width: 200, height: 200, channels: 3, background: "#808080" } })
      .png()
      .toBuffer(), // quality 0: below 50, skipped even though in pool
    tinyReal: await patternImage(140, 40, 40, "png"), // under MIN_IMAGE_SIDE (64)
    avif: await patternImage(141, 320, 240, "avif"),
    truncFull: await patternImage(142, 640, 480, "jpeg"), // served truncated; its FULL hash is in the pool
    // Scope fixture (blog.fixture.test is approved on its own in scope tests).
    blog: await patternImage(150, 300, 300, "png"),
    blogDeep: await patternImage(151, 300, 300, "png"),
    shop: await patternImage(152, 300, 300, "png"),
    offA: await patternImage(153, 300, 300, "png"), // on an off-scope CDN host, in the pool
    flood: await patternImage(154, 300, 300, "png"), // on the link-flood site, in the pool
    // Browser-rendering fixture (WP7): js.fixture.test (render BROWSER) and
    // auto.fixture.test (render AUTO). None of these are in fx.expected;
    // the browser tests assert their own findings.
    jsEarly: await patternImage(160, 320, 240, "png"), // loaded without scrolling
    jsMid: await patternImage(161, 300, 300, "png"), // after one scroll (decoy)
    jsDeep: await patternImage(162, 340, 260, "png"), // after two scrolls: the match
    autoJs: await patternImage(163, 300, 300, "png"), // AUTO page image, JS-only
    autoStatic: await patternImage(164, 300, 300, "png"), // AUTO page image, static
    bomb: await pixelBombPng(30_000, 30_000),
  };

  const hashOf = async (b: Buffer) => (await hashImage(b, { minSide: 1 })).hash;
  const h: Record<string, string> = {};
  for (const [k, v] of Object.entries(img)) {
    if (k === "bomb") continue;
    h[k] = await hashOf(v);
  }

  // Pool: planted fingerprints, near-variants, and unrelated random ones.
  const fp = (id: string, pdq: string, quality = 100) => ({ id, pdq, quality });
  const pool: Pool = {
    version: "fixture-1",
    generatedAt: new Date().toISOString(),
    threshold: 31,
    fingerprints: [
      fp("fp-a", flipBits(h.matchA!, 6)), // near match: distance 6
      fp("fp-b", h.matchB!),
      fp("fp-small-b-far", flipBits(h.smallB!, 80, 3)), // far from smallB: no match
      fp("fp-c", h.matchC!),
      fp("fp-d", h.matchD!),
      fp("fp-lazy", h.lazy!),
      fp("fp-based", h.based!),
      fp("fp-redirected", h.redirected!),
      fp("fp-linked", h.linked!),
      fp("fp-gzipped", h.gzipped!),
      fp("fp-two-1", h.twoIds!),
      fp("fp-two-2", flipBits(h.twoIds!, 12, 9)),
      fp("fp-private", h.privateMatch!),
      fp("fp-nofollow", h.nofollowMatch!),
      fp("fp-offsite", h.offsiteMatch!),
      fp("fp-deep", h.deepMatch!),
      fp("fp-flat", h.flat!),
      fp("fp-tiny", h.tinyReal!),
      fp("fp-avif", h.avif!),
      // Served twice, cut short: at 97% it still matches (failOn "none"); at 40% it must not.
      fp("fp-truncated", h.truncFull!),
      fp("fp-blog", h.blog!),
      fp("fp-blog-deep", h.blogDeep!),
      fp("fp-shop", h.shop!), // only on the sibling host: must never be found from the blog source
      fp("fp-off-a", h.offA!),
      fp("fp-flood", h.flood!),
      fp("fp-js-deep", h.jsDeep!),
      fp("fp-auto-js", h.autoJs!),
      fp("fp-auto-static", h.autoStatic!),
      ...Array.from({ length: 200 }, (_, i) => fp(`fp-rand-${i}`, randomFingerprint(5000 + i))),
    ],
  };

  const expected: Expected[] = [
    { fingerprintId: "fp-a", pagePath: "/", imageHost: S, imagePath: "/img/a.png" },
    { fingerprintId: "fp-b", pagePath: "/gallery", imageHost: S, imagePath: "/img/b-large.jpg" },
    { fingerprintId: "fp-c", pagePath: "/gallery", imageHost: CDN_HOST, imagePath: "/c.png" },
    { fingerprintId: "fp-d", pagePath: "/gallery", imageHost: S, imagePath: "/img/d.webp" },
    { fingerprintId: "fp-lazy", pagePath: "/lazy", imageHost: S, imagePath: "/img/lazy.png" },
    { fingerprintId: "fp-based", pagePath: "/lazy", imageHost: S, imagePath: "/assets/based.png" },
    // Page reported as crawled (before its redirect); image as fetched (after its redirect).
    { fingerprintId: "fp-redirected", pagePath: "/moved", imageHost: S, imagePath: "/img/new.png" },
    { fingerprintId: "fp-linked", pagePath: "/gallery", imageHost: S, imagePath: "/img/linked.jpg" },
    { fingerprintId: "fp-gzipped", pagePath: "/sub", imageHost: `www.${S}`, imagePath: "/img/gz.png" },
    { fingerprintId: "fp-two-1", pagePath: "/sub", imageHost: `www.${S}`, imagePath: "/img/two.png" },
    { fingerprintId: "fp-two-2", pagePath: "/sub", imageHost: `www.${S}`, imagePath: "/img/two.png" },
    { fingerprintId: "fp-avif", pagePath: "/sub", imageHost: `www.${S}`, imagePath: "/img/pic.avif" },
    { fingerprintId: "fp-truncated", pagePath: "/sub", imageHost: `www.${S}`, imagePath: "/img/cut.jpg" },
  ];

  // ---- robots ----
  site.route(S, "/robots.txt", sendBytes(Buffer.from("User-agent: *\nDisallow: /private/\n"), "text/plain"));
  site.route(`www.${S}`, "/robots.txt", sendBytes(Buffer.from("User-agent: *\nAllow: /\n"), "text/plain"));
  site.route(CDN_HOST, "/robots.txt", (res) => {
    res.writeHead(404);
    res.end();
  });

  // ---- pages on the source ----
  site.route(
    S,
    "/",
    sendHtml(
      html(`
        <a href="/gallery">gallery</a>
        <a href="/lazy#top">lazy</a>
        <a href="/gallery?utm_source=x">same gallery, tracking param</a>
        <a href="/moved">moved page (redirects)</a>
        <a href="/private/secret">disallowed by robots</a>
        <a href="/nofollow-page">page with meta nofollow</a>
        <a rel="nofollow" href="/rel-nofollow">rel nofollow</a>
        <a href="${o(OFFSITE_HOST)}/page">off-domain link</a>
        <a href="/goaway">redirects off-domain</a>
        <a href="/doc.pdf">not html</a>
        <a href="${o(`www.${S}`)}/sub">subdomain page</a>
        <a href="/level1">depth chain</a>
        <a href="mailto:someone@example.invalid">mail</a>
        <a href="javascript:void(0)">js</a>
        <img src="/img/a.png" width="320" height="240">
        <img src="/img/decoy.png">
        <img src="/img/icon.png" width="16" height="16">
        <img src="data:image/png;base64,iVBORw0KGgo=">
        <img src="/img/logo.svg">
        <img src="/img/flat.png">
        <img src="/img/tiny-real.png">
        <img src="/img/huge.png">
        <img src="/img/huge-chunked.png">
        <img src="/img/slow.png">
        <img src="/img/fake.png">
        <img src="/img/bomb.png">
        <img src="/img/to-private.png">
        <img src="/img/to-metadata.png">
        <img src="/img/redirect-loop.png">
        <img src="http://${CDN_HOST}:8080/blocked-port.png">
        <img src="http://user:pw@${CDN_HOST}/creds.png">
      `),
    ),
  );
  site.route(
    S,
    "/gallery",
    sendHtml(
      html(
        `
        <img srcset="/img/b-small.jpg 120w, /img/b-large.jpg 400w" src="/img/b-small.jpg">
        <picture><source type="image/svg+xml" srcset="/img/vector.svg"><source srcset="/img/d.webp 1x"><img src="/img/decoy.png"></picture>
        <a href="/img/linked.jpg">full size</a>
        `,
        `<meta property="og:image" content="${o(CDN_HOST)}/c.png">`,
      ),
    ),
  );
  site.route(
    S,
    "/lazy",
    sendHtml(
      html(
        `<img src="/img/placeholder.gif" data-src="/img/lazy.png">
         <img src="based.png">`,
        `<base href="/assets/">`,
      ),
    ),
  );
  site.route(S, "/moved", redirect("/moved-target", 301));
  site.route(S, "/moved-target", sendHtml(html(`<img src="/img/old.png">`)));
  site.route(S, "/private/secret", sendHtml(html(`<img src="/img/private.png">`)));
  site.route(
    S,
    "/nofollow-page",
    sendHtml(html(`<a href="/hidden">hidden</a>`, `<meta name="robots" content="index, nofollow">`)),
  );
  site.route(S, "/hidden", sendHtml(html(`<img src="/img/nofollow.png">`)));
  site.route(S, "/rel-nofollow", sendHtml(html(`<img src="/img/nofollow.png">`)));
  site.route(S, "/goaway", redirect(`${o(OFFSITE_HOST)}/page`));
  site.route(S, "/doc.pdf", sendBytes(Buffer.from("%PDF-1.4 fixture"), "application/pdf"));
  site.route(S, "/level1", sendHtml(html(`<a href="/level2">next</a>`)));
  site.route(S, "/level2", sendHtml(html(`<a href="/level3">next</a>`)));
  site.route(S, "/level3", sendHtml(html(`<img src="/img/deep.png">`)));
  site.route(
    `www.${S}`,
    "/sub",
    sendHtml(html(`<img src="/img/gz.png"><img src="/img/two.png"><img src="/img/pic.avif"><img src="/img/cut.jpg"><img src="/img/cut-heavy.jpg"><a href="/">home</a>`)),
  );

  // ---- images on the source ----
  site.route(S, "/img/a.png", sendBytes(img.matchA, "image/png"));
  site.route(S, "/img/b-small.jpg", sendBytes(img.smallB, "image/jpeg"));
  site.route(S, "/img/b-large.jpg", sendBytes(img.matchB, "image/jpeg"));
  site.route(S, "/img/d.webp", sendBytes(img.matchD, "image/webp"));
  site.route(S, "/img/lazy.png", sendBytes(img.lazy, "image/png"));
  site.route(S, "/img/placeholder.gif", sendBytes(await patternImage(150, 8, 8, "gif"), "image/gif"));
  site.route(S, "/assets/based.png", sendBytes(img.based, "image/png"));
  site.route(S, "/img/old.png", redirect("/img/new.png"));
  site.route(S, "/img/new.png", sendBytes(img.redirected, "image/png"));
  site.route(S, "/img/linked.jpg", sendBytes(img.linked, "image/jpeg"));
  site.route(S, "/img/decoy.png", sendBytes(img.decoy, "image/png"));
  site.route(S, "/img/icon.png", sendBytes(img.matchA, "image/png")); // declared 16x16: never fetched
  site.route(S, "/img/logo.svg", sendBytes(Buffer.from("<svg/>"), "image/svg+xml"));
  site.route(S, "/img/vector.svg", sendBytes(Buffer.from("<svg/>"), "image/svg+xml"));
  site.route(S, "/img/flat.png", sendBytes(img.flat, "image/png"));
  site.route(S, "/img/tiny-real.png", sendBytes(img.tinyReal, "image/png"));
  site.route(S, "/img/private.png", sendBytes(img.privateMatch, "image/png"));
  site.route(S, "/img/nofollow.png", sendBytes(img.nofollowMatch, "image/png"));
  site.route(S, "/img/deep.png", sendBytes(img.deepMatch, "image/png"));
  site.route(S, "/img/bomb.png", sendBytes(img.bomb, "image/png"));
  site.route(S, "/img/fake.png", sendHtml(html("<p>not an image</p>"), { "content-type": "image/png" }));
  const hugePng = Buffer.concat([img.matchA.subarray(0, 8), Buffer.alloc(11 * 1024 * 1024, 7)]);
  site.route(S, "/img/huge.png", sendBytes(hugePng, "image/png"));
  site.route(S, "/img/huge-chunked.png", async (res) => {
    // No content-length: the cap must trip while streaming.
    res.writeHead(200, { "content-type": "image/png" });
    for (let i = 0; i < 12 && !res.destroyed; i++) {
      await new Promise<void>((r) => res.write(Buffer.alloc(1024 * 1024, 1), () => r()));
    }
    res.end();
  });
  site.route(S, "/img/slow.png", async (res) => {
    // Drips bytes: never idle long enough for the body timeout, so only the
    // overall request deadline stops it.
    res.writeHead(200, { "content-type": "image/png" });
    for (let i = 0; i < 100 && !res.destroyed; i++) {
      res.write(img.decoy.subarray(i * 10, i * 10 + 10));
      await new Promise((r) => setTimeout(r, 100));
    }
    res.end();
  });
  site.route(S, "/img/to-private.png", redirect("http://10.0.0.1/x.png"));
  site.route(S, "/img/to-metadata.png", redirect("http://169.254.169.254/latest/meta-data/"));
  site.route(S, "/img/redirect-loop.png", redirect("/img/redirect-loop.png?again=1"));
  site.route(S, "/img/redirect-loop.png?again=1", redirect("/img/redirect-loop.png"));

  // ---- subdomain images ----
  const gz = gzipSync(img.gzipped);
  site.route(`www.${S}`, "/img/gz.png", (res) => {
    res.writeHead(200, { "content-type": "image/png", "content-encoding": "gzip", "content-length": String(gz.length) });
    res.end(gz);
  });
  site.route(`www.${S}`, "/img/two.png", sendBytes(img.twoIds, "image/png"));
  site.route(`www.${S}`, "/img/pic.avif", sendBytes(img.avif, "image/avif"));
  // 97% of a JPEG whose complete version is in the pool.
  site.route(`www.${S}`, "/img/cut.jpg", sendBytes(Buffer.from(img.truncFull.subarray(0, Math.floor(img.truncFull.length * 0.97))), "image/jpeg"));
  site.route(`www.${S}`, "/img/cut-heavy.jpg", sendBytes(Buffer.from(img.truncFull.subarray(0, Math.floor(img.truncFull.length * 0.4))), "image/jpeg"));

  // ---- CDN ----
  site.route(CDN_HOST, "/c.png", sendBytes(img.matchC, "image/png"));

  // ---- off-domain site (must never be requested) ----
  site.route(OFFSITE_HOST, "/page", sendHtml(html(`<img src="/offsite.png">`)));
  site.route(OFFSITE_HOST, "/offsite.png", sendBytes(img.offsiteMatch, "image/png"));

  // ---- scope fixture: approve blog.fixture.test only ----
  const B = `blog.${S}`;
  site.route(
    B,
    "/",
    sendHtml(
      html(`
        <img src="/img/blog.png">
        <a href="${o(S)}/">parent domain</a>
        <a href="${o(`shop.${S}`)}/">sibling host</a>
        <a href="${o(`a.${B}`)}/deep">subdomain of the approved host</a>
        <a href="/jump">redirects to the sibling host</a>
      `),
    ),
  );
  site.route(B, "/img/blog.png", sendBytes(img.blog, "image/png"));
  site.route(B, "/jump", redirect(`${o(`shop.${S}`)}/landing`));
  site.route(`a.${B}`, "/deep", sendHtml(html(`<img src="/deep.png">`)));
  site.route(`a.${B}`, "/deep.png", sendBytes(img.blogDeep, "image/png"));
  site.route(`shop.${S}`, "/", sendHtml(html(`<img src="/shop.png">`)));
  site.route(`shop.${S}`, "/landing", sendHtml(html(`<img src="/shop.png">`)));
  site.route(`shop.${S}`, "/shop.png", sendBytes(img.shop, "image/png"));

  // ---- off-scope image hosts: approve gallery.fixture.test ----
  // Images on h1..h5.cdn.imgcdn.test, plus an in-scope image that redirects
  // to h6. With MAX_OFFSITE_IMAGE_HOSTS=3 only h1..h3 may ever be contacted.
  const G = `gallery.${S}`;
  const offHosts = [1, 2, 3, 4, 5].map((i) => `h${i}.${CDN_HOST}`);
  site.route(
    G,
    "/",
    sendHtml(html(`${offHosts.map((hst, i) => `<img src="${o(hst)}/p${i}.png">`).join("")}<img src="/img/bounce.png">`)),
  );
  site.route(G, "/img/bounce.png", redirect(`${o(`h6.${CDN_HOST}`)}/p6.png`));
  offHosts.forEach((hst, i) => site.route(hst, `/p${i}.png`, sendBytes(i === 0 ? img.offA : img.decoy, "image/png")));
  site.route(`h6.${CDN_HOST}`, "/p6.png", sendBytes(img.decoy, "image/png"));

  // ---- junk image hosts: approve junk.fixture.test ----
  // Four off-scope hosts that never return an image (404 on j1..j3, HTML on
  // j4), then the real CDN image (h1, matches fp-off-a). Junk hosts must not
  // use up MAX_OFFSITE_IMAGE_HOSTS; MAX_OFFSITE_HOST_FAILURES bounds them.
  const J = `junk.${S}`;
  const junkHosts = [1, 2, 3, 4].map((i) => `j${i}.${CDN_HOST}`);
  site.route(
    J,
    "/",
    sendHtml(html(`${junkHosts.map((hst) => `<img src="${o(hst)}/x.png">`).join("")}<img src="${o(`h1.${CDN_HOST}`)}/p0.png">`)),
  );
  site.route(`j4.${CDN_HOST}`, "/x.png", sendHtml(html("not an image")));

  // ---- link flood: approve flood.fixture.test ----
  // Every page is ~1.6 MB of links to 40,000 further pages (a hostile site
  // trying to exhaust the frontier). The home page also has one real image.
  const F = `flood.${S}`;
  const floodPage = (seed: number, withImage: boolean) =>
    html(
      (withImage ? `<img src="/img/flood.png">` : "") +
        Array.from({ length: 40_000 }, (_, i) => `<a href="/p/${seed}-${i}">x</a>`).join(""),
    );
  const home = floodPage(0, true);
  site.route(F, "/robots.txt", sendBytes(Buffer.from("User-agent: *\nAllow: /\n"), "text/plain"));
  site.route(F, "/", sendHtml(home));
  site.route(F, "/img/flood.png", sendBytes(img.flood, "image/png"));
  site.routeAny(F, (path) => sendHtml(floodPage(Number(path.split("-")[1] ?? 0) + 1, false)));

  // ---- conditional-GET fixture: approve etag.fixture.test ----
  // Three pages: two that always serve the same ETag (a 304 answers the
  // crawler's If-None-Match) and one that is gone. The handler reads the
  // request's headers from the site's own request log (the current request
  // is the last one recorded).
  const E = `etag.${S}`;
  const conditionalHtml = (tag: string, content: string): Handler => (res) => {
    const reqHeaders = site.requests[site.requests.length - 1]?.headers ?? {};
    if (reqHeaders["if-none-match"] === tag) {
      res.writeHead(304, { etag: tag });
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", etag: tag });
    res.end(content);
  };
  site.route(E, "/", conditionalHtml("tag-a", html(`<a href="/b">b</a><a href="/nonexistent">gone</a>`)));
  site.route(E, "/b", conditionalHtml("tag-b", html(`<a href="/">home</a>`)));
  site.route(E, "/robots.txt", sendBytes(Buffer.from("User-agent: *\nAllow: /\n"), "text/plain"));
  // /nonexistent has no route: the site answers 404, so the page is "gone".

  // ---- browser rendering (WP7): js.fixture.test (render BROWSER) ----
  // The gallery is built by JavaScript with infinite scroll: one image loads
  // immediately, one per scroll event. The planted match (/img/js-deep.png)
  // appears only after the second scroll, so a render without scrolling
  // cannot find it. The page also carries a static robots-disallowed image
  // (the browser worker must refuse to load it) and a link to /ssrf.
  const JS = `js.${S}`;
  site.route(JS, "/robots.txt", sendBytes(Buffer.from("User-agent: *\nAllow: /\nDisallow: /img/robots.png\n"), "text/plain"));
  const jsGallery = html(
    `
    <a href="/ssrf">ssrf probe</a>
    <img src="/img/robots.png" alt="robots disallowed">
    <div id="gallery"></div>
    <div style="height: 6000px"></div>
    <script>
      (function () {
        var added = 0;
        var batch = ["/img/js-early.png", "/img/js-mid.png", "/img/js-deep.png"];
        function add() {
          if (added >= batch.length) return;
          var img = document.createElement("img");
          img.src = batch[added++];
          document.getElementById("gallery").appendChild(img);
          if (added === 1) {
            var a = document.createElement("a");
            a.href = "/js-only";
            a.textContent = "js only";
            document.body.appendChild(a);
          }
        }
        add();
        window.addEventListener("scroll", function () {
          add();
        });
      })();
    </script>
    `,
  );
  site.route(JS, "/", sendHtml(jsGallery));
  site.route(JS, "/js-only", sendHtml(html(`<p>only reachable when the rendered DOM is read</p>`)));
  site.route(JS, "/img/js-early.png", sendBytes(img.jsEarly, "image/png"));
  site.route(JS, "/img/js-mid.png", sendBytes(img.jsMid, "image/png"));
  site.route(JS, "/img/js-deep.png", sendBytes(img.jsDeep, "image/png"));
  site.route(JS, "/img/robots.png", sendBytes(img.decoy, "image/png"));

  // A page whose script asks for two private addresses. Both must be refused
  // by the in-process proxy (a SOCKS refusal reaches the page as a failed
  // request); the page then records the outcome as a link only it would add
  // after both answers are in, proving the render survived the refusals.
  site.route(
    JS,
    "/ssrf",
    sendHtml(
      html(`
      <script>
        Promise.allSettled([
          fetch("http://10.0.0.1/x").then(function () { return 1; }, function () { return 0; }),
          fetch("http://metadata.test/x").then(function () { return 1; }, function () { return 0; }),
        ]).then(function (rs) {
          var refused = rs.every(function (r) { return r.value === 0; });
          if (refused) {
            var a = document.createElement("a");
            a.href = "/after-ssrf";
            a.textContent = "all refused";
            document.body.appendChild(a);
          }
        });
      </script>
      `),
    ),
  );
  site.route(JS, "/after-ssrf", sendHtml(html(`<p>both private fetches were refused</p>`)));

  // ---- browser rendering (WP7): auto.fixture.test (render AUTO) ----
  // /auto-a has scripts and no static images, so AUTO renders it in the
  // browser and the JS-added image is found. /auto-b has scripts AND a
  // static image, so AUTO never starts a browser for it.
  const A = `auto.${S}`;
  site.route(
    A,
    "/",
    sendHtml(html(`<a href="/auto-a">script page</a><a href="/auto-b">static page</a>`)),
  );
  site.route(
    A,
    "/auto-a",
    sendHtml(
      html(`
      <script>
        window.addEventListener("load", function () {
          var img = document.createElement("img");
          img.src = "/img/auto-js.png";
          document.body.appendChild(img);
        });
      </script>
      `),
    ),
  );
  site.route(
    A,
    "/auto-b",
    sendHtml(
      html(
        `<img src="/img/auto-static.png"><script>/* has scripts, but static
           image candidates exist: no browser needed */</script>`,
      ),
    ),
  );
  site.route(A, "/img/auto-js.png", sendBytes(img.autoJs, "image/png"));
  site.route(A, "/img/auto-static.png", sendBytes(img.autoStatic, "image/png"));

  return { site, pool, expected, allHashes: Object.values(h) };
}

/** Seed URL factory for fixture runs: the fixture server, with its port. */
export const fixtureSeedUrl = (port: number) => (source: { domain: string }) => `http://${source.domain}:${port}/`;

/**
 * The lighter-browser fixture (crawler v3 WP15): one render = BROWSER source,
 * light.fixture.test, whose home page is "full of fonts and trackers" —
 * 12 web fonts, a video, an audio file and two scripts from the built-in
 * advertising/analytics host list (the test DNS maps those hosts to the
 * fixture server, so an unblocked request would land in its request log) —
 * and whose three images are added by script only after everything else has
 * been asked for, so a request cap that the blocked kinds consumed would
 * abort them. The /slow page chains a lazy-loader: each image is inserted
 * only by the onload of the previous one, and the first two responses are
 * delayed, so the render must wait for network quiet to see the third.
 * No host here overlaps the other fixtures' hosts.
 */
export const LIGHT_HOST = `light.${SOURCE_DOMAIN}`;
/** The ad hosts of the fixture page (entries of the worker's built-in list). */
export const LIGHT_TRACKER_HOSTS = ["www.google-analytics.com", "ad.doubleclick.net"];
export const LIGHT_FONT_COUNT = 12;

export async function buildLightBrowserFixture(): Promise<Fixture> {
  const site = await new FixtureSite().start();
  const L = LIGHT_HOST;

  const img = {
    light1: await patternImage(170, 300, 300, "png"),
    light2: await patternImage(171, 300, 300, "png"),
    light3: await patternImage(172, 300, 300, "png"),
    slow1: await patternImage(173, 300, 300, "png"), // decoy: not in the pool
    slow2: await patternImage(174, 300, 300, "png"), // decoy: not in the pool
    slow3: await patternImage(175, 300, 300, "png"), // the planted match
  };
  const hashOf = async (b: Buffer) => (await hashImage(b, { minSide: 1 })).hash;
  const pool: Pool = {
    version: "light-1",
    generatedAt: new Date().toISOString(),
    threshold: 31,
    fingerprints: [
      { id: "fp-light-1", pdq: await hashOf(img.light1), quality: 100 },
      { id: "fp-light-2", pdq: await hashOf(img.light2), quality: 100 },
      { id: "fp-light-3", pdq: await hashOf(img.light3), quality: 100 },
      { id: "fp-slow-lazy", pdq: await hashOf(img.slow3), quality: 100 },
    ],
  };
  const expected: Expected[] = [
    { fingerprintId: "fp-light-1", pagePath: "/", imageHost: L, imagePath: "/img/light-1.png" },
    { fingerprintId: "fp-light-2", pagePath: "/", imageHost: L, imagePath: "/img/light-2.png" },
    { fingerprintId: "fp-light-3", pagePath: "/", imageHost: L, imagePath: "/img/light-3.png" },
    { fingerprintId: "fp-slow-lazy", pagePath: "/slow", imageHost: L, imagePath: "/img/slow-3.png" },
  ];

  site.route(L, "/robots.txt", sendBytes(Buffer.from("User-agent: *\\nAllow: /\\n"), "text/plain"));

  // The home page: fonts, media and trackers first, images only at load.
  const fontFaces = Array.from(
    { length: LIGHT_FONT_COUNT },
    (_, i) => `@font-face { font-family: F${i + 1}; src: url(/fonts/f${i + 1}.woff2) format("woff2"); }`,
  ).join("\n      ");
  const fontSpans = Array.from({ length: LIGHT_FONT_COUNT }, (_, i) => `<span style="font-family: F${i + 1}">${i + 1}</span>`).join("");
  const trackers = LIGHT_TRACKER_HOSTS.map((host, i) => `<script src="http://${host}:${site.port}/${i === 0 ? "analytics.js" : "x.js"}"></script>`).join("");
  site.route(
    L,
    "/",
    sendHtml(
      html(
        `
      ${trackers}
      ${fontSpans}
      <video src="/media/clip.mp4" preload="auto" muted autoplay playsinline></video>
      <audio src="/media/tone.mp3" preload="auto"></audio>
      <div style="height: 6000px"></div>
      <a href="/slow">slow gallery</a>
      <script>
        window.addEventListener("load", function () {
          ["/img/light-1.png", "/img/light-2.png", "/img/light-3.png"].forEach(function (src) {
            var img = document.createElement("img");
            img.src = src;
            document.body.appendChild(img);
          });
        });
      </script>
      `,
        `<style>${fontFaces}</style>`,
      ),
    ),
  );

  // The slow page: a chained lazy-loader started by the first scroll.
  site.route(
    L,
    "/slow",
    sendHtml(
      html(`
      <div id="gallery"></div>
      <div style="height: 6000px"></div>
      <script>
        (function () {
          var started = false;
          function add(src, onload) {
            var img = document.createElement("img");
            if (onload) img.onload = onload;
            img.src = src;
            document.getElementById("gallery").appendChild(img);
          }
          window.addEventListener("scroll", function () {
            if (started) return;
            started = true;
            add("/img/slow-1.png", function () {
              add("/img/slow-2.png", function () {
                add("/img/slow-3.png");
              });
            });
          });
        })();
      </script>
      `),
    ),
  );

  // What the blocked kinds would have asked for (never to be requested).
  for (let i = 1; i <= LIGHT_FONT_COUNT; i++) {
    site.route(L, `/fonts/f${i}.woff2`, sendBytes(Buffer.from(`fake woff2 bytes ${i}`), "font/woff2"));
  }
  site.route(L, "/media/clip.mp4", sendBytes(Buffer.alloc(2048, 1), "video/mp4"));
  site.route(L, "/media/tone.mp3", sendBytes(Buffer.alloc(1024, 2), "audio/mpeg"));
  for (const [i, host] of LIGHT_TRACKER_HOSTS.entries()) {
    // Real-looking answers, so a broken block would produce ordinary traffic
    // in the fixture server's request log (including the parent-side
    // robots.txt fetch the verdict would trigger), not a DNS error.
    site.route(host, "/robots.txt", sendBytes(Buffer.from("User-agent: *\\nAllow: /\\n"), "text/plain"));
    site.route(host, i === 0 ? "/analytics.js" : "/x.js", sendBytes(Buffer.from("// tracker"), "application/javascript"));
  }

  // The images. The first two of the slow chain answer late, so only their
  // onload continues the chain (and the render's network-quiet wait is what
  // lets the third one be seen at all).
  const slowImage = (bytes: Buffer, delayMs: number): Handler => async (res) => {
    await new Promise((r) => setTimeout(r, delayMs));
    res.writeHead(200, { "content-type": "image/png", "content-length": String(bytes.length) });
    res.end(bytes);
  };
  site.route(L, "/img/light-1.png", sendBytes(img.light1, "image/png"));
  site.route(L, "/img/light-2.png", sendBytes(img.light2, "image/png"));
  site.route(L, "/img/light-3.png", sendBytes(img.light3, "image/png"));
  site.route(L, "/img/slow-1.png", slowImage(img.slow1, 800));
  site.route(L, "/img/slow-2.png", slowImage(img.slow2, 800));
  site.route(L, "/img/slow-3.png", sendBytes(img.slow3, "image/png"));

  const allHashes: string[] = [];
  for (const b of [img.light1, img.light2, img.light3, img.slow1, img.slow2, img.slow3]) allHashes.push(await hashOf(b));
  return { site, pool, expected, allHashes };
}

/*
 * The frames-and-components fixture (crawler v3 WP16). Two sources; no host
 * here overlaps any other fixture's hosts.
 *   - frames.fixture.test (render http): the static side. The home page
 *     embeds an in-scope iframe gallery (/frame-gallery, one planted match),
 *     an off-scope iframe (outside.test — mapped into the fixture DNS, so a
 *     wrongly followed frame would land in the request log), an about:blank
 *     iframe and empty/missing-src iframes (never links), and links a
 *     frameset page whose <frame src> is a second planted gallery.
 *   - shadow.fixture.test (render browser): the rendered side. The home page
 *     carries a web component whose OPEN shadow root holds a two-image
 *     gallery, an in-scope iframe (/frame-a) and an about:srcdoc frame —
 *     each with images that exist only as data-src and whose lazy loaders
 *     wait for an event the page never sends, so nothing but the worker's
 *     frame/shadow gather can load them — plus an off-scope iframe whose
 *     navigation must be refused before any request leaves.
 * outside.test serves a canary page whose image is in the pool: following
 * the off-scope frame on either path would post its finding.
 */
export const FRAMES_HOST = `frames.${SOURCE_DOMAIN}`;
export const SHADOW_HOST = `shadow.${SOURCE_DOMAIN}`;
/** The off-scope host both sides' pages embed (mapped into the fixture DNS). */
export const FRAMES_OFF_HOST = "outside.test";

export async function buildFramesFixture(): Promise<Fixture> {
  const site = await new FixtureSite().start();
  const o = (host: string) => site.origin(host);
  const F = FRAMES_HOST;
  const H = SHADOW_HOST;

  const img = {
    frame: await patternImage(180, 320, 240, "png"), // static iframe gallery
    frameB: await patternImage(181, 300, 300, "png"), // static frameset frame
    shadow: await patternImage(182, 300, 300, "png"), // inside the open shadow root
    shadowDecoy: await patternImage(183, 300, 300, "png"), // second shadow image, not in the pool
    frameA: await patternImage(184, 300, 300, "png"), // inside the in-scope iframe
    srcdoc: await patternImage(185, 300, 300, "png"), // inside the about:srcdoc frame
    canary: await patternImage(186, 300, 300, "png"), // on outside.test: in the pool, must never be hashed
  };
  const hashOf = async (b: Buffer) => (await hashImage(b, { minSide: 1 })).hash;
  const pool: Pool = {
    version: "frames-1",
    generatedAt: new Date().toISOString(),
    threshold: 31,
    fingerprints: [
      { id: "fp-frames-gallery", pdq: await hashOf(img.frame), quality: 100 },
      { id: "fp-frameset", pdq: await hashOf(img.frameB), quality: 100 },
      { id: "fp-shadow", pdq: await hashOf(img.shadow), quality: 100 },
      { id: "fp-frame-a", pdq: await hashOf(img.frameA), quality: 100 },
      { id: "fp-srcdoc", pdq: await hashOf(img.srcdoc), quality: 100 },
      { id: "fp-outside-canary", pdq: await hashOf(img.canary), quality: 100 },
    ],
  };
  const expected: Expected[] = [
    { fingerprintId: "fp-frames-gallery", pagePath: "/frame-gallery", imageHost: F, imagePath: "/img/frame.png" },
    { fingerprintId: "fp-frameset", pagePath: "/frame-b", imageHost: F, imagePath: "/img/frame-b.png" },
    { fingerprintId: "fp-shadow", pagePath: "/", imageHost: H, imagePath: "/img/shadow-1.png" },
    { fingerprintId: "fp-frame-a", pagePath: "/", imageHost: H, imagePath: "/img/frame-a.png" },
    { fingerprintId: "fp-srcdoc", pagePath: "/", imageHost: H, imagePath: "/img/srcdoc.png" },
  ];

  const robots = sendBytes(Buffer.from("User-agent: *\nAllow: /\n"), "text/plain");

  // ---- static side: frames.fixture.test ----
  site.route(F, "/robots.txt", robots);
  site.route(
    F,
    "/",
    sendHtml(
      html(`
        <a href="/frameset">Frameset</a>
        <iframe src="/frame-gallery"></iframe>
        <iframe src="${o(FRAMES_OFF_HOST)}/never"></iframe>
        <iframe src="about:blank"></iframe>
        <iframe src=""></iframe>
        <iframe></iframe>
      `),
    ),
  );
  site.route(F, "/frame-gallery", sendHtml(html(`<img src="/img/frame.png" width="320" height="240">`)));
  site.route(F, "/frameset", sendHtml(`<!DOCTYPE html><html><head></head><frameset><frame src="/frame-b"></frameset></html>`));
  site.route(F, "/frame-b", sendHtml(html(`<img src="/img/frame-b.png" width="300" height="300">`)));
  site.route(F, "/img/frame.png", sendBytes(img.frame, "image/png"));
  site.route(F, "/img/frame-b.png", sendBytes(img.frameB, "image/png"));

  // ---- rendered side: shadow.fixture.test ----
  // The galleries exist only as data-src, and the page's lazy loaders wait
  // for "asmita-activate" — an event nothing ever sends — so the images are
  // loaded only by the worker's frame/shadow gather (crawler v3 WP16).
  const neverFires = `
      document.addEventListener("asmita-activate", function () {
        document.body.querySelectorAll("img").forEach(function (i) { i.src = i.dataset.src; });
      });`;
  site.route(H, "/robots.txt", robots);
  site.route(
    H,
    "/",
    sendHtml(
      html(`
        <gallery-comp></gallery-comp>
        <iframe src="/frame-a"></iframe>
        <iframe srcdoc="<img data-src='/img/srcdoc.png'>"></iframe>
        <iframe src="${o(FRAMES_OFF_HOST)}/never"></iframe>
        <script>
          customElements.define("gallery-comp", class extends HTMLElement {
            connectedCallback() {
              const root = this.attachShadow({ mode: "open" });
              root.innerHTML = "<img data-src='/img/shadow-1.png'><img data-src='/img/shadow-2.png'>";
            }
          });
          ${neverFires}
        </script>
      `),
    ),
  );
  site.route(
    H,
    "/frame-a",
    sendHtml(
      html(`
        <img data-src="/img/frame-a.png">
        <script>${neverFires}</script>
      `),
    ),
  );
  site.route(H, "/img/shadow-1.png", sendBytes(img.shadow, "image/png"));
  site.route(H, "/img/shadow-2.png", sendBytes(img.shadowDecoy, "image/png"));
  site.route(H, "/img/frame-a.png", sendBytes(img.frameA, "image/png"));
  site.route(H, "/img/srcdoc.png", sendBytes(img.srcdoc, "image/png"));

  // ---- the off-scope host (never to be requested, not even its robots.txt) ----
  site.route(FRAMES_OFF_HOST, "/robots.txt", robots);
  site.route(FRAMES_OFF_HOST, "/never", sendHtml(html(`<img src="/canary.png">`)));
  site.route(FRAMES_OFF_HOST, "/canary.png", sendBytes(img.canary, "image/png"));

  const allHashes: string[] = [];
  for (const b of [img.frame, img.frameB, img.shadow, img.shadowDecoy, img.frameA, img.srcdoc, img.canary]) allHashes.push(await hashOf(b));
  return { site, pool, expected, allHashes };
}

/*
 * The discovery fixture (crawler v2 WP5): a chain of sites, each linking the
 * next, plus the negatives. a.test is the only source a run starts with; its
 * home page links b.test (discovered, hops 1) and never.test (on the
 * never-crawl list the test gives the mock — never stored, never fetched).
 * b.test links c.test (hops 2); c.test links d.test (hops 3, beyond the
 * default hop limit: stored disabled) and carries the one planted image, so
 * a match under it proves the promotion rule. cap.test links five distinct
 * hosts for the per-run cap, pair.test two for the daily cap. No host here
 * overlaps the other fixtures' hosts.
 */
export const CHAIN_A = "a.test";
export const CHAIN_B = "b.test";
export const CHAIN_C = "c.test";
export const CHAIN_D = "d.test";
export const CHAIN_NEVER = "never.test";
export const CHAIN_CAP = "cap.test";
export const CHAIN_PAIR = "pair.test";
export const CHAIN_CAP_HOSTS = [1, 2, 3, 4, 5].map((i) => `h${i}.test`);
export const CHAIN_PAIR_HOSTS = ["e1.test", "e2.test"];
export const DISCOVERY_HOSTS = [
  CHAIN_A, CHAIN_B, CHAIN_C, CHAIN_D, CHAIN_NEVER, CHAIN_CAP, CHAIN_PAIR,
  ...CHAIN_CAP_HOSTS, ...CHAIN_PAIR_HOSTS,
];

export async function buildDiscoveryFixture(): Promise<Fixture> {
  const site = await new FixtureSite().start();
  const o = (host: string) => site.origin(host);

  const planted = await patternImage(301, 320, 240, "png");
  const plantedHash = (await hashImage(planted, { minSide: 1 })).hash;
  const pool: Pool = {
    version: "discovery-1",
    generatedAt: new Date().toISOString(),
    threshold: 31,
    fingerprints: [{ id: "fp-chain-c", pdq: plantedHash, quality: 100 }],
  };
  const expected: Expected[] = [
    { fingerprintId: "fp-chain-c", pagePath: "/", imageHost: CHAIN_C, imagePath: "/img/found.png" },
  ];

  site.route(CHAIN_A, "/", sendHtml(html(`
    <a href="${o(CHAIN_B)}/page">Next site</a>
    <a href="${o(CHAIN_NEVER)}/x">A never-crawl host</a>
  `)));
  site.route(CHAIN_B, "/", sendHtml(html(`<a href="${o(CHAIN_C)}/page">Next site</a>`)));
  site.route(CHAIN_C, "/", sendHtml(html(`
    <a href="${o(CHAIN_D)}/page">Next site</a>
    <img src="/img/found.png" width="320" height="240">
  `)));
  site.route(CHAIN_C, "/img/found.png", sendBytes(planted, "image/png"));
  site.route(CHAIN_D, "/", sendHtml(html(`<p>never fetched: stored disabled beyond the hop limit</p>`)));
  site.route(CHAIN_NEVER, "/x", sendHtml(html(`<p>never fetched: never-crawl host</p>`)));
  site.route(CHAIN_CAP, "/", sendHtml(html(CHAIN_CAP_HOSTS.map((host, i) => `<a href="${o(host)}/x${i}">x</a>`).join(""))));
  site.route(CHAIN_PAIR, "/", sendHtml(html(CHAIN_PAIR_HOSTS.map((host) => `<a href="${o(host)}/x">x</a>`).join(""))));

  return { site, pool, expected, allHashes: [plantedHash] };
}

/**
 * The deep-coverage fixture (crawler v2 WP4): a source whose robots.txt
 * names a sitemap index, which points at a gzipped urlset listing 30
 * paginated listing pages plus one page with an image-sitemap entry; an
 * Atom feed linked from the home page; and a home page that hides its
 * planted images in lazy attributes, inline background styles, a video
 * poster, link rel=image_src, JSON-LD, a noscript fallback and a thumbnail
 * link. A second source is the crawler trap: an infinite calendar whose
 * "next day" link is marked rel=next, date-archive paths, and a query-
 * string trap page. Nothing here is in the other fixture's hosts.
 */
export const DEEP_HOST = `deep.${SOURCE_DOMAIN}`;
export const TRAP_HOST = `trap.${SOURCE_DOMAIN}`;

/** Listing pages that carry a planted image (the rest are imageless). */
export const PLANTED_LISTING_PAGES = [1, 6, 11, 16, 21, 26];

const DAY_MS = 24 * 60 * 60 * 1000;

export async function buildDeepFixture(): Promise<Fixture> {
  const site = await new FixtureSite().start();
  const o = (host: string) => site.origin(host);
  const D = DEEP_HOST;
  const T = TRAP_HOST;

  const img = {
    lazy: await patternImage(201, 320, 240, "png"),
    bg: await patternImage(202, 300, 300, "png"),
    poster: await patternImage(203, 320, 240, "jpeg"),
    imageSrc: await patternImage(204, 300, 300, "png"),
    jsonld: await patternImage(205, 300, 300, "png"),
    noscript: await patternImage(206, 300, 300, "png"),
    full: await patternImage(207, 400, 300, "jpeg"),
    sitemap: await patternImage(208, 300, 300, "png"),
    post1: await patternImage(209, 300, 300, "png"),
    post2: await patternImage(210, 300, 300, "png"),
    post3: await patternImage(211, 300, 300, "png"),
    thumbDecoy: await patternImage(212, 120, 90, "jpeg"), // suppressed thumbnail, not in the pool
    dot: await patternImage(213, 8, 8, "gif"), // lazy placeholder, below MIN_IMAGE_SIDE
  };
  const listImg: Record<number, Buffer> = {};
  for (const n of PLANTED_LISTING_PAGES) listImg[n] = await patternImage(220 + n, 300, 300, "png");

  const hashOf = async (b: Buffer) => (await hashImage(b, { minSide: 1 })).hash;
  const planted: Array<{ fp: string; key: string; page: string; path: string }> = [
    { fp: "fp-lazy", key: "lazy", page: "/", path: "/img/lazy-deep.png" },
    { fp: "fp-bg", key: "bg", page: "/", path: "/img/bg.png" },
    { fp: "fp-poster", key: "poster", page: "/", path: "/img/poster.png" },
    { fp: "fp-imagesrc", key: "imageSrc", page: "/", path: "/img/image-src.png" },
    { fp: "fp-jsonld", key: "jsonld", page: "/", path: "/img/jsonld.png" },
    { fp: "fp-noscript", key: "noscript", page: "/", path: "/img/noscript.png" },
    { fp: "fp-full", key: "full", page: "/", path: "/img/full.jpg" },
    { fp: "fp-sitemap", key: "sitemap", page: "/gallery-deep", path: "/img/sitemap-image.png" },
    { fp: "fp-post-1", key: "post1", page: "/post/1", path: "/img/post-1.png" },
    { fp: "fp-post-2", key: "post2", page: "/post/2", path: "/img/post-2.png" },
    { fp: "fp-post-3", key: "post3", page: "/post/3", path: "/img/post-3.png" },
  ];
  const allHashes: string[] = [];
  const fingerprints: Array<{ id: string; pdq: string; quality: number }> = [];
  const bytesOf = (key: string): Buffer =>
    key.startsWith("list") ? listImg[Number(key.slice(4))]! : (img as unknown as Record<string, Buffer>)[key]!;
  for (const p of [...planted, ...PLANTED_LISTING_PAGES.map((n) => ({ fp: `fp-list-${n}`, key: `list${n}`, page: `/listing?page=${n}`, path: `/img/list-${n}.png` }))]) {
    const h = await hashOf(bytesOf(p.key));
    allHashes.push(h);
    fingerprints.push({ id: p.fp, pdq: h, quality: 100 });
  }
  const pool: Pool = { version: "deep-1", generatedAt: new Date().toISOString(), threshold: 31, fingerprints };

  const expected: Expected[] = [
    ...planted.map((p) => ({ fingerprintId: p.fp, pagePath: p.page, imageHost: D, imagePath: p.path })),
    ...PLANTED_LISTING_PAGES.map((n) => ({ fingerprintId: `fp-list-${n}`, pagePath: `/listing?page=${n}`, imageHost: D, imagePath: `/img/list-${n}.png` })),
  ];

  // ---- deep source ----
  site.route(
    D,
    "/robots.txt",
    sendBytes(Buffer.from(`User-agent: *\nAllow: /\nSitemap: ${o(D)}/sitemap-index.xml\n`), "text/plain"),
  );
  site.route(
    D,
    "/",
    sendHtml(
      html(
        `
        <a href="/listing?page=1">Listings</a>
        <a href="/qtrap">Query trap</a>
        <a href="/login">Member login</a>
        <a href="/search?q=photos">Search</a>
        <a href="/cart">Cart</a>
        <a href="/calendar/2026-01-01">What's on</a>
        <img src="/img/dot.gif" data-src="/img/lazy-deep.png">
        <div style="background-image:url('/img/bg.png')">hero</div>
        <video poster="/img/poster.png" controls></video>
        <a href="/img/full.jpg"><img src="/img/thumb-decoy.png"></a>
        <noscript><img src="/img/noscript.png"></noscript>
      `,
        `<link rel="alternate" type="application/atom+xml" href="/feed.atom">
         <link rel="image_src" href="/img/image-src.png">
         <script type="application/ld+json">{"@context":"https://schema.org","@type":"ImageGallery","image":{"url":"/img/jsonld.png"}}</script>`,
      ),
    ),
  );
  site.route(
    D,
    "/sitemap-index.xml",
    sendBytes(
      Buffer.from(
        `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${o(D)}/sitemap-pages.xml.gz</loc></sitemap>
</sitemapindex>`,
      ),
      "application/xml",
    ),
  );
  const urlset = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${Array.from({ length: 30 }, (_, i) => `  <url><loc>${o(D)}/listing?page=${i + 1}</loc></url>`).join("\n")}
  <url><loc>${o(D)}/gallery-deep</loc><image:image><image:loc>${o(D)}/img/sitemap-image.png</image:loc></image:image></url>
</urlset>`;
  const gz = gzipSync(Buffer.from(urlset));
  site.route(
    D,
    "/sitemap-pages.xml.gz",
    (res) => {
      res.writeHead(200, { "content-type": "application/gzip", "content-length": String(gz.length) });
      res.end(gz);
    },
  );
  site.route(
    D,
    "/feed.atom",
    sendBytes(
      Buffer.from(
        `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Deep fixture posts</title>
  <link rel="self" href="${o(D)}/feed.atom"/>
${Array.from({ length: 3 }, (_, i) => `  <entry><title>Post ${i + 1}</title><link rel="alternate" href="${o(D)}/post/${i + 1}"/><link rel="self" href="${o(D)}/feed.atom"/></entry>`).join("\n")}
</feed>`,
      ),
      "application/atom+xml",
    ),
  );
  site.route(D, "/gallery-deep", sendHtml(html(`<p>gallery reached through the sitemap</p>`)));
  for (let n = 1; n <= 30; n++) {
    const plantedImg = PLANTED_LISTING_PAGES.includes(n) ? `<img src="/img/list-${n}.png">` : "";
    const next = n < 30 ? `<a rel="next" class="next-page" href="/listing?page=${n + 1}">Next ›</a>` : "";
    site.route(
      D,
      `/listing?page=${n}`,
      sendHtml(
        html(
          `${plantedImg}${next}
           <a href="/listing?page=${n}&amp;utm_source=share">share this page</a>
           <a href="/listing?page=${n}&amp;calendar=1">calendar view</a>`,
        ),
      ),
    );
  }
  for (let n = 1; n <= 3; n++) {
    site.route(D, `/post/${n}`, sendHtml(html(`<img src="/img/post-${n}.png"><a href="/">home</a>`)));
  }
  site.route(
    D,
    "/qtrap",
    sendHtml(html(Array.from({ length: 40 }, (_, k) => `<a href="/qtrap-item?v=${k + 1}">item ${k + 1}</a>`).join(""))),
  );

  const imageRoute = (path: string, bytes: Buffer, type = "image/png") => site.route(D, path, sendBytes(bytes, type));
  imageRoute("/img/lazy-deep.png", img.lazy);
  imageRoute("/img/bg.png", img.bg);
  imageRoute("/img/poster.png", img.poster, "image/jpeg");
  imageRoute("/img/image-src.png", img.imageSrc);
  imageRoute("/img/jsonld.png", img.jsonld);
  imageRoute("/img/noscript.png", img.noscript);
  imageRoute("/img/full.jpg", img.full, "image/jpeg");
  imageRoute("/img/sitemap-image.png", img.sitemap);
  imageRoute("/img/thumb-decoy.png", img.thumbDecoy, "image/jpeg");
  imageRoute("/img/dot.gif", img.dot, "image/gif");
  for (const n of PLANTED_LISTING_PAGES) imageRoute(`/img/list-${n}.png`, listImg[n]!);
  for (let n = 1; n <= 3; n++) imageRoute(`/img/post-${n}.png`, (img as unknown as Record<string, Buffer>)[`post${n}`]!);

  // ---- trap source: infinite calendar, date archives, query trap ----
  site.route(T, "/robots.txt", sendBytes(Buffer.from("User-agent: *\nAllow: /\n"), "text/plain"));
  site.route(
    T,
    "/",
    sendHtml(
      html(
        `${`<a rel="next" class="next-day" href="/cal/2026-01-01">Next day</a>`}
         <a href="/2026/01/17">Archives</a>
         <a href="/login">Log in</a>
         <a href="/ok">Fine page</a>
         ${Array.from({ length: 40 }, (_, k) => `<a href="/t?u=${k + 1}">item ${k + 1}</a>`).join("")}`,
      ),
    ),
  );
  site.route(T, "/ok", sendHtml(html(`<p>fine</p>`)));
  site.routeAny(T, (path) => {
    // An infinite calendar: every /cal/<date> page links the next day, with
    // rel=next and pagination classes. If the crawler ever fetched one, the
    // chain never ends; the non-content rules must keep it at zero.
    const cal = /^\/cal\/(\d{4})-(\d{2})-(\d{2})/.exec(path);
    const send = (body: string) => sendHtml(html(body));
    if (cal) {
      const next = new Date(Date.UTC(Number(cal[1]), Number(cal[2]) - 1, Number(cal[3])) + DAY_MS);
      const nextPath = `/cal/${next.toISOString().slice(0, 10)}`;
      return send(`<a rel="next" class="next-day" href="${nextPath}">Next day</a>`);
    }
    return send(`<p>nothing here</p>`);
  });

  return { site, pool, expected, allHashes };
}

/**
 * The parallel-sources fixture (crawler v2 WP6): twenty independent sites of
 * mixed speed plus one that never answers its home page. A run against all
 * of them proves sources are crawled concurrently (the bound a serial run
 * cannot meet) and that a hanging source does not delay the others: every
 * fast source finishes while the hanging one is still stuck on its first
 * request, and the hanging source's report is the last one the run sends.
 * Host s1.speed.test has a second page linked from its home page — the only
 * new URL any of these sites reports. No host here overlaps the other
 * fixtures' hosts, and no page carries an image.
 */
export const SPEED_HOSTS = Array.from({ length: 20 }, (_, i) => `s${i + 1}.speed.test`);
/** Each fast source's home page takes this long to answer (100..300 ms). */
export const SPEED_DELAYS_MS = SPEED_HOSTS.map((_, i) => 100 + (i % 5) * 50);
export const HANG_HOST = "hang.speed.test";
export const PARALLEL_HOSTS = [...SPEED_HOSTS, HANG_HOST];
/** Sum of every page delay: the least a fully serial run would need. */
export const SPEED_SERIAL_MS = SPEED_DELAYS_MS.reduce((a, b) => a + b, 0) + SPEED_DELAYS_MS[0]!;

export async function buildParallelFixture(): Promise<Fixture> {
  const site = await new FixtureSite().start();
  const robots = sendBytes(Buffer.from("User-agent: *\nAllow: /\n"), "text/plain");
  const slowHtml = (delayMs: number, links = ""): Handler => async (res) => {
    await new Promise((r) => setTimeout(r, delayMs));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html(links));
  };
  for (const [i, host] of SPEED_HOSTS.entries()) {
    site.route(host, "/robots.txt", robots);
    site.route(host, "/", slowHtml(SPEED_DELAYS_MS[i]!, i === 0 ? `<a href="/deep">second page</a>` : ""));
  }
  // s1's linked second page: one new URL reported per first pass, one extra
  // page delay in the serial total.
  site.route(SPEED_HOSTS[0]!, "/deep", slowHtml(SPEED_DELAYS_MS[0]!));
  // The hanging source: robots.txt answers normally, the home page never
  // does; the crawler's request deadline is what ends the hang.
  site.route(HANG_HOST, "/robots.txt", robots);
  site.route(HANG_HOST, "/", () => {});
  const pool: Pool = { version: "parallel-1", generatedAt: new Date().toISOString(), threshold: 31, fingerprints: [] };
  return { site, pool, expected: [], allHashes: [] };
}

/** Env for a fixture run (test values only, nothing real). */
export function fixtureEnv(apiUrl: string, key: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    ASMITA_API_URL: apiUrl,
    CRAWLER_SERVICE_KEY: key,
    CRAWLER_USER_AGENT: "AsmitaCrawler/0.1 (test)",
    MAX_DEPTH: "2",
    OFFSITE_HOST_DELAY_MS: "0",
    REQUEST_TIMEOUT_MS: "1500",
    HEADERS_TIMEOUT_MS: "1500",
    BODY_TIMEOUT_MS: "1500",
    CONNECT_TIMEOUT_MS: "1500",
    FETCH_ATTEMPTS: "1",
    API_ATTEMPTS: "2",
    SHUTDOWN_GRACE_MS: "500",
    GLOBAL_CONCURRENCY: "4",
    ...extra,
  };
}

export const TEST_KEY = "test-service-key-0123456789-abcdefghij";
