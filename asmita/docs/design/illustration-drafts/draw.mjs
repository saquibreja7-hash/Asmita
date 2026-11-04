// Hand-built SVG illustration drafts for Asmita. Writes to the folder given as argv[2].
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const C = {
  ink: "#242424", teal: "#0a5e5a", mist: "#d4e9e6", sky: "#9fcac4",
  coral: "#ff9473", gold: "#ecda98", paper: "#ffffff", grey: "#c9c4c0",
};
const SKIN = ["#c98b62", "#a86b45", "#8a5a3b", "#d9a27a"];

const svg = (w, h, body, line = false) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" fill="none"${
    line ? ` stroke="${C.ink}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"` : ""
  }>\n${body}\n</svg>\n`;

const blob = (w, h, fill = C.mist) => {
  const x = w / 2, y = h / 2, rx = w * 0.42, ry = h * 0.4;
  return `<path stroke="none" fill="${fill}" d="M${x - rx} ${y + ry * 0.3} C ${x - rx * 1.1} ${y - ry * 0.7}, ${x - rx * 0.3} ${y - ry * 1.1}, ${x + rx * 0.2} ${y - ry} C ${x + rx * 0.9} ${y - ry * 0.9}, ${x + rx * 1.1} ${y - ry * 0.1}, ${x + rx * 0.9} ${y + ry * 0.5} C ${x + rx * 0.7} ${y + ry * 1.05}, ${x - rx * 0.2} ${y + ry * 1.1}, ${x - rx * 0.6} ${y + ry * 0.95} C ${x - rx * 0.9} ${y + ry * 0.85}, ${x - rx * 0.98} ${y + ry * 0.6}, ${x - rx} ${y + ry * 0.3} Z"/>`;
};

const birds = (pts, color = C.ink) =>
  pts.map(([x, y, s = 1]) =>
    `<path stroke="${color}" stroke-width="2" fill="none" d="M${x} ${y} q${5 * s} ${-5 * s} ${10 * s} 0 q${5 * s} ${-5 * s} ${10 * s} 0"/>`).join("\n");

// Hair for a head centred at (x, y), radius r.
function hair(style, x, y, r, color = C.ink) {
  const cap = `<path fill="${color}" d="M${x - r - 1} ${y + 2} C ${x - r - 3} ${y - r * 1.6}, ${x + r + 3} ${y - r * 1.6}, ${x + r + 1} ${y + 2} C ${x + r * 0.6} ${y - r * 0.6}, ${x - r * 0.6} ${y - r * 0.6}, ${x - r - 1} ${y + 2} Z"/>`;
  if (style === "bun") return cap + `<circle fill="${color}" cx="${x}" cy="${y - r - 4}" r="${r * 0.48}"/>`;
  if (style === "bob")
    return `<path fill="${color}" d="M${x - r - 3} ${y + r * 0.7} C ${x - r * 1.5} ${y - r * 1.7}, ${x + r * 1.5} ${y - r * 1.7}, ${x + r + 3} ${y + r * 0.7} L ${x + r - 3} ${y + r * 0.7} C ${x + r * 0.7} ${y - r * 0.4}, ${x - r * 0.7} ${y - r * 0.4}, ${x - r + 3} ${y + r * 0.7} Z"/>`;
  if (style === "long")
    return `<path fill="${color}" d="M${x - r - 2} ${y + r * 2.1} C ${x - r * 1.6} ${y - r * 1.8}, ${x + r * 1.6} ${y - r * 1.8}, ${x + r + 2} ${y + r * 2.1} L ${x + r - 4} ${y + r * 2.1} C ${x + r * 0.6} ${y}, ${x + r * 0.7} ${y - r * 0.5}, ${x} ${y - r * 0.55} C ${x - r * 0.7} ${y - r * 0.5}, ${x - r * 0.6} ${y}, ${x - r + 4} ${y + r * 2.1} Z"/>`;
  return cap;
}

// A standing, faceless figure. Arms are drawn by the caller so hands can meet.
function standing({ x, top, skin, hairStyle, hairColor, outfit, line }) {
  const r = 17, hy = top + r, sh = hy + r + 8, waist = sh + 46, ground = top + 160;
  const st = line ? ` stroke="${C.ink}"` : ` stroke="none"`;
  const out = [];
  if (hairStyle === "long") out.push(hair("long", x, hy, r, hairColor));
  out.push(`<rect${st} x="${x - 6}" y="${hy + r - 4}" width="12" height="14" rx="5" fill="${skin}"/>`);
  if (outfit.type === "saree") {
    out.push(`<path${st} fill="${outfit.main}" d="M${x - 20} ${sh + 8} C ${x - 18} ${sh - 2}, ${x + 18} ${sh - 2}, ${x + 20} ${sh + 8} L ${x + 22} ${waist} L ${x + 30} ${ground - 4} L ${x - 30} ${ground - 4} L ${x - 22} ${waist} Z"/>`);
    out.push(`<path${st} fill="${outfit.accent}" d="M${x - 16} ${sh + 2} L ${x + 21} ${sh + 26} L ${x + 26} ${waist + 30} L ${x + 12} ${waist + 12} Z"/>`);
    out.push(`<path stroke="${outfit.accent}" stroke-width="5" d="M${x - 29} ${ground - 8} L ${x + 29} ${ground - 8}"/>`);
  } else {
    out.push(`<rect${st} x="${x - 15}" y="${waist}" width="12" height="${ground - waist - 4}" rx="5" fill="${outfit.legs}"/>`);
    out.push(`<rect${st} x="${x + 3}" y="${waist}" width="12" height="${ground - waist - 4}" rx="5" fill="${outfit.legs}"/>`);
    out.push(`<path${st} fill="${outfit.main}" d="M${x - 20} ${sh + 8} C ${x - 18} ${sh - 2}, ${x + 18} ${sh - 2}, ${x + 20} ${sh + 8} L ${x + 25} ${waist + outfit.length} L ${x - 25} ${waist + outfit.length} Z"/>`);
    if (outfit.dupatta)
      out.push(`<path${st} fill="${outfit.dupatta}" d="M${x - 19} ${sh + 4} C ${x - 6} ${sh + 16}, ${x + 6} ${sh + 16}, ${x + 19} ${sh + 4} L ${x + 21} ${sh + 14} C ${x + 6} ${sh + 26}, ${x - 6} ${sh + 26}, ${x - 21} ${sh + 14} Z"/>`);
  }
  out.push(`<ellipse${st} cx="${x - 10}" cy="${ground - 2}" rx="9" ry="4" fill="${C.ink}"/>`);
  out.push(`<ellipse${st} cx="${x + 10}" cy="${ground - 2}" rx="9" ry="4" fill="${C.ink}"/>`);
  out.push(`<circle${st} cx="${x}" cy="${hy}" r="${r}" fill="${skin}"/>`);
  if (hairStyle !== "long") out.push(hair(hairStyle, x, hy, r, hairColor));
  else out.push(hair("cap", x, hy, r, hairColor));
  return { svg: out.join("\n"), shoulderY: sh + 8, handY: sh + 58 };
}

const arm = (from, to, skin, line) =>
  (line ? `<path stroke="${C.ink}" stroke-width="13" d="M${from[0]} ${from[1]} C ${from[0] + (to[0] - from[0]) * 0.1} ${from[1] + 30}, ${to[0] - (to[0] - from[0]) * 0.3} ${to[1]}, ${to[0]} ${to[1]}"/>` : "") +
  `<path stroke="${skin}" stroke-width="${line ? 8 : 10}" stroke-linecap="round" d="M${from[0]} ${from[1]} C ${from[0] + (to[0] - from[0]) * 0.1} ${from[1] + 30}, ${to[0] - (to[0] - from[0]) * 0.3} ${to[1]}, ${to[0]} ${to[1]}"/>`;

const DRAWINGS = {};

// 1. Home hero: a calm window, morning chai.
DRAWINGS["home-hero-A"] = svg(400, 300, `
${blob(400, 300)}
<circle stroke="none" cx="236" cy="108" r="22" fill="${C.coral}"/>
<rect x="140" y="58" width="150" height="152" rx="6"/>
<path d="M215 58 V210 M140 134 H290"/>
<path fill="${C.teal}" d="M290 56 C 312 100, 296 150, 314 210 L 290 210 Z"/>
<path d="M140 58 C 128 108, 152 160, 126 210"/>
${birds([[166, 92], [188, 116, 0.8]])}
<path d="M112 210 H318"/><path stroke-width="2" d="M120 219 H310"/>
<path fill="${C.coral}" d="M150 210 L154 186 H180 L184 210 Z"/>
<path d="M167 186 V156"/>
<path fill="${C.sky}" d="M167 172 C 160 156, 148 152, 140 156 C 146 166, 156 172, 167 172 Z"/>
<path fill="${C.sky}" d="M167 164 C 172 148, 184 142, 194 144 C 190 156, 180 162, 167 164 Z"/>
<path fill="${C.gold}" d="M252 210 L247 180 H273 L268 210 Z"/>
<path stroke-width="2" d="M248 189 H272"/>
<path stroke-width="2" d="M255 172 c -4 -6 4 -10 0 -16 M265 172 c -4 -6 4 -10 0 -16"/>
`, true);

DRAWINGS["home-hero-B"] = svg(400, 300, `
${blob(400, 300)}
<rect x="172" y="40" width="170" height="150" rx="10" fill="${C.sky}"/>
<circle cx="290" cy="94" r="26" fill="${C.gold}"/>
<path d="M172 160 Q 220 132 262 154 T 342 146 V182 Q 342 190 334 190 H180 Q 172 190 172 182 Z" fill="${C.teal}" opacity="0.35"/>
<path d="M257 40 V190 M172 115 H342" stroke="${C.mist}" stroke-width="6"/>
${birds([[200, 70], [222, 88, 0.8]], C.paper)}
<rect x="162" y="188" width="190" height="10" rx="4" fill="${C.paper}"/>
<path d="M306 188 l-3 -18 h18 l-3 18 z" fill="${C.coral}"/>
<ellipse cx="118" cy="262" rx="64" ry="14" fill="${C.gold}"/>
<path d="M84 258 C 82 214, 94 190, 118 186 C 142 190, 154 214, 152 258 Z" fill="${C.teal}"/>
<path d="M98 196 C 113 214, 134 222, 150 214 L 153 238 C 134 246, 110 236, 96 220 Z" fill="${C.coral}"/>
<rect x="111" y="168" width="14" height="22" rx="6" fill="${SKIN[1]}"/>
<circle cx="118" cy="158" r="19" fill="${C.ink}"/>
<circle cx="118" cy="138" r="9" fill="${C.ink}"/>
`);

// 2. How it works 1: tell us where (links added on a phone).
DRAWINGS["how-1-tell-A"] = svg(300, 300, `
${blob(300, 300)}
<rect x="108" y="46" width="104" height="200" rx="18" fill="${C.paper}"/>
<path d="M148 60 H172"/>
<rect stroke="none" x="122" y="88" width="76" height="26" rx="13" fill="${C.mist}"/>
<rect stroke="none" x="122" y="124" width="76" height="26" rx="13" fill="${C.mist}"/>
<circle stroke="none" cx="135" cy="101" r="6" fill="${C.teal}"/>
<circle stroke="none" cx="135" cy="137" r="6" fill="${C.teal}"/>
<path stroke-width="2" d="M147 101 H186 M147 137 H178"/>
<rect x="122" y="164" width="76" height="26" rx="13" stroke-dasharray="5 6" stroke-width="2"/>
<circle cx="160" cy="220" r="13"/><path d="M160 214 V226 M154 220 H166"/>
<rect stroke="none" x="28" y="150" width="70" height="24" rx="12" fill="${C.coral}"/>
<circle stroke="none" cx="40" cy="162" r="5" fill="${C.paper}"/>
<path stroke-width="2" d="M50 162 H86" stroke="${C.paper}"/>
<path stroke-width="2" d="M100 162 H114 M106 154 L114 162 L106 170"/>
<path stroke-width="2" d="M30 190 H60 M40 200 H74"/>
<circle stroke="none" cx="214" cy="86" r="15" fill="${C.teal}"/>
<path stroke="${C.paper}" d="M207 86 l5 5 l9 -10"/>
`, true);

{
  const s = SKIN[1];
  DRAWINGS["how-1-tell-B"] = svg(300, 300, `
${blob(300, 300)}
<rect x="196" y="84" width="62" height="16" rx="8" fill="${C.sky}"/>
<rect x="206" y="108" width="52" height="16" rx="8" fill="${C.coral}"/>
<rect x="196" y="132" width="62" height="16" rx="8" fill="${C.sky}"/>
<path d="M78 252 C 88 222, 212 222, 222 252 C 200 266, 100 266, 78 252 Z" fill="${C.teal}"/>
${hair("long", 150, 110, 22)}
<path d="M114 238 C 111 190, 124 150, 150 146 C 176 150, 189 190, 186 238 Z" fill="${C.coral}"/>
<path d="M120 158 L 182 200 L 184 214 L 116 174 Z" fill="${C.gold}"/>
<rect x="143" y="126" width="14" height="24" rx="6" fill="${s}"/>
<circle cx="150" cy="110" r="22" fill="${s}"/>
${hair("cap", 150, 110, 22)}
<rect x="139" y="184" width="24" height="36" rx="5" fill="${C.ink}" transform="rotate(-8 151 202)"/>
<path d="M124 166 C 110 192, 122 208, 142 204" stroke="${s}" stroke-width="10" stroke-linecap="round"/>
<path d="M176 166 C 190 192, 178 208, 160 204" stroke="${s}" stroke-width="10" stroke-linecap="round"/>
`);
}

// 3. How it works 2: we send the notice.
DRAWINGS["how-2-send-A"] = svg(300, 300, `
${blob(300, 300)}
<path stroke-width="2" stroke-dasharray="3 10" d="M30 250 C 70 200, 100 190, 130 180"/>
<g transform="rotate(-14 165 150)">
<rect x="112" y="116" width="112" height="74" rx="6" fill="${C.paper}"/>
<path d="M112 122 L168 162 L224 122"/>
<circle stroke="none" cx="168" cy="162" r="10" fill="${C.teal}"/>
</g>
<path d="M58 140 H92 M66 160 H100 M78 180 H104"/>
<path fill="${C.coral}" stroke-width="2" d="M222 64 L250 72 L234 78 Z M234 78 L230 90 L250 72"/>
<path fill="${C.sky}" stroke-width="2" d="M242 112 L262 118 L251 122 Z M251 122 L248 131 L262 118"/>
<path stroke-width="2" d="M70 90 v10 M65 95 h10 M240 200 v10 M235 205 h10"/>
`, true);

DRAWINGS["how-2-send-B"] = svg(300, 300, `
${blob(300, 300)}
<rect x="196" y="64" width="72" height="96" rx="12" fill="${C.teal}"/>
<rect x="208" y="80" width="48" height="8" rx="4" fill="${C.mist}"/>
<rect x="208" y="96" width="36" height="8" rx="4" fill="${C.mist}"/>
<rect x="208" y="112" width="44" height="8" rx="4" fill="${C.mist}"/>
<circle cx="232" cy="140" r="7" fill="${C.gold}"/>
<g fill="${C.teal}" opacity="0.5"><circle cx="160" cy="160" r="3"/><circle cx="176" cy="150" r="3"/><circle cx="190" cy="140" r="3"/></g>
<g transform="rotate(-18 100 200)">
<rect x="52" y="168" width="96" height="62" rx="8" fill="${C.coral}"/>
<path d="M52 174 L100 208 L148 174 Z" fill="${C.gold}"/>
</g>
<path d="M30 200 H56 M38 218 H60" stroke="${C.teal}" stroke-width="4" stroke-linecap="round"/>
<path d="M120 70 L146 78 L131 83 Z" fill="${C.sky}"/>
`);

// 4. How it works 3: you are protected.
DRAWINGS["how-3-protect-A"] = svg(300, 300, `
${blob(300, 300)}
<path fill="${C.paper}" d="M150 46 L222 72 V138 C 222 188, 188 224, 150 246 C 112 224, 78 188, 78 138 V72 Z"/>
<path stroke="none" fill="${C.mist}" d="M150 66 L204 86 V138 C 204 176, 180 204, 150 222 Z"/>
<path stroke="${C.teal}" stroke-width="9" d="M118 146 L142 170 L186 120"/>
<path d="M60 250 C 52 214, 60 186, 78 170"/>
<ellipse fill="${C.coral}" cx="56" cy="206" rx="9" ry="16" transform="rotate(-30 56 206)"/>
<ellipse fill="${C.sky}" cx="72" cy="186" rx="8" ry="14" transform="rotate(30 72 186)"/>
<path d="M240 250 C 248 214, 240 186, 222 170"/>
<ellipse fill="${C.sky}" cx="244" cy="206" rx="9" ry="16" transform="rotate(30 244 206)"/>
<ellipse fill="${C.coral}" cx="228" cy="186" rx="8" ry="14" transform="rotate(-30 228 186)"/>
`, true);

{
  const s = SKIN[2];
  const fig = standing({ x: 150, top: 96, skin: s, hairStyle: "bun", hairColor: C.ink, outfit: { type: "saree", main: C.coral, accent: C.teal } });
  DRAWINGS["how-3-protect-B"] = svg(300, 300, `
${blob(300, 300)}
<path d="M100 262 L200 262 L262 298 L38 298 Z" fill="${C.gold}" opacity="0.6"/>
<path d="M98 262 V112 C 98 66, 202 66, 202 112 V262 Z" fill="${C.gold}"/>
<path d="M98 112 L66 124 V276 L98 262 Z" fill="${C.teal}"/>
${fig.svg}
${arm([168, fig.shoulderY], [198, 126], s)}
${arm([132, fig.shoulderY], [124, fig.handY + 6], s)}
`);
}

// 5. Start of filing: you are not alone.
DRAWINGS["start-support-A"] = svg(400, 300, `
${blob(400, 300)}
<path d="M70 132 H330 M70 154 H330"/>
<path d="M92 132 V200 M308 132 V200"/>
<path fill="${C.paper}" d="M56 200 H344 V212 H56 Z"/>
<path d="M80 212 V262 M320 212 V262"/>
<path fill="${C.gold}" d="M166 200 L162 166 H190 L186 200 Z"/>
<path fill="${C.gold}" d="M214 200 L210 166 H238 L234 200 Z"/>
<path stroke-width="2" d="M163 176 H189 M211 176 H237"/>
<path stroke="${C.coral}" d="M176 158 C 168 138, 182 128, 176 114 C 170 98, 194 88, 200 104 C 206 88, 230 98, 224 114 C 218 128, 232 138, 224 158"/>
<ellipse fill="${C.sky}" cx="112" cy="250" rx="22" ry="10"/>
<ellipse fill="${C.sky}" cx="300" cy="252" rx="18" ry="8"/>
`, true);

{
  const a = SKIN[0], b = SKIN[2];
  const seated = (x, skin, top, legs, hairStyle) => `
${hairStyle === "long" ? hair("long", x, 120, 18) : ""}
<rect x="${x - 14}" y="210" width="12" height="54" rx="5" fill="${legs}"/>
<rect x="${x + 2}" y="210" width="12" height="54" rx="5" fill="${legs}"/>
<ellipse cx="${x - 9}" cy="265" rx="9" ry="4" fill="${C.ink}"/>
<ellipse cx="${x + 9}" cy="265" rx="9" ry="4" fill="${C.ink}"/>
<path d="M${x - 24} 214 L ${x - 20} 152 C ${x - 18} 142, ${x + 18} 142, ${x + 20} 152 L ${x + 24} 214 Z" fill="${top}"/>
<rect x="${x - 6}" y="132" width="12" height="14" rx="5" fill="${skin}"/>
<circle cx="${x}" cy="120" r="18" fill="${skin}"/>
${hair(hairStyle === "long" ? "cap" : hairStyle, x, 120, 18)}`;
  DRAWINGS["start-support-B"] = svg(400, 300, `
${blob(400, 300)}
<rect x="70" y="202" width="260" height="14" rx="6" fill="${C.teal}"/>
<rect x="88" y="214" width="10" height="52" rx="4" fill="${C.teal}"/>
<rect x="302" y="214" width="10" height="52" rx="4" fill="${C.teal}"/>
${seated(240, b, C.sky, C.teal, "bun")}
${seated(160, a, C.coral, C.ink, "long")}
${arm([176, 154], [228, 150], a)}
${arm([226, 156], [222, 192], b)}
<path d="M216 194 l-2 -14 h16 l-2 14 z" fill="${C.gold}"/>
${arm([146, 156], [164, 192], a)}
<path d="M158 194 l-2 -14 h16 l-2 14 z" fill="${C.gold}"/>
<path d="M200 96 c -8 -8 -18 0 -10 8 l 10 10 l 10 -10 c 8 -8 -2 -16 -10 -8 z" fill="${C.coral}"/>
`);
}

// 6. Confirmation: you are done for now.
DRAWINGS["done-relief-A"] = svg(400, 300, `
${blob(400, 300)}
<path fill="${C.paper}" d="M140 232 V110 C 140 58, 260 58, 260 110 V232 Z"/>
<path stroke="none" fill="${C.gold}" d="M168 232 A32 32 0 0 1 232 232 Z"/>
<path d="M140 232 H260"/>
<path stroke-width="2" d="M200 186 V172 M172 196 L164 186 M228 196 L236 186 M154 214 L142 210 M246 214 L258 210"/>
${birds([[176, 110, 0.8], [206, 96]])}
<path d="M52 258 H348"/>
<path fill="${C.coral}" d="M76 258 C 76 234, 142 234, 142 258 Z"/>
<path fill="${C.coral}" d="M286 258 L290 232 H318 L322 258 Z"/>
<path d="M304 232 V196"/>
<path fill="${C.sky}" d="M304 214 C 296 198, 284 194, 276 198 C 282 208, 292 214, 304 214 Z"/>
<path fill="${C.sky}" d="M304 204 C 310 188, 322 182, 332 184 C 328 196, 318 202, 304 204 Z"/>
<ellipse fill="${C.coral}" cx="92" cy="120" rx="5" ry="9" transform="rotate(40 92 120)"/>
<ellipse fill="${C.sky}" cx="110" cy="160" rx="5" ry="9" transform="rotate(-30 110 160)"/>
<ellipse fill="${C.gold}" cx="300" cy="110" rx="5" ry="9" transform="rotate(20 300 110)"/>
`, true);

{
  const s = SKIN[0];
  DRAWINGS["done-relief-B"] = svg(400, 300, `
${blob(400, 300)}
<circle cx="300" cy="86" r="34" fill="${C.gold}"/>
<rect x="56" y="226" width="290" height="12" rx="6" fill="${C.gold}"/>
<ellipse cx="102" cy="214" rx="42" ry="17" fill="${C.coral}"/>
<path d="M96 192 C 76 200, 74 216, 90 224" stroke="${C.ink}" stroke-width="12" stroke-linecap="round"/>
<path d="M126 194 C 172 186, 222 190, 244 200 L 244 222 C 212 226, 162 226, 128 218 Z" fill="${C.teal}"/>
<path d="M240 210 L 272 178 L 306 220" stroke="${C.sky}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
<ellipse cx="314" cy="222" rx="10" ry="4" fill="${C.ink}"/>
<circle cx="112" cy="198" r="17" fill="${s}"/>
<path d="M97 190 C 100 176, 122 174, 128 188 C 118 182, 106 182, 97 190 Z" fill="${C.ink}"/>
<path d="M114 198 q4 3 8 0" stroke="${C.ink}" stroke-width="2" stroke-linecap="round"/>
<path d="M142 202 C 162 212, 182 212, 198 204" stroke="${s}" stroke-width="9" stroke-linecap="round"/>
<ellipse cx="190" cy="120" rx="5" ry="9" fill="${C.coral}" transform="rotate(40 190 120)"/>
<ellipse cx="226" cy="150" rx="5" ry="9" fill="${C.sky}" transform="rotate(-30 226 150)"/>
<ellipse cx="150" cy="140" rx="4" ry="8" fill="${C.teal}" transform="rotate(10 150 140)"/>
`);
}

// 7. Not the right service: other paths.
const fork = `<path stroke="none" fill="${C.gold}" d="M150 300 C 160 262 130 240 46 230 L 46 212 C 140 216 186 232 200 250 C 214 232 260 216 354 212 L 354 230 C 270 240 240 262 250 300 Z"/>`;
DRAWINGS["stop-paths-A"] = svg(400, 300, `
${blob(400, 300)}
${fork}
<path stroke-width="4" d="M200 252 V78"/>
<path fill="${C.teal}" d="M200 92 H272 L286 106 L272 120 H200 Z"/>
<path fill="${C.coral}" d="M200 132 H128 L114 146 L128 160 H200 Z"/>
<path fill="${C.sky}" d="M200 172 H264 L278 186 L264 200 H200 Z"/>
<path fill="${C.sky}" d="M58 214 c -12 -22 22 -32 26 -12 c 10 -16 34 -2 24 14 Z"/>
<path fill="${C.sky}" d="M300 210 c -10 -20 20 -28 24 -10 c 10 -14 30 -2 22 12 Z"/>
${birds([[94, 86], [118, 70, 0.8], [300, 60]])}
`, true);

DRAWINGS["stop-paths-B"] = svg(400, 300, `
${blob(400, 300)}
<circle cx="88" cy="88" r="26" fill="${C.gold}"/>
<path d="M58 230 Q 120 168 200 198 T 342 192 V236 H58 Z" fill="${C.teal}" opacity="0.3"/>
${fork}
<rect x="196" y="78" width="8" height="176" rx="4" fill="${C.ink}"/>
<path fill="${C.teal}" d="M204 92 H274 L288 106 L274 120 H204 Z"/>
<path fill="${C.coral}" d="M196 132 H128 L114 146 L128 160 H196 Z"/>
<path fill="${C.sky}" d="M204 172 H266 L280 186 L266 200 H204 Z"/>
<circle cx="70" cy="214" r="16" fill="${C.teal}"/>
<circle cx="90" cy="218" r="12" fill="${C.teal}"/>
<circle cx="318" cy="212" r="15" fill="${C.teal}"/>
${birds([[300, 70], [324, 56, 0.8]])}
`);

// 8. Who we help: women of different ages, together.
{
  const people = [
    { x: 100, top: 70, skin: SKIN[0], hairStyle: "long", hairColor: C.ink, outfit: { type: "kurta", main: C.sky, legs: "#3d5a73", length: 8 } },
    { x: 196, top: 58, skin: SKIN[2], hairStyle: "bun", hairColor: C.ink, outfit: { type: "saree", main: C.coral, accent: C.teal } },
    { x: 288, top: 74, skin: SKIN[3], hairStyle: "bob", hairColor: C.ink, outfit: { type: "kurta", main: C.gold, legs: C.teal, length: 26, dupatta: C.coral } },
    { x: 380, top: 66, skin: SKIN[1], hairStyle: "bun", hairColor: C.grey, outfit: { type: "saree", main: C.teal, accent: C.gold } },
  ];
  const draw = (line) => {
    const figs = people.map((p) => standing({ ...p, line }));
    const arms = [];
    figs.forEach((f, i) => {
      const p = people[i];
      if (i === 0) arms.push(arm([p.x - 20, f.shoulderY], [p.x - 28, f.handY], p.skin, line));
      if (i === people.length - 1) arms.push(arm([p.x + 20, f.shoulderY], [p.x + 28, f.handY], p.skin, line));
      if (i < people.length - 1) {
        const q = people[i + 1], meet = [(p.x + q.x) / 2, Math.max(f.handY, figs[i + 1].handY)];
        arms.push(arm([p.x + 20, f.shoulderY], meet, p.skin, line));
        arms.push(arm([q.x - 20, figs[i + 1].shoulderY], meet, q.skin, line));
      }
    });
    return `${blob(480, 270)}
<path stroke="none" d="M40 236 H440" />
<rect x="40" y="226" width="400" height="8" rx="4" fill="${line ? C.paper : C.gold}" ${line ? `stroke="${C.ink}" stroke-width="2"` : ""}/>
${figs.map((f) => f.svg).join("\n")}
${arms.join("\n")}`;
  };
  const shift = (s) => `<g transform="translate(-4 0) scale(0.95)">${s}</g>`;
  DRAWINGS["who-we-help-A"] = svg(480, 270, shift(draw(true)));
  DRAWINGS["who-we-help-B"] = svg(480, 270, shift(draw(false)));
}

const SCENES = [
  ["home-hero", "Home page hero", "A calm window and morning chai: a quiet, safe start."],
  ["how-1-tell", "How it works, step 1: tell us where", "Links added on a phone. Nothing but text is shared."],
  ["how-2-send", "How it works, step 2: we send the notice", "A sealed letter on its way to the platform."],
  ["how-3-protect", "How it works, step 3: you are protected", "Protection that holds."],
  ["start-support", "Start of filing", "You are not alone in this."],
  ["done-relief", "Confirmation: you are done for now", "Relief, rest, a new morning."],
  ["stop-paths", "Not the right service screens", "There are other paths, and we point to them."],
  ["who-we-help", "Who we help", "Women of every age and background, together."],
];

const out = process.argv[2];
mkdirSync(out, { recursive: true });
for (const [name, body] of Object.entries(DRAWINGS)) writeFileSync(join(out, `${name}.svg`), body);

writeFileSync(join(out, "index.html"), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Illustration drafts</title>
<style>
  body { margin: 0; padding: 32px 16px; background: #f6f3f1; color: #242424; font-family: "Noto Sans", system-ui, sans-serif; }
  main { max-width: 1100px; margin: 0 auto; }
  h1 { font-size: 28px; margin: 0 0 6px; } p.lead { color: #625f5e; margin: 0 0 32px; }
  section { margin-bottom: 40px; } h2 { font-size: 19px; margin: 0 0 4px; } section > p { color: #625f5e; margin: 0 0 14px; }
  .pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
  figure { margin: 0; background: #fff; border: 1px solid #e3dfdc; border-radius: 16px; padding: 16px; }
  figure svg { width: 100%; height: auto; display: block; }
  figcaption { margin-top: 10px; font-size: 14px; color: #625f5e; } figcaption b { color: #242424; }
</style></head><body><main>
<h1>Illustration drafts</h1>
<p class="lead">Two styles for each place on the site. A is ink line art with soft colour; B is flat colour shapes. Pick one style for the whole set, or point at single drawings to change.</p>
${SCENES.map(([id, where, idea]) => `<section><h2>${where}</h2><p>${idea}</p><div class="pair">
<figure>${DRAWINGS[`${id}-A`]}<figcaption><b>${id}-A</b> · line art</figcaption></figure>
<figure>${DRAWINGS[`${id}-B`]}<figcaption><b>${id}-B</b> · flat shapes</figcaption></figure>
</div></section>`).join("\n")}
</main></body></html>
`);
console.log(Object.keys(DRAWINGS).length, "drawings written to", out);
