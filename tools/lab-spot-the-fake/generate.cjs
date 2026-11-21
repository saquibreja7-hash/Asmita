/*
 * WP95 (asmita/docs/lab/beta-spec.md): generates the placeholder image set
 * for the "Spot the fake" quiz, /lab/spot-the-fake.
 *
 * Every image is a synthetic flat vector scene drawn from the inline SVG
 * below — no photograph, no real person, no third-party rights, nothing a
 * survivor made. The set is a PLACEHOLDER: the owner must replace it with a
 * curated photographic set (each entry's "source" field in quiz.json is
 * where the licence of a replacement gets recorded).
 *
 * The "AI-made" rounds each carry one real, findable tell a visitor can
 * genuinely spot — garbled sign text, an extra finger, a shadow that
 * disagrees with the light, warped background lines, mismatched earrings,
 * waxy skin — so the quiz teaches honestly even before real photos arrive.
 *
 * Output: asmita/public/lab/spot-the-fake/*.webp (each under 150 KB) and the
 * manifest asmita/public/lab/spot-the-fake/quiz.json (file, answer, scene
 * and tell in en and hi, source/licence) — exactly the manifest the spec
 * requires, validated on the app side by src/lib/lab/spot-the-fake/quiz.ts
 * and tests/unit/lab-spot-the-fake.test.ts.
 *
 * Run from this folder after `npm install` (sharp):
 *   npm run generate
 * On a machine with asmita/node_modules already installed, sharp can be
 * borrowed from there without a separate install:
 *   NODE_PATH=../../asmita/node_modules node generate.cjs
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const OUT_DIR = path.join(__dirname, "..", "..", "asmita", "public", "lab", "spot-the-fake");
const WIDTH = 960;
const HEIGHT = 600;
const MAX_BYTES = 150 * 1024; // the spec's per-image cap

/* ---------------------------------------------------------------- scenes */

const FONT = "Verdana, 'DejaVu Sans', 'Noto Sans', sans-serif";

const svgDoc = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">${body}</svg>`;

const sign = (x, y, w, text, { size = 34 } = {}) => `
  <rect x="${x}" y="${y}" width="${w}" height="56" rx="8" fill="#fdfaf4" stroke="#3a3a3a" stroke-width="3"/>
  <text x="${x + w / 2}" y="${y + 40}" text-anchor="middle" font-family="${FONT}" font-size="${size}" font-weight="bold" letter-spacing="4" fill="#26221f">${text}</text>`;

const awning = (x, y, w, color) => {
  let stripes = "";
  for (let i = 0; i < w / 24; i++) {
    stripes += `<rect x="${x + i * 24}" y="${y}" width="24" height="26" fill="${i % 2 === 0 ? color : "#f6f1e7"}"/>`;
  }
  return `<g>${stripes}<rect x="${x}" y="${y}" width="${w}" height="26" fill="none" stroke="#3a3a3a" stroke-width="2"/></g>`;
};

const shopWindow = (x, y, w, h, display) => `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#cfe3ec" stroke="#3a3a3a" stroke-width="3"/>
  <line x1="${x + w / 2}" y1="${y}" x2="${x + w / 2}" y2="${y + h}" stroke="#3a3a3a" stroke-width="3"/>
  ${display}`;

// A small street: two shopfronts with signs, a pharmacy, sky, road, lamp.
const street = ({ bakery, tea, pharmacy }) => svgDoc(`
  <rect width="960" height="600" fill="#b9dced"/>
  <circle cx="850" cy="80" r="42" fill="#fdf0b8"/>
  <ellipse cx="180" cy="80" rx="70" ry="18" fill="#ffffff" opacity="0.85"/>
  <ellipse cx="240" cy="95" rx="52" ry="14" fill="#ffffff" opacity="0.7"/>
  <rect x="0" y="120" width="960" height="260" fill="#a7c6d8"/>
  <rect x="60" y="150" width="120" height="230" fill="#93b3c6"/>
  <rect x="760" y="170" width="130" height="210" fill="#93b3c6"/>
  <!-- shopfront 1: bakery -->
  <rect x="40" y="250" width="290" height="180" fill="#ead9bf" stroke="#3a3a3a" stroke-width="3"/>
  ${sign(80, 200, 210, bakery)}
  ${awning(52, 260, 266, "#c96f4a")}
  ${shopWindow(70, 300, 100, 100, `<rect x="85" y="360" width="70" height="34" rx="6" fill="#d9a45b"/>`)}
  <rect x="210" y="310" width="86" height="120" rx="4" fill="#7a5a3a" stroke="#3a3a3a" stroke-width="3"/>
  <circle cx="253" cy="372" r="5" fill="#e8cf8d"/>
  <!-- shopfront 2: tea -->
  <rect x="380" y="250" width="280" height="180" fill="#dcc7a6" stroke="#3a3a3a" stroke-width="3"/>
  ${sign(430, 200, 180, tea)}
  ${awning(392, 260, 256, "#2f7d74")}
  ${shopWindow(400, 300, 110, 100, `<circle cx="455" cy="365" r="26" fill="#8a5a3b"/><rect x="440" y="330" width="30" height="10" rx="4" fill="#f6f1e7"/>`)}
  <rect x="550" y="310" width="80" height="110" rx="4" fill="#5d4a35" stroke="#3a3a3a" stroke-width="3"/>
  <!-- pharmacy -->
  <rect x="700" y="250" width="240" height="180" fill="#cfdcc9" stroke="#3a3a3a" stroke-width="3"/>
  ${sign(730, 200, 180, pharmacy, { size: 26 })}
  ${shopWindow(720, 300, 90, 100, `<rect x="752" y="338" width="26" height="26" fill="#2f8f4e"/><rect x="760" y="330" width="10" height="42" fill="#2f8f4e"/>`)}
  <rect x="840" y="310" width="70" height="120" rx="4" fill="#4f6f57" stroke="#3a3a3a" stroke-width="3"/>
  <!-- pavement, road, lamp -->
  <rect x="0" y="430" width="960" height="34" fill="#d8d3c8"/>
  <rect x="0" y="464" width="960" height="136" fill="#9aa0a6"/>
  <line x1="0" y1="530" x2="960" y2="530" stroke="#f6f1e7" stroke-width="6" stroke-dasharray="40 30"/>
  <rect x="348" y="330" width="10" height="100" fill="#3a3a3a"/>
  <path d="M353 336 L318 348" stroke="#3a3a3a" stroke-width="8" fill="none"/>
  <circle cx="314" cy="350" r="14" fill="#f6f1e7" stroke="#3a3a3a" stroke-width="3"/>
`);

const handSkin = { fill: "#d09a6a", line: "#8a5a38" };

// A hand holding a paper cup, seen from the front. fingerCount is 4 (five
// with the thumb, a hand you can count) or 5 (six — the extra-finger tell).
const handHoldingCup = ({ fingerCount }) => {
  const cupX = 480;
  const fingerW = 36;
  const gap = 10;
  const span = fingerCount * fingerW + (fingerCount - 1) * gap;
  let fingers = "";
  const heights = [212, 196, 202, 218, 208]; // natural, uneven finger tips
  for (let i = 0; i < fingerCount; i++) {
    const x = cupX - span / 2 + i * (fingerW + gap);
    const top = heights[i % heights.length];
    fingers += `<rect x="${x}" y="${top}" width="${fingerW}" height="${410 - top}" rx="17" fill="${handSkin.fill}" stroke="${handSkin.line}" stroke-width="3"/>`;
  }
  return svgDoc(`
    <rect width="960" height="600" fill="#f2e6d3"/>
    <circle cx="480" cy="310" r="240" fill="#ead9bf"/>
    <rect x="0" y="470" width="960" height="130" fill="#b98b5c"/>
    <rect x="0" y="470" width="960" height="14" fill="#96683f"/>
    <ellipse cx="480" cy="486" rx="150" ry="20" fill="#00000022"/>
    <!-- sleeve and wrist -->
    <rect x="405" y="430" width="150" height="170" rx="26" fill="#31536b"/>
    <rect x="417" y="440" width="126" height="150" rx="24" fill="${handSkin.fill}" stroke="${handSkin.line}" stroke-width="3"/>
    <!-- palm behind the cup -->
    <ellipse cx="${cupX}" cy="430" rx="138" ry="86" fill="${handSkin.fill}" stroke="${handSkin.line}" stroke-width="3"/>
    <!-- paper cup -->
    <path d="M374 244 L586 244 L556 428 L404 428 Z" fill="#f8f4ec" stroke="#3a3a3a" stroke-width="4"/>
    <path d="M381 306 L579 306 L572 340 L388 340 Z" fill="#b0552f"/>
    <rect x="366" y="232" width="228" height="20" rx="10" fill="#e6ddcc" stroke="#3a3a3a" stroke-width="3"/>
    <!-- fingers gripping the front -->
    ${fingers}
    <!-- thumb on the near side -->
    <rect x="342" y="296" width="88" height="38" rx="18" fill="${handSkin.fill}" stroke="${handSkin.line}" stroke-width="3"/>
  `);
};

// Fruit on a table beside a window. consistentShadows=true: every shadow
// falls away from the window light (right). false: the apple's shadow
// contradicts the light and falls towards the window (left).
const fruitStillLife = ({ consistentShadows }) => svgDoc(`
  <rect width="960" height="600" fill="#efe7d8"/>
  <rect x="0" y="440" width="960" height="160" fill="#a97c4f"/>
  <rect x="0" y="440" width="960" height="16" fill="#8a6238"/>
  <!-- the window: the one light source, on the left -->
  <rect x="70" y="70" width="190" height="270" fill="#bfe3f2" stroke="#6b5a44" stroke-width="10"/>
  <line x1="165" y1="70" x2="165" y2="340" stroke="#6b5a44" stroke-width="8"/>
  <line x1="70" y1="205" x2="260" y2="205" stroke="#6b5a44" stroke-width="8"/>
  <polygon points="260,120 520,300 520,440 260,440" fill="#fdf3cf" opacity="0.55"/>
  <polygon points="260,205 460,320 460,440 260,440" fill="#fdf3cf" opacity="0.45"/>
  <!-- fruit -->
  <ellipse cx="${consistentShadows ? 560 : 440}" cy="468" rx="76" ry="18" fill="#00000026"/>
  <circle cx="500" cy="402" r="58" fill="#c0392b" stroke="#7d1f14" stroke-width="4"/>
  <ellipse cx="482" cy="382" rx="16" ry="10" fill="#ffffff" opacity="0.5"/>
  <ellipse cx="730" cy="466" rx="70" ry="16" fill="#00000026"/>
  <path d="M640 416 Q700 366 790 400 Q730 442 640 416 Z" fill="#f1c40f" stroke="#a6850b" stroke-width="4"/>
  <ellipse cx="430" cy="462" rx="58" ry="14" fill="#00000026"/>
  <circle cx="400" cy="410" r="48" fill="#e67e22" stroke="#935116" stroke-width="4"/>
  <circle cx="384" cy="394" r="12" fill="#ffffff" opacity="0.45"/>
  <rect x="620" y="330" width="170" height="14" rx="7" fill="#7a5a3a" opacity="0.9"/>
  <path d="M640 337 L640 404" stroke="#7a5a3a" stroke-width="8"/>
  <path d="M770 337 L770 404" stroke="#7a5a3a" stroke-width="8"/>
  <rect x="628" y="296" width="150" height="40" rx="12" fill="#9aa0a6" opacity="0.9"/>
  <path d="M700 316 L672 296" stroke="#6b7280" stroke-width="8"/>
`);

// A sitting room. warped=false: shelves, door frame and picture frame run
// straight. warped=true: the same lines bow and bend (background warping).
const room = ({ warped }) => {
  const shelf = (y, sag) =>
    warped
      ? `<path d="M96 ${y} Q256 ${y + sag} 416 ${y}" fill="none" stroke="#6b4f34" stroke-width="12"/>`
      : `<rect x="96" y="${y}" width="320" height="12" fill="#6b4f34"/>`;
  const doorSides = warped
    ? `<path d="M492 214 C486 340 498 470 488 544" fill="none" stroke="#8a6a44" stroke-width="14"/>
       <path d="M588 214 C596 340 584 470 596 544" fill="none" stroke="#8a6a44" stroke-width="14"/>`
    : `<rect x="486" y="214" width="14" height="330" fill="#8a6a44"/>
       <rect x="580" y="214" width="14" height="330" fill="#8a6a44"/>`;
  const doorTop = warped
    ? `<path d="M486 220 Q540 196 594 220" fill="none" stroke="#8a6a44" stroke-width="14"/>`
    : `<rect x="486" y="212" width="108" height="14" fill="#8a6a44"/>`;
  const frame = warped
    ? `<path d="M676 130 L798 118 L812 228 L690 244 Z" fill="#f4ede0" stroke="#6b4f34" stroke-width="6"/>
       <path d="M700 148 L778 140 L788 208 L712 218 Z" fill="#9fc4b8"/>`
    : `<rect x="680" y="126" width="122" height="104" fill="#f4ede0" stroke="#6b4f34" stroke-width="6"/>
       <rect x="702" y="146" width="78" height="64" fill="#9fc4b8"/>`;
  const boards = warped
    ? `<path d="M0 500 Q240 486 480 502 T960 494" fill="none" stroke="#a3814f" stroke-width="5"/>
       <path d="M0 540 Q240 552 480 538 T960 548" fill="none" stroke="#a3814f" stroke-width="5"/>`
    : `<line x1="0" y1="500" x2="960" y2="500" stroke="#a3814f" stroke-width="5"/>
       <line x1="0" y1="540" x2="960" y2="540" stroke="#a3814f" stroke-width="5"/>`;
  const books = (y) => `
    <rect x="116" y="${y}" width="20" height="74" fill="#b0552f"/>
    <rect x="142" y="${y}" width="24" height="74" fill="#2f7d74"/>
    <rect x="172" y="${y}" width="16" height="74" fill="#d9a45b"/>
    <rect x="196" y="${y}" width="26" height="74" fill="#31536b"/>
    <rect x="230" y="${y}" width="18" height="74" fill="#8a5a3b"/>
    <rect x="330" y="${y}" width="22" height="74" fill="#2f7d74"/>
    <rect x="360" y="${y}" width="18" height="74" fill="#b0552f"/>`;
  return svgDoc(`
    <rect width="960" height="600" fill="#e9e1cf"/>
    <rect x="0" y="440" width="960" height="160" fill="#c8a06e"/>
    <!-- window, right, straight in both -->
    <rect x="716" y="96" width="182" height="240" fill="#bfe3f2" stroke="#6b5a44" stroke-width="10"/>
    <line x1="807" y1="96" x2="807" y2="336" stroke="#6b5a44" stroke-width="8"/>
    <line x1="716" y1="216" x2="898" y2="216" stroke="#6b5a44" stroke-width="8"/>
    <!-- bookshelf -->
    <rect x="90" y="140" width="328" height="304" fill="#f4ede0" stroke="#6b4f34" stroke-width="10"/>
    ${books(168)} ${books(280)} ${books(386)}
    ${shelf(250, 14)} ${shelf(362, -16)} ${shelf(456, 18)}
    <!-- door -->
    ${doorSides} ${doorTop}
    <rect x="500" y="214" width="80" height="330" fill="#d9c7a5"/>
    ${warped ? `<path d="M512 300 Q540 316 568 300 M512 420 Q540 436 568 420" fill="none" stroke="#8a6a44" stroke-width="6"/>` : `<rect x="512" y="300" width="56" height="6" fill="#8a6a44"/><rect x="512" y="420" width="56" height="6" fill="#8a6a44"/>`}
    <circle cx="572" cy="384" r="6" fill="#3a3a3a"/>
    <!-- picture frame on the wall -->
    ${frame}
    <!-- lamp -->
    <rect x="644" y="360" width="10" height="150" fill="#3a3a3a"/>
    <path d="M616 366 Q649 318 682 366 Z" fill="#e8cf8d" stroke="#3a3a3a" stroke-width="4"/>
    ${boards}
  `);
};

// Head-and-shoulders portrait of an imagined woman — a flat illustration, no
// real person. mismatchedEarrings: hoop on one side, pearl drop on the other.
const portrait = ({ mismatchedEarrings, waxySkin }) => {
  const skinFill = waxySkin ? "url(#waxySkin)" : "#d9a173";
  const texture = waxySkin
    ? ""
    : `<g opacity="0.18" stroke="#8a5a38" stroke-width="2"><path d="M430 300 l6 6 M444 292 l5 5 M470 236 l6 6 M516 250 l5 5 M540 300 l6 6 M500 356 l6 6 M460 344 l5 5"/></g>`;
  const leftEarring = mismatchedEarrings
    ? `<circle cx="344" cy="392" r="20" fill="none" stroke="#d4a017" stroke-width="7"/>`
    : `<circle cx="344" cy="382" r="8" fill="#d4a017" stroke="#8a6a10" stroke-width="3"/>`;
  const rightEarring = mismatchedEarrings
    ? `<line x1="616" y1="368" x2="616" y2="398" stroke="#d4a017" stroke-width="4"/><circle cx="616" cy="410" r="13" fill="#f4f0e8" stroke="#9a9a92" stroke-width="3"/>`
    : `<circle cx="616" cy="382" r="8" fill="#d4a017" stroke="#8a6a10" stroke-width="3"/>`;
  const sheen = waxySkin
    ? `<ellipse cx="480" cy="330" rx="120" ry="34" fill="#ffffff" opacity="0.34" transform="rotate(-8 480 330)"/>`
    : `<ellipse cx="452" cy="322" rx="46" ry="20" fill="#c76b52" opacity="0.16"/>`;
  return svgDoc(`
    <defs>
      <radialGradient id="waxySkin" cx="52%" cy="40%" r="75%">
        <stop offset="0%" stop-color="#f2c795"/>
        <stop offset="100%" stop-color="#d9a173"/>
      </radialGradient>
    </defs>
    <rect width="960" height="600" fill="#e3e8df"/>
    <circle cx="480" cy="320" r="250" fill="#d3dcd1"/>
    <!-- hair behind the shoulders -->
    <path d="M310 480 Q290 250 400 170 Q480 120 560 170 Q670 250 650 480 Q560 420 480 420 Q400 420 310 480 Z" fill="#2d2320"/>
    <!-- dupatta over the shoulders -->
    <path d="M300 600 Q360 440 430 400 L420 600 Z" fill="#2f7d74"/>
    <path d="M660 600 Q600 440 530 400 L540 600 Z" fill="#256a62"/>
    <!-- neck and face -->
    <rect x="446" y="380" width="68" height="70" fill="${skinFill}" stroke="#8a5a38" stroke-width="3"/>
    <ellipse cx="480" cy="300" rx="150" ry="172" fill="${skinFill}" stroke="#8a5a38" stroke-width="3"/>
    ${texture}
    ${sheen}
    <!-- ears -->
    <ellipse cx="330" cy="310" rx="26" ry="36" fill="${skinFill}" stroke="#8a5a38" stroke-width="3"/>
    <ellipse cx="630" cy="310" rx="26" ry="36" fill="${skinFill}" stroke="#8a5a38" stroke-width="3"/>
    <!-- hair front, parting, bindi -->
    <path d="M330 260 Q400 130 480 130 Q560 130 630 260 Q560 210 480 214 Q400 210 330 260 Z" fill="#2d2320"/>
    <line x1="480" y1="136" x2="480" y2="212" stroke="#f4ede0" stroke-width="4"/>
    <circle cx="480" cy="228" r="7" fill="#b03030"/>
    <!-- eyes and brows -->
    <path d="M396 292 Q422 278 448 292" fill="none" stroke="#2d2320" stroke-width="6"/>
    <path d="M512 292 Q538 278 564 292" fill="none" stroke="#2d2320" stroke-width="6"/>
    <ellipse cx="422" cy="306" rx="22" ry="13" fill="#f8f4ec" stroke="#8a5a38" stroke-width="2"/>
    <ellipse cx="538" cy="306" rx="22" ry="13" fill="#f8f4ec" stroke="#8a5a38" stroke-width="2"/>
    <circle cx="422" cy="306" r="7" fill="#2d2320"/>
    <circle cx="538" cy="306" r="7" fill="#2d2320"/>
    <!-- nose and lips -->
    <path d="M472 330 Q480 344 488 330" fill="none" stroke="#8a5a38" stroke-width="4"/>
    <path d="M452 372 Q480 356 508 372 Q480 392 452 372 Z" fill="#b0552f"/>
    ${leftEarring}
    ${rightEarring}
  `);
};

/* -------------------------------------------------------------- manifest */

// The manifest the spec requires: file, answer, tell (en and hi) and
// source/licence per round, plus a scene string used as the image's alt
// text (never leaking the answer). Round order is the play order.
const PLACEHOLDER_SOURCE =
  "Synthetic placeholder scene generated by tools/lab-spot-the-fake/generate.cjs " +
  "(flat vector drawing made for this quiz; no photograph, no real person, no " +
  "third-party rights — repo licence Apache-2.0). The owner must supply the " +
  "final curated set and record its licence here.";

const ROUNDS = [
  {
    file: "01-street-signs-real.webp",
    answer: "real",
    scene: {
      en: "A street with shop signs",
      hi: "दुकानों के साइनबोर्ड वाली गली",
    },
    tell: {
      en: "Every sign here reads a real, correctly spelled word — AI-made images garble writing, so clean signage leans real.",
      hi: "यहाँ हर साइनबोर्ड पर एक असली, सही वर्तनी वाला शब्द लिखा है — AI की तस्वीरें लिखाई बिगाड़ देती हैं, इसलिए साफ़-सुथरे साइन असली होने की ओर इशारा करते हैं।",
    },
    render: () => street({ bakery: "BAKERY", tea: "TEA", pharmacy: "PHARMACY" }),
  },
  {
    file: "02-street-signs-ai.webp",
    answer: "ai",
    scene: {
      en: "A street with shop signs",
      hi: "दुकानों के साइनबोर्ड वाली गली",
    },
    tell: {
      en: "Read the signs: BAEKRY for BAKERY, TAE for TEA — AI-made images often spell real words wrong.",
      hi: "साइन पढ़िए: BAKERY की जगह BAEKRY और TEA की जगह TAE — AI से बनी तस्वीरें असली शब्दों की वर्तनी अकसर बिगाड़ देती हैं।",
    },
    render: () => street({ bakery: "BAEKRY", tea: "TAE", pharmacy: "PHARMCY" }),
  },
  {
    file: "03-hand-five-fingers.webp",
    answer: "real",
    scene: {
      en: "A hand holding a paper cup",
      hi: "कागज़ का कप पकड़े हुए हाथ",
    },
    tell: {
      en: "The hand holds the cup with five fingers, each bending the way real fingers bend — a hand you can count is a point for real.",
      hi: "हाथ कप को पाँच उंगलियों से पकड़े है और हर उंगली असली हाथ की तरह मुड़ी है — जिस हाथ की उंगलियाँ गिनी जा सकें, वह असली होने का पक्ष में है।",
    },
    render: () => handHoldingCup({ fingerCount: 4 }),
  },
  {
    file: "04-hand-six-fingers.webp",
    answer: "ai",
    scene: {
      en: "A hand holding a paper cup",
      hi: "कागज़ का कप पकड़े हुए हाथ",
    },
    tell: {
      en: "Count the fingers gripping the cup: there are six — extra or missing fingers are the classic AI slip.",
      hi: "कप पकड़े उंगलियाँ गिनिए: ये छह हैं — ज़्यादा या कम उंगलियाँ AI की सबसे आम ग़लती हैं।",
    },
    render: () => handHoldingCup({ fingerCount: 5 }),
  },
  {
    file: "05-fruit-shadows-ai.webp",
    answer: "ai",
    scene: {
      en: "Fruit on a table by a window",
      hi: "खिड़की के पास मेज़ पर रखे फल",
    },
    tell: {
      en: "The light comes from the window on the left, but the apple's shadow falls towards it — AI-made images often disagree with themselves about where the light is.",
      hi: "रोशनी बाईं ओर की खिड़की से आ रही है, पर सेब की परछाई उसी ओर पड़ी है — AI की तस्वीरें अकसर रोशनी की दिशा लेकर आपस में नहीं मिलतीं।",
    },
    render: () => fruitStillLife({ consistentShadows: false }),
  },
  {
    file: "06-fruit-shadows-real.webp",
    answer: "real",
    scene: {
      en: "Fruit on a table by a window",
      hi: "खिड़की के पास मेज़ पर रखे फल",
    },
    tell: {
      en: "Every shadow falls away from the same window light — real photographs keep their light consistent.",
      hi: "हर परछाई एक ही खिड़की की रोशनी से दूसरी ओर गिरी है — असली तस्वीरों में रोशनी की दिशा एक-सी रहती है।",
    },
    render: () => fruitStillLife({ consistentShadows: true }),
  },
  {
    file: "07-room-straight.webp",
    answer: "real",
    scene: {
      en: "A room with shelves and a door",
      hi: "शेल्फ़ और दरवाज़े वाला कमरा",
    },
    tell: {
      en: "The shelves, the door frame and the picture frame all run straight and meet at clean corners — real photos keep background lines honest.",
      hi: "शेल्फ़, दरवाज़े का फ़्रेम और तस्वीर का फ़्रेम — सब सीधी लकीरों में हैं और कोनों पर साफ़ मिलते हैं — असली तस्वीरें पृष्ठभूमि की लकीरों को सीधा रखती हैं।",
    },
    render: () => room({ warped: false }),
  },
  {
    file: "08-room-warped.webp",
    answer: "ai",
    scene: {
      en: "A room with shelves and a door",
      hi: "शेल्फ़ और दरवाज़े वाला कमरा",
    },
    tell: {
      en: "Follow the shelf and door lines: they bow and bend instead of running straight — background warping like this is a common AI tell.",
      hi: "शेल्फ़ और दरवाज़े की लकीरों को देखिए: वे सीधी चलने की जगह झुकी और मुड़ी हुई हैं — पृष्ठभूमि की ऐसी टेढ़ी लकीरें AI की आम पहचान हैं।",
    },
    render: () => room({ warped: true }),
  },
  {
    file: "09-portrait-earrings.webp",
    answer: "ai",
    scene: {
      en: "A portrait of a woman",
      hi: "एक महिला का चित्र",
    },
    tell: {
      en: "Look at the earrings: one is a gold hoop, the other a pearl drop — AI-made images often break the symmetry of small pairs.",
      hi: "बालियों को देखिए: एक सुनहरा कड़ा है, दूसरी मोती की लटकन — AI की तस्वीरें छोटी-छोटी जोड़ियों की सममिति अकसर तोड़ देती हैं।",
    },
    render: () => portrait({ mismatchedEarrings: true, waxySkin: false }),
  },
  {
    file: "10-portrait-skin.webp",
    answer: "ai",
    scene: {
      en: "A portrait of a woman",
      hi: "एक महिला का चित्र",
    },
    tell: {
      en: "The skin is perfectly even with a waxy sheen and no pores at all — over-smooth skin is a common AI signature on portraits.",
      hi: "चमड़ी पूरी एक-सी, मोम जैसी चमक वाली और बिना किसी रोमछिद्र की है — बहुत मुलायम-सी चमड़ी AI पोर्ट्रेट की आम निशानी है।",
    },
    render: () => portrait({ mismatchedEarrings: false, waxySkin: true }),
  },
];

/* ----------------------------------------------------------------- write */

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const manifest = {
    version: 1,
    rounds: ROUNDS.map(({ file, answer, scene, tell }) => ({
      file,
      answer,
      scene,
      tell,
      source: PLACEHOLDER_SOURCE,
    })),
  };

  for (const round of ROUNDS) {
    const out = path.join(OUT_DIR, round.file);
    const buffer = await sharp(Buffer.from(round.render()))
      .webp({ quality: 90 })
      .toBuffer();
    if (buffer.byteLength > MAX_BYTES) {
      throw new Error(`${round.file} is ${buffer.byteLength} bytes, over the 150 KB cap`);
    }
    fs.writeFileSync(out, buffer);
    console.log(`${round.file}: ${(buffer.byteLength / 1024).toFixed(1)} KB`);
  }

  const manifestPath = path.join(OUT_DIR, "quiz.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`quiz.json: ${manifest.rounds.length} rounds -> ${path.relative(process.cwd(), manifestPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
