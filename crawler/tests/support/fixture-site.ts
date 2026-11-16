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

  async start(): Promise<this> {
    this.server = createServer((req, res) => {
      const host = (req.headers.host ?? "").replace(/:\d+$/, "");
      const path = req.url ?? "/";
      this.requests.push({ host, path, headers: req.headers });
      const h = this.routes.get(`${host}${path}`);
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

  return { site, pool, expected, allHashes: Object.values(h) };
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
