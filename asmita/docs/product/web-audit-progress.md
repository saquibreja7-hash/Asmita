# Web audit progress

Owner-approved web best-practice audit (20 November 2026, Saquib). One section
per work package, appended by the lane that delivered it. Line numbers refer to
master 92d8e82 and may have moved.

## WP45 — page-load speed on slow phones (branch perf/lcp-fonts)

Delivered: P3, P4, P5, P8.

### What changed

- P3 — footer grain. `.site-footer::after` (globals.css) now tiles
  `public/images/textures/grain.svg`, a 1 KB procedural `feTurbulence` tile,
  instead of the 480 KB `grain-big.jpg` (~469 KB fewer bytes on every page).
  The tile keeps the same CSS (`center / 700px auto repeat`, `opacity: 0.5`,
  `mix-blend-mode: soft-light`) and was tuned to the JPEG's measured
  statistics at its 700 px display size (luma mean 193.1 vs 193.8, std 9.15
  vs 9.16); the composited result over parchment differs by 0.23/255 mean
  (3/255 max) per pixel, measured in Chromium — visually the same grain.
  `baseFrequency` is 0.4 on purpose: values at or above 1.0 rasterize flat
  in Chrome (checked in 156). `grain-big.jpg` is deleted; a repo-wide grep
  found no other reference. The CSP `img-src 'self'` already covers the
  same-origin tile; no CSP change was needed.
- P4 — hero priority. `Illustration` sets `fetchPriority="high"` when
  `eager` (React 19 also emits a matching `<link rel="preload" as="image">`).
  Checked every page that passes `eager`: each passes it exactly once except
  the home page, which passed it twice (hero `Illustration` and
  `SupporterLogos`). The supporters strip is far below the fold, so its
  `eager` is removed; the hero stays the page's single eager image. A test
  now scans every `page.tsx` and fails if any page passes `eager` twice.
- P5 — Devanagari shift. `font-size-adjust: from-font` on `body`
  (globals.css) keeps the fallback font's metrics matched to Noto Sans
  Devanagari while the webfont loads; ignored by older browsers. The layout
  now preloads the regular-weight Devanagari woff2 on Hindi pages only
  (cookie `asmita_lang=hi`), with `crossorigin="anonymous"` so the CSS font
  fetch can reuse the preload. The URL comes from importing the same
  `@fontsource` woff2 the `@font-face` uses, so both references hash to one
  build asset. Not done: consolidating the three Devanagari weights into one
  variable font. That needs a different package
  (`@fontsource-variable/noto-sans-devanagari`, new dependency + lockfile)
  with a different family name, so it is not the "small change" the audit
  allowed; the three static weights stay. Nothing user-facing to translate:
  this WP adds no visible strings, so en.json/hi.json are unchanged.
- P8 — sticky header. `backdrop-filter: blur(12px)` removed from
  `.site-header`; the background is now solid `var(--color-parchment)`
  (#f6f3f1 — the same colour the translucent paint sampled), keeping the
  header's look without the per-scroll-frame reraster.

Tests added (vitest): `tests/unit/page-load-weight.test.ts` (grain tile +
JPEG gone + soft-light/opacity kept + feTurbulence tile, body
`font-size-adjust`, header without blur, no page passes `eager` twice),
`tests/unit/illustration-fetch-priority.test.ts`,
`tests/unit/devanagari-font-preload.test.ts` (hi preload with crossorigin,
en none). No Playwright spec was required for this WP.

### Not verified here

- This machine ran lint, type-check, vitest and both builds (`npm run build`
  and, additionally, `npm run build:vinext`). Playwright, the Postgres e2e
  and the worker smoke (`scripts/worker-smoke.mjs`) run later on another
  machine and were NOT run here.
- The preload was verified on the Node production build (`next build` +
  `next start`): the Hindi page emits the preload link, and the woff2 request
  arrives with initiatorType "link" while the English page fetches no
  Devanagari file at all. The vinext Worker build compiles and its CSS and
  worker entry reference the same hashed woff2, but the runtime worker smoke
  still runs elsewhere.
- The grain tile's look was verified numerically in desktop Chromium
  (Windows, Chrome 156) only — not on Android Chrome, and not in Safari/Firefox.
- Operational note for later lanes: `npm run build:vinext` overwrites the
  gitignored `.next/types` with its own generated route validator, which
  `tsc --noEmit` then rejects. This is a tool quirk, not a code error;
  re-running `npm run build` (Next) regenerates compatible types, and the
  final check run here passed after doing exactly that.
- No user-facing sentence needs the owner's approval; no visible copy changed.

### Decisions made on my own

- Kept the footer grain's light-gray bias (luma mean ~194) rather than
  neutral mid-gray: the soft-light blend over parchment reads the same as
  before, which the audit's "same soft-light look" asked for.
- Left the second Devanagari preload (600 weight) out: body text (400) is
  the LCP-relevant mass; headings are few, and the audit named only the
  regular weight.
- The supporters strip `eager` removal (home page) is a loading-behaviour
  change only; the logos still render, now lazily like on /about.
