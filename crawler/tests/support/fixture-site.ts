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
import { packHex, popcount32 } from "../../src/match/matcher.ts";
import { fakeSscdEmbed, flipBits, patternImage, pixelBombPng, randomFingerprint, spriteSheet } from "./synthetic.ts";

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

/**
 * Deterministic distinct letters for a number (1 -> a, 26 -> z, 27 -> aa):
 * a per-page word that survives the soft-404 body digest's digit stripping
 * (crawler v3 WP14), so pages that differ only by digits in their markup —
 * which the digest must treat as one template — can be kept apart on purpose
 * by giving each a letter tag.
 */
const letterTag = (n: number): string => {
  let s = "";
  let x = Math.max(1, Math.floor(n));
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(97 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
};

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
  // Each page carries its own letter tag: the flood test wants every claimed
  // page to offer its links, and the soft-404 body digest (crawler v3 WP14)
  // would read digit-only-identical bodies as one repeated template.
  const F = `flood.${S}`;
  const floodPage = (tag: string, seed: number, withImage: boolean) =>
    html(
      (withImage ? `<img src="/img/flood.png">` : "") +
        `<p>page ${tag}</p>` +
        Array.from({ length: 40_000 }, (_, i) => `<a href="/p/${seed}-${i}">x</a>`).join(""),
    );
  const home = floodPage("home", 0, true);
  site.route(F, "/robots.txt", sendBytes(Buffer.from("User-agent: *\nAllow: /\n"), "text/plain"));
  site.route(F, "/", sendHtml(home));
  site.route(F, "/img/flood.png", sendBytes(img.flood, "image/png"));
  site.routeAny(F, (path) => {
    // Today's rule kept: the link index that led here is the next seed.
    const m = /^\/p\/(\d+)-(\d+)/.exec(path);
    const seed = m ? Number(m[2]) + 1 : 1;
    const tag = m ? `${letterTag(Number(m[1]) + 1)}-${letterTag(seed)}` : "any";
    return sendHtml(floodPage(tag, seed, false));
  });

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
          // The heading word makes every listing page genuinely distinct
          // content beyond its digits: a real listing's pages differ in more
          // than numbers, and the soft-404 body digest (WP14) strips digits,
          // so digit-only variation would read as one repeated template.
          `<h1>Listing ${letterTag(n)}</h1>${plantedImg}${next}
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
    // The admitted /t?u=N variants each get their own word: the query-trap
    // test wants all eight fetched, and the soft-404 body digest (WP14)
    // would otherwise read digit-only-identical bodies as one template.
    const u = Number(/\/t\?u=(\d+)/.exec(path)?.[1] ?? 0);
    return send(`<p>nothing here (${letterTag(u)})</p>`);
  });

  return { site, pool, expected, allHashes };
}

/*
 * The sitemap-probe fixture (crawler v3 WP9): three sources whose
 * robots.txt name no sitemap. plain.probe.test serves /sitemap.xml (a
 * urlset with an image-sitemap entry) and nothing at /sitemap_index.xml;
 * index.probe.test serves only /sitemap_index.xml (an index pointing at a
 * child urlset); sub.probe.test serves a non-XML page at /sitemap.xml and
 * nothing at /sitemap_index.xml, but its registrable parent probe.test
 * serves a /sitemap.xml that lists in-scope (sub.probe.test) and
 * out-of-scope (sib.probe.test, probe.test itself) pages. No host here
 * overlaps the other fixtures' hosts.
 */
export const PROBE_PLAIN_HOST = `plain.probe.test`;
export const PROBE_INDEX_HOST = `index.probe.test`;
export const PROBE_SUB_HOST = `sub.probe.test`;
/** The registrable parent of all three sources; its /sitemap.xml is probed once per source. */
export const PROBE_PARENT_HOST = `probe.test`;
/** An out-of-scope sibling of sub.probe.test; its page is listed in the parent sitemap and must never be fetched. */
export const PROBE_SIB_HOST = `sib.probe.test`;
export const PROBE_HOSTS = [PROBE_PLAIN_HOST, PROBE_INDEX_HOST, PROBE_SUB_HOST, PROBE_PARENT_HOST, PROBE_SIB_HOST];

export async function buildSitemapProbeFixture(): Promise<Fixture> {
  const site = await new FixtureSite().start();
  const o = (host: string) => site.origin(host);
  const P = PROBE_PLAIN_HOST;
  const I = PROBE_INDEX_HOST;
  const U = PROBE_SUB_HOST;
  const R = PROBE_PARENT_HOST;

  const img = {
    alpha: await patternImage(320, 320, 240, "png"),
    beta: await patternImage(321, 300, 300, "png"),
    gamma: await patternImage(322, 300, 300, "png"),
    kept: await patternImage(323, 300, 300, "png"),
  };
  const hashOf = async (b: Buffer) => (await hashImage(b, { minSide: 1 })).hash;
  const h: Record<string, string> = {};
  for (const [k, v] of Object.entries(img)) h[k] = await hashOf(v);
  const pool: Pool = {
    version: "probe-1",
    generatedAt: new Date().toISOString(),
    threshold: 31,
    fingerprints: [
      { id: "fp-probe-alpha", pdq: h.alpha!, quality: 100 },
      { id: "fp-probe-beta", pdq: h.beta!, quality: 100 },
      { id: "fp-probe-gamma", pdq: h.gamma!, quality: 100 },
      { id: "fp-probe-kept", pdq: h.kept!, quality: 100 },
    ],
  };
  const expected: Expected[] = [
    { fingerprintId: "fp-probe-alpha", pagePath: "/alpha", imageHost: P, imagePath: "/img/alpha.png" },
    // beta's image is an <image:loc> entry of the probed sitemap, hashed for its page.
    { fingerprintId: "fp-probe-beta", pagePath: "/beta", imageHost: P, imagePath: "/img/beta.png" },
    { fingerprintId: "fp-probe-gamma", pagePath: "/gamma", imageHost: I, imagePath: "/img/gamma.png" },
    { fingerprintId: "fp-probe-kept", pagePath: "/kept", imageHost: U, imagePath: "/img/kept.png" },
  ];

  const robotsAllow = sendBytes(Buffer.from("User-agent: *\nAllow: /\n"), "text/plain");

  // ---- (a) plain: /sitemap.xml present, robots.txt names no sitemap ----
  site.route(P, "/robots.txt", robotsAllow);
  // The home page links nothing: the probed sitemap is the only way the
  // fixture's content pages can enter the frontier.
  site.route(P, "/", sendHtml(html(`<p>plain home, no links</p>`)));
  site.route(
    P,
    "/sitemap.xml",
    sendBytes(
      Buffer.from(
        `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url><loc>${o(P)}/alpha</loc></url>
  <url><loc>${o(P)}/beta</loc><image:image><image:loc>${o(P)}/img/beta.png</image:loc></image:image></url>
</urlset>`,
      ),
      "application/xml",
    ),
  );
  // No /sitemap_index.xml route: the second probe must never happen once the first hit.
  site.route(P, "/alpha", sendHtml(html(`<img src="/img/alpha.png">`)));
  site.route(P, "/beta", sendHtml(html(`<p>its image lives in the sitemap entry</p>`)));
  site.route(P, "/img/alpha.png", sendBytes(img.alpha, "image/png"));
  site.route(P, "/img/beta.png", sendBytes(img.beta, "image/png"));

  // ---- (b) index: only /sitemap_index.xml ----
  site.route(I, "/robots.txt", robotsAllow);
  site.route(I, "/", sendHtml(html(`<p>index home, no links</p>`)));
  // No /sitemap.xml route: the probe 404s quietly and the second path is tried.
  site.route(
    I,
    "/sitemap_index.xml",
    sendBytes(
      Buffer.from(
        `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${o(I)}/sitemap-child.xml</loc></sitemap>
</sitemapindex>`,
      ),
      "application/xml",
    ),
  );
  site.route(
    I,
    "/sitemap-child.xml",
    sendBytes(
      Buffer.from(
        `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${o(I)}/gamma</loc></url>
</urlset>`,
      ),
      "application/xml",
    ),
  );
  site.route(I, "/gamma", sendHtml(html(`<img src="/img/gamma.png">`)));
  site.route(I, "/img/gamma.png", sendBytes(img.gamma, "image/png"));

  // ---- (c) sub: nothing usable itself; the parent sitemap has the pages ----
  site.route(U, "/robots.txt", robotsAllow);
  site.route(U, "/", sendHtml(html(`<p>sub home, no links</p>`)));
  // A non-XML answer at the first probe path: quietly ignored.
  site.route(U, "/sitemap.xml", sendHtml(html(`<p>soft-404 junk, not a sitemap</p>`)));
  // No /sitemap_index.xml route: 404, quietly ignored.
  site.route(U, "/kept", sendHtml(html(`<img src="/img/kept.png">`)));
  site.route(U, "/img/kept.png", sendBytes(img.kept, "image/png"));

  // ---- the registrable parent, probe.test: its /sitemap.xml lists pages ----
  site.route(R, "/robots.txt", robotsAllow);
  site.route(
    R,
    "/sitemap.xml",
    sendBytes(
      Buffer.from(
        `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${o(U)}/kept</loc></url>
  <url><loc>${o(PROBE_SIB_HOST)}/dropped</loc></url>
  <url><loc>${o(R)}/apex-dropped</loc></url>
</urlset>`,
      ),
      "application/xml",
    ),
  );
  // sib.probe.test and the apex page have no routes: a request would still be
  // recorded by the fixture server, so the test can prove they never happen.

  return { site, pool, expected, allHashes: Object.values(h) };
}

/*
 * The count-once fixture (crawler v3 WP10): one source whose home page links
 * the same target page in four forms — /target, /target/ (trailing slash),
 * /target/index.html and the www host — which must become one frontier row
 * and one fetch; a second page links the https form of the same target after
 * the row exists, which must change nothing. Canonical aliases: one page
 * whose canonical target also has a live row (the row is killed), one whose
 * target has no row yet (a link arriving in the same batch is swallowed by
 * the tombstone), one canonical pointing at itself and one pointing
 * off-scope (neither is reported, the off-scope one is never fetched and
 * never a discovery). No host here overlaps the other fixtures' hosts.
 */
export const CANON_HOST = "canon.fixture.test";
export const WWW_CANON_HOST = `www.${CANON_HOST}`;
/** An off-scope host a canonical link names; it must never be contacted. */
export const CANON_OFFSITE_HOST = "other-canon.test";
/** The alias target that already has a live row when its alias is reported. */
export const CANON_KILLED_PATH = "/real-page";
/** The alias target that has no row until a later link in the same batch. */
export const CANON_LATE_PATH = "/late-twin";

export async function buildCanonicalFixture(): Promise<Fixture> {
  const site = await new FixtureSite().start();
  const o = (host: string) => site.origin(host);
  const C = CANON_HOST;
  const W = WWW_CANON_HOST;

  const page = (body: string, head = "") => sendHtml(html(body, head));
  site.route(C, "/robots.txt", sendBytes(Buffer.from("User-agent: *\nAllow: /\n"), "text/plain"));

  // The four forms of one page, in a fixed order: the first form seen
  // (/target, bare) is the one kept and fetched.
  const target = page(`<p>the one target page</p>`);
  site.route(C, "/target", target);
  site.route(C, "/target/", target);
  site.route(C, "/target/index.html", target);
  site.route(W, "/robots.txt", sendBytes(Buffer.from("User-agent: *\nAllow: /\n"), "text/plain"));
  site.route(W, "/target", target);

  site.route(
    C,
    "/",
    page(`
      <a href="/target">t1</a>
      <a href="/target/">t2</a>
      <a href="/target/index.html">t3</a>
      <a href="${o(W)}/target">t4 (www)</a>
      <a href="/second">the https variant lives here</a>
      <a href="/canonical-page">canonical page</a>
      <a href="${CANON_KILLED_PATH}">its canonical target, linked too</a>
      <a href="/late-canonical">late canonical</a>
      <a href="/self-canonical">self canonical</a>
      <a href="/offscope-canonical">off-scope canonical</a>
    `),
  );
  // The https twin of /target, linked only after the row exists, plus the
  // late alias target (no row yet when its alias may be reported first).
  site.route(C, "/second", page(`<a href="https://${C}:${site.port}/target">https twin</a><a href="${CANON_LATE_PATH}">late twin</a>`));
  site.route(C, "/canonical-page", page(`<p>a duplicate of the real page</p>`, `<link rel="canonical" href="${CANON_KILLED_PATH}">`));
  site.route(C, "/late-canonical", page(`<p>another duplicate, its target is linked later</p>`, `<link rel="canonical" href="${CANON_LATE_PATH}">`));
  site.route(C, "/self-canonical", page(`<p>names itself canonical</p>`, `<link rel="canonical" href="/self-canonical">`));
  site.route(C, "/offscope-canonical", page(`<p>names an off-scope host canonical</p>`, `<link rel="canonical" href="${o(CANON_OFFSITE_HOST)}/page">`));
  site.route(C, CANON_KILLED_PATH, page(`<p>the real page</p>`));
  // CANON_LATE_PATH has no route on purpose: any request to it would be
  // recorded (as a 404) and the test proves none ever happens.

  const pool: Pool = { version: "canon-1", generatedAt: new Date().toISOString(), threshold: 31, fingerprints: [] };
  return { site, pool, expected: [], allHashes: [] };
}

/*
 * The crawl-order fixture (crawler v3 WP11): one source whose home page
 * links a pagination page, a plain page and a feed, whose robots.txt names
 * a sitemap with <lastmod> entries — one newer than any fetch the fixture
 * will ever see, one an old date-only value — and whose feed lists one
 * entry page. The mock mirrors the app's priorities, so a run claims the
 * sitemap before the feed before the pagination page before the plain
 * page, and a later run (after the sitemap re-reports it) fetches the
 * newer-lastmod page ahead of the older plain one. No images, no host
 * overlaps with the other fixtures.
 */
export const PRIO_HOST = "prio.fixture.test";
/** The sitemap's new entry: newer than every fetch the fixture's clock sees. */
export const PRIO_LASTMOD_NEW = "2026-11-19T12:00:00Z";
/** The sitemap's old entry: a date-only value far in the past. */
export const PRIO_LASTMOD_OLD = "2026-11-09";
/** The ISO forms the crawler normalises those to before reporting. */
export const PRIO_LASTMOD_NEW_ISO = "2026-11-19T12:00:00.000Z";
export const PRIO_LASTMOD_OLD_ISO = "2026-11-09T00:00:00.000Z";

export async function buildPriorityFixture(): Promise<Fixture> {
  const site = await new FixtureSite().start();
  const o = (host: string) => site.origin(host);
  const P = PRIO_HOST;

  const page = (body: string, head = "") => sendHtml(html(body, head));
  site.route(P, "/robots.txt", sendBytes(
    Buffer.from(`User-agent: *\nAllow: /\nSitemap: ${o(P)}/sitemap.xml\n`),
    "text/plain",
  ));
  site.route(
    P,
    "/",
    page(
      `
      <a href="/listing?page=2" rel="next">next page</a>
      <a href="/plain">a plain page</a>
    `,
      `<link rel="alternate" type="application/rss+xml" href="/feed.rss">`,
    ),
  );
  site.route(
    P,
    "/sitemap.xml",
    sendBytes(
      Buffer.from(
        `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${o(P)}/gallery</loc><lastmod>${PRIO_LASTMOD_NEW}</lastmod></url>
  <url><loc>${o(P)}/stale</loc><lastmod>${PRIO_LASTMOD_OLD}</lastmod></url>
</urlset>`,
      ),
      "application/xml",
    ),
  );
  site.route(
    P,
    "/feed.rss",
    sendBytes(
      Buffer.from(
        `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>prio</title><link>${o(P)}/</link>
  <item><title>one</title><link>${o(P)}/from-feed</link></item>
</channel></rss>`,
      ),
      "application/rss+xml",
    ),
  );
  for (const path of ["/listing?page=2", "/plain", "/gallery", "/stale", "/from-feed"]) {
    site.route(P, path, page(`<p>${path}</p>`));
  }

  const pool: Pool = { version: "prio-1", generatedAt: new Date().toISOString(), threshold: 31, fingerprints: [] };
  return { site, pool, expected: [], allHashes: [] };
}

/**
 * The parallel-sources fixture (crawler v2 WP6): twenty independent sites of
 * mixed speed plus one that never answers its home page. A run against all
 * of them proves sources are crawled concurrently (the bound a serial run
 * cannot meet) and that a hanging source does not delay the others: every
 * fast source finishes while the hanging one is still stuck on its first
 * request, and the hanging source's error report is the last one the run
 * sends. Host s1.speed.test has a second page linked from its home page — the only
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

/*
 * The page-redirects fixture (crawler v3 WP12): redirects that live in the
 * page body, not the protocol. redirects.fixture.test (render http) has a
 * meta-refresh redirector whose target carries the planted image (the
 * redirector's own decoy image must never be fetched), an off-scope meta
 * refresh (away.test is never contacted, robots.txt included), an 11-second
 * refresh that is page content instead (its own image is found), a
 * self-refresh loop bounded by the shared redirect-hop budget, and a
 * robots-disallowed refresh target. stub.fixture.test (render auto) carries
 * a location.replace() stub — under 2 KiB of visible text, one script, no
 * links, no images — whose target's image only a render can find, and a
 * small script-less page that must never be rendered. No host overlaps the
 * other fixtures' hosts.
 */
export const REDIR_HOST = `redirects.${SOURCE_DOMAIN}`;
export const STUB_HOST = `stub.${SOURCE_DOMAIN}`;
export const AWAY_HOST = "away.test";

export async function buildPageRedirectsFixture(): Promise<Fixture> {
  const site = await new FixtureSite().start();
  const o = (host: string) => site.origin(host);
  const R = REDIR_HOST;
  const U = STUB_HOST;

  const img = {
    metaTarget: await patternImage(170, 320, 240, "png"),
    slowOwn: await patternImage(171, 300, 300, "png"),
    stubTarget: await patternImage(172, 320, 240, "png"),
  };
  const hashOf = async (b: Buffer) => (await hashImage(b, { minSide: 1 })).hash;
  const planted = [
    { id: "fp-meta", key: "metaTarget", page: "/meta-refresh", path: "/img/meta-target.png" },
    { id: "fp-meta-slow", key: "slowOwn", page: "/meta-slow", path: "/img/slow-own.png" },
    { id: "fp-stub", key: "stubTarget", page: "/stub", path: "/img/stub-target.png" },
  ] as const;
  const fingerprints: Array<{ id: string; pdq: string; quality: number }> = [];
  const allHashes: string[] = [];
  for (const p of planted) {
    allHashes.push(await hashOf(img[p.key]));
    fingerprints.push({ id: p.id, pdq: allHashes[allHashes.length - 1]!, quality: 100 });
  }
  const pool: Pool = { version: "redirects-1", generatedAt: new Date().toISOString(), threshold: 31, fingerprints };
  const expected: Expected[] = planted.map((p) => ({
    fingerprintId: p.id,
    pagePath: p.page,
    imageHost: p.page === "/stub" ? U : R,
    imagePath: p.path,
  }));

  // ---- meta-refresh source (render http) ----
  site.route(R, "/robots.txt", sendBytes(Buffer.from("User-agent: *\nDisallow: /private/\n"), "text/plain"));
  site.route(
    R,
    "/",
    sendHtml(
      html(`
        <a href="/meta-refresh">meta refresh</a>
        <a href="/meta-offsite">off-scope meta refresh</a>
        <a href="/meta-slow">slow refresh</a>
        <a href="/meta-loop">refresh loop</a>
        <a href="/meta-robots">robots-disallowed target</a>
      `),
    ),
  );
  // The redirector: its own image is discarded like an HTTP redirect's page.
  site.route(
    R,
    "/meta-refresh",
    sendHtml(html(`<img src="/img/redirector-decoy.png">`, `<meta http-equiv="refresh" content="0; url=/refreshed">`)),
  );
  site.route(R, "/refreshed", sendHtml(html(`<img src="/img/meta-target.png"><a href="/refreshed-child">child</a>`)));
  site.route(R, "/refreshed-child", sendHtml(html(`<p>reached through the followed refresh's links</p>`)));
  site.route(R, "/img/meta-target.png", sendBytes(img.metaTarget, "image/png"));
  site.route(R, "/img/redirector-decoy.png", sendBytes(img.slowOwn, "image/png"));
  // Off-scope target: away.test must never be requested, not even robots.txt.
  site.route(
    R,
    "/meta-offsite",
    sendHtml(html(`<p>moving on&hellip;</p>`, `<meta http-equiv="refresh" content="2; url=${o(AWAY_HOST)}/page">`)),
  );
  site.route(AWAY_HOST, "/robots.txt", sendBytes(Buffer.from("User-agent: *\nAllow: /\n"), "text/plain"));
  site.route(AWAY_HOST, "/page", sendHtml(html(`<img src="/away.png">`)));
  // 11 seconds: too slow to be a redirect, so this page is content.
  site.route(
    R,
    "/meta-slow",
    sendHtml(html(`<img src="/img/slow-own.png">`, `<meta http-equiv="refresh" content="11; url=/never-refreshed">`)),
  );
  site.route(R, "/never-refreshed", sendHtml(html(`<img src="/img/meta-target.png">`)));
  // A self-refresh chain: only the shared redirect budget ends it.
  site.route(R, "/meta-loop", sendHtml(html(`<p>round and round</p>`, `<meta http-equiv="refresh" content="0; url=/meta-loop">`)));
  // The target is in scope but robots-disallowed: the page reports blocked.
  site.route(
    R,
    "/meta-robots",
    sendHtml(html(`<p>nothing to see</p>`, `<meta http-equiv="refresh" content="3; url=/private/target">`)),
  );
  site.route(R, "/private/target", sendHtml(html(`<img src="/img/meta-target.png">`)));
  site.route(R, "/img/slow-own.png", sendBytes(img.slowOwn, "image/png"));

  // ---- script-stub source (render auto) ----
  site.route(U, "/robots.txt", sendBytes(Buffer.from("User-agent: *\nAllow: /\n"), "text/plain"));
  site.route(U, "/", sendHtml(html(`<a href="/stub">js redirect stub</a><a href="/stub-plain">plain page</a>`)));
  // A location.replace stub: tiny, one script, no links, no images.
  site.route(U, "/stub", sendHtml(html(`<p>Loading&hellip;</p>`, `<script>location.replace("/stub-target");</script>`)));
  site.route(U, "/stub-target", sendHtml(html(`<img src="/img/stub-target.png"><a href="/stub-target-child">child</a>`)));
  site.route(U, "/stub-target-child", sendHtml(html(`<p>child of the stub's target</p>`)));
  site.route(U, "/img/stub-target.png", sendBytes(img.stubTarget, "image/png"));
  // Tiny and script-less: never rendered.
  site.route(U, "/stub-plain", sendHtml(html(`<p>a small page with no script</p>`)));

  return { site, pool, expected, allHashes };
}

/*
 * The permanent-failure fixture (crawler v3 WP13): fetch failures that can
 * never be fixed by retrying, and the temporary ones that keep today's
 * backoff. temp500.test answers its home page with a plain 500 — temporary,
 * but not in today's in-run retry set, so it is fetched once; temp502.test
 * answers 502 and reset.test breaks the connection mid-answer — both
 * retried in-run like today; rate429.test answers 429 with Retry-After: 0
 * (429/503 keep today's backoff). All of them report `error`, so the app
 * keeps the 1 h / 6 h / 24 h backoff. dead.test is never in the test
 * policy's DNS, so resolving it fails with ENOTFOUND: permanent, reported
 * `gone` on the first attempt. No host here overlaps the other fixtures'
 * hosts.
 */
export const TEMP500_HOST = "temp500.test";
export const TEMP502_HOST = "temp502.test";
export const RESET_HOST = "reset.test";
export const RATE429_HOST = "rate429.test";
/** Never resolvable in the test policy: a DNS name that does not exist. */
export const DEAD_HOST = "dead.test";
export const PERMANENT_FAILURE_HOSTS = [TEMP500_HOST, TEMP502_HOST, RESET_HOST, RATE429_HOST];

export async function buildPermanentFailuresFixture(): Promise<Fixture> {
  const site = await new FixtureSite().start();
  const robots = sendBytes(Buffer.from("User-agent: *\nAllow: /\n"), "text/plain");
  const statusPage = (status: number, body: string, extra: Record<string, string> = {}): Handler => (res) => {
    res.writeHead(status, { "content-type": "text/html; charset=utf-8", ...extra });
    res.end(body);
  };
  site.route(TEMP500_HOST, "/robots.txt", robots);
  site.route(TEMP500_HOST, "/", statusPage(500, "<html><body>server error</body></html>"));
  site.route(TEMP502_HOST, "/robots.txt", robots);
  site.route(TEMP502_HOST, "/", statusPage(502, "<html><body>bad gateway</body></html>"));
  site.route(RESET_HOST, "/robots.txt", robots);
  // The connection breaks after the headers: a reset, not a status.
  site.route(RESET_HOST, "/", (res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.write("<html><body>hal");
    res.destroy();
  });
  site.route(RATE429_HOST, "/robots.txt", robots);
  site.route(RATE429_HOST, "/", statusPage(429, "<html><body>slow down</body></html>", { "retry-after": "0" }));
  const pool: Pool = { version: "permfail-1", generatedAt: new Date().toISOString(), threshold: 31, fingerprints: [] };
  return { site, pool, expected: [], allHashes: [] };
}

/*
 * The soft-404 fixture (crawler v3 WP14). soft404.fixture.test answers every
 * unknown path with the same "not found" page over HTTP 200; its hub links
 * twelve missing paths, so the first five distinct URLs carrying that body
 * digest are processed normally and every further one is a soft-404: nothing
 * extracted, reported gone. The not-found page plants an in-pool image and
 * one link so the cut is observable (exactly one finding, exactly one row
 * under it, every gone report entry linkless). alike.fixture.test is the
 * negative: nine genuinely similar gallery pages — same layout, digits in
 * the body, a different word and image each — that must all be fetched,
 * extracted and reported fetched. No host overlaps the other fixtures' hosts.
 */
export const SOFT404_HOST = `soft404.${SOURCE_DOMAIN}`;
export const ALIKE_HOST = `alike.${SOURCE_DOMAIN}`;
export const SOFT404_MISSING = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliet", "kilo", "lima"];
export const ALIKE_GALLERIES = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india"];

export async function buildSoft404Fixture(): Promise<Fixture> {
  const site = await new FixtureSite().start();
  const N = SOFT404_HOST;
  const L = ALIKE_HOST;

  const img: Record<string, Buffer> = { soft404: await patternImage(250, 300, 300, "png") };
  for (const [i, w] of ALIKE_GALLERIES.entries()) img[w] = await patternImage(255 + i, 300, 300, "png");
  const hashOf = async (b: Buffer) => (await hashImage(b, { minSide: 1 })).hash;
  const allHashes: string[] = [];
  const fingerprints: Array<{ id: string; pdq: string; quality: number }> = [];
  const planted: Array<{ fp: string; key: string; page: string; path: string; host: string }> = [
    { fp: "fp-soft404", key: "soft404", page: "/missing/alpha", path: "/img/soft404.png", host: N },
    ...ALIKE_GALLERIES.map((w) => ({ fp: `fp-alike-${w}`, key: w, page: `/gallery/${w}`, path: `/img/gal-${w}.png`, host: L })),
  ];
  for (const p of planted) {
    const h = await hashOf(img[p.key]!);
    allHashes.push(h);
    fingerprints.push({ id: p.fp, pdq: h, quality: 100 });
  }
  const pool: Pool = { version: "soft404-1", generatedAt: new Date().toISOString(), threshold: 31, fingerprints };
  const expected: Expected[] = planted.map((p) => ({ fingerprintId: p.fp, pagePath: p.page, imageHost: p.host, imagePath: p.path }));

  // ---- the soft-404 site: every unknown path answers the same page ----
  const robots = sendBytes(Buffer.from("User-agent: *\nAllow: /\n"), "text/plain");
  site.route(N, "/robots.txt", robots);
  site.route(
    N,
    "/",
    sendHtml(html(SOFT404_MISSING.map((w) => `<a href="/missing/${w}">${w}</a>`).join(""))),
  );
  // Identical for every unknown path, digits included, HTTP 200: the fake
  // "not found" the crawler must learn to recognise within one run.
  const notFound = html(`
    <h1>Page not found</h1>
    <p>Sorry, the page you are looking for does not exist. Error code 404 was
       raised for this address in 2026.</p>
    <a href="/loop-deeper">back to the gallery</a>
    <img src="/img/soft404.png" width="300" height="300">
  `);
  site.routeAny(N, () => sendHtml(notFound));
  site.route(N, "/img/soft404.png", sendBytes(img.soft404!, "image/png"));

  // ---- the genuinely-similar galleries: same layout, different images ----
  site.route(L, "/robots.txt", robots);
  site.route(L, "/", sendHtml(html(ALIKE_GALLERIES.map((w) => `<a href="/gallery/${w}">${w}</a>`).join(""))));
  for (const [i, w] of ALIKE_GALLERIES.entries()) {
    site.route(
      L,
      `/gallery/${w}`,
      sendHtml(
        html(
          // Same layout and the same digits everywhere; only the word and
          // the image address differ — real gallery pages — so no two of
          // these bodies may share a digest.
          `<h1>Gallery ${w}</h1>
           <p>Photo ${i + 1} of ${ALIKE_GALLERIES.length}, published in 2026.</p>
           <img src="/img/gal-${w}.png" width="300" height="300">`,
        ),
      ),
    );
    site.route(L, `/img/gal-${w}.png`, sendBytes(img[w]!, "image/png"));
  }

  return { site, pool, expected, allHashes };
}

/*
 * Soft-404 exemptions (crawler v3 review fix for WP14). spa.fixture.test is
 * an app shell: every URL answers the same script-only HTML (no links, no
 * images), which must never be judged a soft-404. numeric.fixture.test is a
 * gallery whose pages differ only by a numeric id and image path, which
 * must never share a digest. Both hubs link more than the threshold's worth
 * of pages.
 */
export const SPA_HOST = `spa.${SOURCE_DOMAIN}`;
export const NUMERIC_HOST = `numeric.${SOURCE_DOMAIN}`;
export const SOFT404_EXEMPT_PAGES = 9;

export async function buildSoft404ExemptFixture(): Promise<Fixture> {
  const site = await new FixtureSite().start();
  const robots = sendBytes(Buffer.from("User-agent: *\nAllow: /\n"), "text/plain");
  const ids = Array.from({ length: SOFT404_EXEMPT_PAGES }, (_, i) => 1001 + i);

  site.route(SPA_HOST, "/robots.txt", robots);
  site.route(SPA_HOST, "/", sendHtml(html(ids.map((n) => `<a href="/app/${n}">${n}</a>`).join(""))));
  const shell = html(`<div id="root"></div><script src="/static/app.js"></script>`);
  site.routeAny(SPA_HOST, () => sendHtml(shell));

  const tile = await patternImage(260, 300, 300, "png");
  site.route(NUMERIC_HOST, "/robots.txt", robots);
  site.route(NUMERIC_HOST, "/", sendHtml(html(ids.map((n) => `<a href="/photo/${n}">${n}</a>`).join(""))));
  for (const n of ids) {
    site.route(NUMERIC_HOST, `/photo/${n}`, sendHtml(html(`<h1>Photo ${n}</h1><img src="/img/${n}.png" width="300" height="300">`)));
    site.route(NUMERIC_HOST, `/img/${n}.png`, sendBytes(tile, "image/png"));
  }
  const pool: Pool = { version: "soft404-exempt-1", generatedAt: new Date().toISOString(), threshold: 31, fingerprints: [] };
  return { site, pool, expected: [], allHashes: [] };
}

/*
 * The never-quiet page (crawler v3 review fix for WP15): poll.fixture.test's
 * home page polls /ping every 100 ms for as long as it is open, so the
 * network never goes quiet for 500 ms. Its one planted image must still be
 * hashed: the render has to stop waiting for quiet and finish before its
 * deadline.
 */
export const POLL_HOST = `poll.${SOURCE_DOMAIN}`;

export async function buildNeverQuietFixture(): Promise<Fixture> {
  const site = await new FixtureSite().start();
  const img = await patternImage(270, 300, 300, "png");
  const pdq = (await hashImage(img, { minSide: 1 })).hash;
  const pool: Pool = { version: "poll-1", generatedAt: new Date().toISOString(), threshold: 31, fingerprints: [{ id: "fp-poll", pdq, quality: 100 }] };
  site.route(POLL_HOST, "/robots.txt", sendBytes(Buffer.from("User-agent: *\nAllow: /\n"), "text/plain"));
  site.route(
    POLL_HOST,
    "/",
    sendHtml(
      html(`
        <img src="/img/poll.png" width="300" height="300">
        <script>
          setInterval(function () { fetch("/ping?t=" + Date.now()).catch(function () {}); }, 100);
        </script>
      `),
    ),
  );
  site.routeAny(POLL_HOST, (path) =>
    path.startsWith("/ping")
      ? sendBytes(Buffer.from("{}"), "application/json")
      : (res) => {
          res.writeHead(404, { "content-type": "text/plain" });
          res.end("not found");
        },
  );
  site.route(POLL_HOST, "/img/poll.png", sendBytes(img, "image/png"));
  return {
    site,
    pool,
    expected: [{ fingerprintId: "fp-poll", pagePath: "/", imageHost: POLL_HOST, imagePath: "/img/poll.png" }],
    allHashes: [pdq],
  };
}

/*
 * The video-pool fixture (video-fingerprints spec WP20). vpdq.fixture.test
 * serves one page with a poster image and a decoy; the pool holds the
 * poster's hash both as an image entry and as a frame of two video
 * fingerprints (one exact, one near-duplicate), plus far frames that match
 * nothing. The poster must produce three findings — the image entry, and one
 * per video, each at its own best frame distance — and the decoy none.
 * Synthetic images only; no host overlaps the other fixtures' hosts.
 */
export const VPDQ_HOST = `vpdq.${SOURCE_DOMAIN}`;

export async function buildVideoPoolFixture(): Promise<Fixture> {
  const site = await new FixtureSite().start();
  const poster = await patternImage(300, 320, 240, "png");
  const decoy = await patternImage(301, 320, 240, "png");
  const posterHash = (await hashImage(poster, { minSide: 1 })).hash;
  const decoyHash = (await hashImage(decoy, { minSide: 1 })).hash;
  // Far frames of the two videos: real hashes of images the site never serves.
  const far1 = (await hashImage(await patternImage(302, 300, 300, "png"), { minSide: 1 })).hash;
  const far2 = (await hashImage(await patternImage(303, 300, 300, "png"), { minSide: 1 })).hash;
  const NEAR = 6;
  const nearPoster = flipBits(posterHash, NEAR);

  const pool: Pool = {
    version: "vpdq-1",
    generatedAt: new Date().toISOString(),
    threshold: 31,
    fingerprints: [
      // The poster is also planted as an ordinary image fingerprint: one
      // image, three findings, two kinds.
      { id: "fp-poster-img", pdq: posterHash, quality: 100 },
      // Video A carries the poster's exact hash as one of its frames.
      { id: "fp-vid-a", kind: "video", frames: [far1, posterHash, far2] },
      // Video B only near-misses it: its best frame distance is NEAR.
      { id: "fp-vid-b", kind: "video", frames: [nearPoster, far2] },
      // A video with no frame near anything on the page.
      { id: "fp-vid-c", kind: "video", frames: [far1, far2] },
    ],
  };
  const expected: Expected[] = [
    { fingerprintId: "fp-poster-img", pagePath: "/", imageHost: VPDQ_HOST, imagePath: "/img/poster.png" },
    { fingerprintId: "fp-vid-a", pagePath: "/", imageHost: VPDQ_HOST, imagePath: "/img/poster.png" },
    { fingerprintId: "fp-vid-b", pagePath: "/", imageHost: VPDQ_HOST, imagePath: "/img/poster.png" },
  ];

  site.route(VPDQ_HOST, "/robots.txt", sendBytes(Buffer.from("User-agent: *\nAllow: /\n"), "text/plain"));
  site.route(
    VPDQ_HOST,
    "/",
    sendHtml(
      html(`
      <h1>Sample clip</h1>
      <video poster="/img/poster.png" src="/clip.webm"></video>
      <img src="/img/decoy.png" width="320" height="240">
    `),
    ),
  );
  site.route(VPDQ_HOST, "/img/poster.png", sendBytes(poster, "image/png"));
  site.route(VPDQ_HOST, "/img/decoy.png", sendBytes(decoy, "image/png"));
  // Every hash the run touches, for the log scan: the two images it hashes
  // and every frame the pool carries.
  return { site, pool, expected, allHashes: [posterHash, decoyHash, far1, far2, nearPoster] };
}

/**
 * The video-previews fixture (video-fingerprints spec WP21): one page that
 * offers every preview kind — a <video poster>, an og:image on a page that
 * declares an og:video, a JSON-LD VideoObject thumbnailUrl, a preview
 * sprite sheet (3x2 grid of 160x90 tiles) and a decoy — plus a video
 * sitemap whose <video:thumbnail_loc> is hashed for its own page, and a
 * grid image whose address names no sprite: hashed whole, never split.
 * Every planted finding comes from a different preview kind, so the run
 * proves each one end to end. Synthetic images only; the host overlaps no
 * other fixture's.
 */
export const PREV_HOST = "prev.fixture.test";

export async function buildVideoPreviewFixture(): Promise<Fixture> {
  const site = await new FixtureSite().start();
  const hashOf = async (b: Buffer) => (await hashImage(b, { minSide: 64 })).hash;
  const poster = await patternImage(600, 320, 240, "png");
  const ogPreview = await patternImage(601, 320, 180, "png");
  const jsonldThumb = await patternImage(602, 300, 200, "png");
  const sitemapThumb = await patternImage(603, 320, 180, "png");
  const decoy = await patternImage(630, 320, 240, "png");
  // The sprite sheet: six 160x90 tiles (seeds 610..615) in a 3x2 grid. The
  // grid 480x180 admits exactly one 16:9 reading (3x2), so the child cuts
  // the true tiles and the standalone hashes below are the tile hashes.
  const spriteSeeds = [610, 611, 612, 613, 614, 615];
  const sprite = await spriteSheet(spriteSeeds, 160, 90, 3, 2);
  const tileHashes: string[] = [];
  for (const s of spriteSeeds) tileHashes.push(await hashOf(await patternImage(s, 160, 90, "png")));
  // The same grid geometry under a name that is no sprite: hashed whole,
  // never split — its first tile is a pool frame the run must NOT match.
  const gridSeeds = [620, 621, 622, 623, 624, 625];
  const contactSheet = await spriteSheet(gridSeeds, 160, 90, 3, 2);
  const negTileHash = await hashOf(await patternImage(gridSeeds[0]!, 160, 90, "png"));
  const contactSheetHash = await hashOf(contactSheet);

  const posterHash = await hashOf(poster);
  const ogHash = await hashOf(ogPreview);
  const jsonldHash = await hashOf(jsonldThumb);
  const sitemapThumbHash = await hashOf(sitemapThumb);
  const decoyHash = await hashOf(decoy);

  const pool: Pool = {
    version: "prev-1",
    generatedAt: new Date().toISOString(),
    threshold: 31,
    fingerprints: [
      // The poster is also an ordinary image fingerprint: one preview,
      // two findings, both kinds (the WP21 rule: previews are compared
      // with video frames AND image fingerprints).
      { id: "fp-img-poster", pdq: posterHash, quality: 100 },
      { id: "fp-vid-poster", kind: "video", frames: [posterHash] },
      { id: "fp-vid-og", kind: "video", frames: [ogHash] },
      { id: "fp-vid-jsonld", kind: "video", frames: [jsonldHash] },
      // Two tiles of one sprite are frames of one video: two video hits,
      // one finding (deduplicated per fingerprint and image address).
      { id: "fp-vid-sprite", kind: "video", frames: [tileHashes[0]!, tileHashes[1]!] },
      { id: "fp-vid-sitemap", kind: "video", frames: [sitemapThumbHash] },
      // The frame that only a wrongly split contact sheet could match.
      { id: "fp-vid-neg", kind: "video", frames: [negTileHash] },
    ],
  };
  const expected: Expected[] = [
    { fingerprintId: "fp-img-poster", pagePath: "/watch.html", imageHost: PREV_HOST, imagePath: "/img/poster.png" },
    { fingerprintId: "fp-vid-poster", pagePath: "/watch.html", imageHost: PREV_HOST, imagePath: "/img/poster.png" },
    { fingerprintId: "fp-vid-og", pagePath: "/watch.html", imageHost: PREV_HOST, imagePath: "/img/og-preview.png" },
    { fingerprintId: "fp-vid-jsonld", pagePath: "/watch.html", imageHost: PREV_HOST, imagePath: "/img/jsonld-thumb.png" },
    { fingerprintId: "fp-vid-sprite", pagePath: "/watch.html", imageHost: PREV_HOST, imagePath: "/img/sprite.png" },
    { fingerprintId: "fp-vid-sitemap", pagePath: "/mapped.html", imageHost: PREV_HOST, imagePath: "/img/sitemap-thumb.png" },
  ];

  site.route(
    PREV_HOST,
    "/robots.txt",
    sendBytes(Buffer.from(`User-agent: *\nAllow: /\nSitemap: ${site.origin(PREV_HOST)}/video-sitemap.xml\n`), "text/plain"),
  );
  site.route(
    PREV_HOST,
    "/",
    sendHtml(
      html(`
      <h1>Preview gallery</h1>
      <a href="/watch.html">the clip</a>
      <img src="/img/contact-sheet.png" width="480" height="180" alt="contact sheet">
    `),
    ),
  );
  site.route(
    PREV_HOST,
    "/watch.html",
    sendHtml(
      html(
        `
      <h1>Clip page</h1>
      <video poster="/img/poster.png" src="/clip.webm"></video>
      <img src="/img/sprite.png" width="480" height="180" alt="sprite">
      <img src="/img/decoy.png" width="320" height="240" alt="decoy">
    `,
        `
      <meta property="og:video" content="/clip.mp4">
      <meta property="og:image" content="/img/og-preview.png">
      <script type="application/ld+json">{"@type":"VideoObject","name":"clip","thumbnailUrl":"/img/jsonld-thumb.png"}</script>
    `,
      ),
    ),
  );
  site.route(PREV_HOST, "/mapped.html", sendHtml(html(`<h1>Mapped clip</h1>`)));
  site.route(
    PREV_HOST,
    "/video-sitemap.xml",
    sendBytes(
      Buffer.from(
        `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.0">
  <url>
    <loc>${site.origin(PREV_HOST)}/mapped.html</loc>
    <video:video>
      <video:thumbnail_loc>${site.origin(PREV_HOST)}/img/sitemap-thumb.png</video:thumbnail_loc>
    </video:video>
  </url>
</urlset>`,
      ),
      "application/xml",
    ),
  );
  site.route(PREV_HOST, "/img/poster.png", sendBytes(poster, "image/png"));
  site.route(PREV_HOST, "/img/og-preview.png", sendBytes(ogPreview, "image/png"));
  site.route(PREV_HOST, "/img/jsonld-thumb.png", sendBytes(jsonldThumb, "image/png"));
  site.route(PREV_HOST, "/img/sitemap-thumb.png", sendBytes(sitemapThumb, "image/png"));
  site.route(PREV_HOST, "/img/sprite.png", sendBytes(sprite, "image/png"));
  site.route(PREV_HOST, "/img/contact-sheet.png", sendBytes(contactSheet, "image/png"));
  site.route(PREV_HOST, "/img/decoy.png", sendBytes(decoy, "image/png"));
  // Every hash the run touches or the pool carries, for the log scan: the
  // pool's frames and previews, the six sprite tile hashes the child cuts,
  // and the whole-image hashes of the decoy and the unsplit contact sheet.
  return {
    site,
    pool,
    expected,
    allHashes: [
      posterHash,
      ogHash,
      jsonldHash,
      sitemapThumbHash,
      ...tileHashes,
      negTileHash,
      decoyHash,
      contactSheetHash,
    ],
  };
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
    // WP25: the check container runs the suite as root, where Chromium's
    // own sandbox can never start (Chromium refuses root without
    // --no-sandbox), and the browser integration tests below exercise
    // rendering behaviour, not the sandbox decision. The dedicated
    // browser-sandbox tests set "false" for the fail-closed paths and the
    // docker verification script (scripts/docker-sandbox-check.sh) pins
    // both branches against real containers.
    CRAWLER_ALLOW_UNSANDBOXED_BROWSER: "true",
    ...extra,
  };
}

export const TEST_KEY = "test-service-key-0123456789-abcdefghij";

/*
 * The SSCD second-layer fixture (WP28). sscd.fixture.test serves three
 * pages: a confirmed copy of the survivor's image (an exact PDQ match that
 * seeds an embedding), an altered version of it (a crop plus a colour
 * filter plus a JPEG re-encode — the transformations PDQ does not survive)
 * and an unrelated decoy. The pool holds the confirmed copy's fingerprint
 * twice — exactly and at distance 27 (the borderline band, so the analyst
 * score path runs) — each entry carrying the fake embedder's descriptor of
 * the confirmed copy, exactly as the app would serve a stored embedding.
 *
 * The real SSCD model is never loaded here: the crawl runs with a
 * deterministic in-process stand-in for the isolated child
 * (fakeSscdEmbed, tests/support/synthetic.ts) whose descriptor is chosen
 * to survive the planted alteration by construction. The model's own
 * tolerance for crops and filters is what scripts/eval-sscd.ts measures.
 * Synthetic images only; no host overlaps the other fixtures' hosts.
 */
export const SSCD_HOST = "sscd.fixture.test";

/** The SSCD fixture plus the numbers that pin its honest premise. */
export type SscdFixture = Fixture & {
  /** PDQ distance of the altered variant from the confirmed copy: above the pool threshold. */
  variantPdqDistance: number;
  /** The fake descriptor's cosine for the altered variant: above the test threshold. */
  variantSimilarity: number;
  /** The fake descriptor's cosine for the decoy: below everything. */
  decoySimilarity: number;
};

export async function buildSscdFixture(): Promise<SscdFixture> {
  const site = await new FixtureSite().start();
  const confirmed = await patternImage(4001, 640, 480, "png");
  // ~13% crop (16% of the area) plus a colour filter and a JPEG re-encode:
  // enough that PDQ cannot see the copy (verified by the test's own
  // distance check), mild enough that a coarse descriptor still can.
  const variant = await sharp(confirmed)
    .extract({ left: 42, top: 32, width: 556, height: 416 })
    .modulate({ saturation: 0.55, brightness: 1.08 })
    .blur(0.7)
    .jpeg({ quality: 72 })
    .toBuffer();
  const decoy = await patternImage(4002, 640, 480, "png");
  const confirmedHash = (await hashImage(confirmed, { minSide: 1 })).hash;
  const variantHash = (await hashImage(variant, { minSide: 1 })).hash;
  const borderHash = flipBits(confirmedHash, 27);
  const vector = await fakeSscdEmbed(confirmed);
  const variantVector = await fakeSscdEmbed(variant);
  const decoyVector = await fakeSscdEmbed(decoy);
  const cos = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i]!, 0);
  // What the fixture itself claims, so the test can pin the honest premise:
  // PDQ cannot see the altered copy, the coarse descriptor can, and the
  // decoy matches nothing.
  const variantPdqDistance = hamming(confirmedHash, variantHash);
  const variantSimilarity = cos(vector, variantVector);
  const decoySimilarity = cos(vector, decoyVector);

  const pool: Pool = {
    version: "sscd-1",
    generatedAt: new Date().toISOString(),
    threshold: 31,
    fingerprints: [
      // The confirmed copy, with the embedding the app would serve for it.
      { id: "fp-sscd", pdq: confirmedHash, quality: 100, sscd: { model: "sscd_disc_mixup", version: "onnx-1", vectors: [vector] } },
      // The same image at PDQ distance 27 (the borderline band), with the
      // same embedding: a borderline match must carry the analyst score.
      { id: "fp-border", pdq: borderHash, quality: 100, sscd: { model: "sscd_disc_mixup", version: "onnx-1", vectors: [vector] } },
    ],
  };
  const expected: Expected[] = [
    { fingerprintId: "fp-sscd", pagePath: "/confirmed.html", imageHost: SSCD_HOST, imagePath: "/img/confirmed.png" },
    { fingerprintId: "fp-border", pagePath: "/confirmed.html", imageHost: SSCD_HOST, imagePath: "/img/confirmed.png" },
    { fingerprintId: "fp-sscd", pagePath: "/altered.html", imageHost: SSCD_HOST, imagePath: "/img/variant.png" },
    { fingerprintId: "fp-border", pagePath: "/altered.html", imageHost: SSCD_HOST, imagePath: "/img/variant.png" },
  ];

  site.route(SSCD_HOST, "/robots.txt", sendBytes(Buffer.from("User-agent: *\nAllow: /\n"), "text/plain"));
  site.route(
    SSCD_HOST,
    "/",
    sendHtml(
      html(`
      <h1>Gallery</h1>
      <a href="/confirmed.html">confirmed</a>
      <a href="/altered.html">altered</a>
      <a href="/decoy.html">decoy</a>
    `),
    ),
  );
  site.route(SSCD_HOST, "/confirmed.html", sendHtml(html(`<img src="/img/confirmed.png" width="640" height="480">`)));
  site.route(SSCD_HOST, "/altered.html", sendHtml(html(`<img src="/img/variant.png" width="640" height="480">`)));
  site.route(SSCD_HOST, "/decoy.html", sendHtml(html(`<img src="/img/decoy.png" width="640" height="480">`)));
  site.route(SSCD_HOST, "/img/confirmed.png", sendBytes(confirmed, "image/png"));
  site.route(SSCD_HOST, "/img/variant.png", sendBytes(variant, "image/jpeg"));
  site.route(SSCD_HOST, "/img/decoy.png", sendBytes(decoy, "image/png"));

  return { site, pool, expected, allHashes: [confirmedHash, borderHash], variantPdqDistance, variantSimilarity, decoySimilarity };
}

/** Hamming distance of two 64-hex PDQ hashes (the matcher's own packing). */
function hamming(a: string, b: string): number {
  const wa = new Uint32Array(8);
  const wb = new Uint32Array(8);
  packHex(a, wa, 0);
  packHex(b, wb, 0);
  let d = 0;
  for (let i = 0; i < 8; i++) d += popcount32(wa[i]! ^ wb[i]!);
  return d;
}
