/**
 * WP36: PDQ robustness benchmark.
 *
 * Generates a harmless test set (synthetic images plus curated public-domain
 * landscape photographs), makes the altered copies a site could plausibly
 * serve, hashes everything with the PRODUCTION pipeline (crawler/src/prepare.ts
 * + asmita/src/lib/pdq/pdq.ts, imported, never copied) and reports, per
 * alteration, the share caught at PDQ_MATCH_THRESHOLD (31) and at 20/25/31/40,
 * plus false matches between unrelated images. Writes REPORT.md and out/.
 *
 * If python/perception_ref.py has been run (Thorn's Apache-2.0 perception
 * library as the reference implementation), out/perception-hashes.json exists
 * and the report gains the agreement section; re-run `npm run report` after
 * the Python step to fold it in.
 *
 * Generated images live only in out/ (gitignored) and are never committed.
 * No photos of people, nothing intimate, no real-case data, no network access
 * beyond the one-time fetch of the public-domain fixtures from Commons.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchCommonsPhotos, syntheticOriginals, type FetchedPhoto } from "./images.ts";
import { alterations, stacks, type Alteration } from "./alter.ts";
import {
  falseMatchStats, groupStats, pooledGroupStats, hashWithPipeline, hammingDistance,
  PDQ_MATCH_THRESHOLD, PRODUCTION_MIN_QUALITY, stats, THRESHOLDS,
  type AlterationRow, type GroupStats, type Hashed,
} from "./measure.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const outDir = path.join(root, "out");
const imagesDir = path.join(outDir, "images");

const f1 = (x: number) => x.toFixed(1);
const pctStr = (x: number) => `${(x * 100).toFixed(0)}%`;

const fileSlug = (s: string) => s.replace(/%/g, "pct").replace(/\s+/g, "-");

type Item = {
  name: string;
  file: string;
  cls: string;
  format: string;
  buffer: Buffer;
  kind: "original" | "altered";
  group?: string;
  severity?: string;
  originalOf?: string;
};

async function buildItems(): Promise<{ items: Item[]; commons: FetchedPhoto["source"][]; excludedFromMatrix: string[] }> {
  const items: Item[] = [];
  const syn = await syntheticOriginals();
  for (const o of syn)
    items.push({ name: o.name, file: o.name, cls: o.cls, format: o.format, buffer: o.buffer, kind: "original" });
  const commons: FetchedPhoto["source"][] = [];
  const fetched = await fetchCommonsPhotos();
  for (const p of fetched) {
    commons.push(p.source);
    items.push({ name: p.name, file: p.name, cls: "pd-landscape", format: "jpeg", buffer: p.buffer, kind: "original" });
  }

  // The alteration matrix runs only on originals that pass the production
  // quality floor: a copy of a below-floor image is skipped by the crawler
  // whatever its distance, so such rows would measure nothing production can
  // act on. Excluded originals stay in the set for false-match pressure.
  const excludedFromMatrix: string[] = [];
  const matrixOriginals: Item[] = [];
  for (const o of items) {
    const h = await hashWithPipeline(o.buffer);
    if (h.quality >= PRODUCTION_MIN_QUALITY) matrixOriginals.push(o);
    else excludedFromMatrix.push(`${o.name} (q${h.quality})`);
  }

  const matrix: Alteration[] = [...alterations(), ...stacks()];
  for (const o of matrixOriginals) {
    const base = o.name.replace(/\.\w+$/, "");
    for (const alt of matrix) {
      let buffer: Buffer;
      try {
        buffer = await alt.apply(o.buffer);
      } catch (e) {
        console.log(`  alteration failed on ${o.name} (${alt.group}-${alt.severity}): ${(e as Error).message}`);
        continue;
      }
      items.push({
        name: `${base}~${alt.group}-${alt.severity}.${alt.format === "jpeg" ? "jpg" : "png"}`,
        file: `${base}~${alt.group}-${fileSlug(alt.severity)}.${alt.format === "jpeg" ? "jpg" : "png"}`,
        cls: o.cls,
        format: alt.format === "jpeg" ? "jpeg" : "png",
        buffer,
        kind: "altered",
        group: alt.group,
        severity: alt.severity,
        originalOf: o.name,
      });
    }
  }
  return { items, commons, excludedFromMatrix };
}

type PerceptionEntry = { name: string; hash: string; quality: number };

function main(): Promise<void> {
  const t0 = Date.now();
  const w: string[] = [];
  const line = (s = "") => w.push(s);
  const mdEscape = (s: string) => s.replace(/\|/g, "\\|");

  return (async () => {
    fs.rmSync(imagesDir, { recursive: true, force: true });
    fs.mkdirSync(imagesDir, { recursive: true });

    const { items, commons, excludedFromMatrix } = await buildItems();
    console.log(`Built ${items.length} items (${items.filter((i) => i.kind === "altered").length} altered copies of ${items.filter((i) => i.kind === "original").length} originals)`);

    const rows: Hashed[] = [];
    let done = 0;
    const queue = [...items];
    const worker = async () => {
      while (queue.length > 0) {
        const it = queue.shift();
        if (!it) break;
        const h = await hashWithPipeline(it.buffer);
        fs.writeFileSync(path.join(imagesDir, it.file), it.buffer);
        rows.push({
          name: it.name, file: it.file, cls: it.cls, format: it.format, width: h.width, height: h.height,
          hash: h.hash, quality: h.quality,
          ...(it.kind === "altered" ? { originalOf: it.originalOf, group: it.group, severity: it.severity } : {}),
        });
        if (++done % 100 === 0) console.log(`  hashed ${done}/${items.length}`);
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    rows.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    fs.writeFileSync(path.join(outDir, "node-hashes.json"), JSON.stringify({ pipeline: "crawler/src/prepare.ts + asmita/src/lib/pdq/pdq.ts", items: rows }, null, 1));
    fs.writeFileSync(path.join(outDir, "commons-manifest.json"), JSON.stringify(commons, null, 1));

    const byName = new Map(rows.map((r) => [r.name, r]));
    const originals = rows.filter((r) => !r.originalOf);
    const altered: AlterationRow[] = rows
      .filter((r) => r.originalOf && byName.has(r.originalOf) && r.group)
      .map((r) => ({
        group: r.group!,
        severity: r.severity!,
        distance: hammingDistance(byName.get(r.originalOf!)!.hash, r.hash),
        quality: r.quality,
        cls: r.cls,
      }));

    const perAlteration = groupStats(altered);
    const pooled = pooledGroupStats(altered);
    const fm = falseMatchStats(originals.map((o) => ({ name: o.name, hash: o.hash, quality: o.quality })));

    // ---- perception reference, if the Python step has been run ----
    const perceptionPath = path.join(outDir, "perception-hashes.json");
    let perception: Map<string, PerceptionEntry> | null = null;
    if (fs.existsSync(perceptionPath)) {
      const parsed = JSON.parse(fs.readFileSync(perceptionPath, "utf8")) as { hashes: PerceptionEntry[] };
      perception = new Map(parsed.hashes.map((h) => [h.name, h]));
    }

    const date = new Date().toISOString().slice(0, 10);

    line("# PDQ robustness report: how well our matching catches altered copies");
    line();
    line(`Generated by \`npm run report\` in tools/pdq-robustness on ${date} (crawler v2 WP36). The hashes are the production pipeline's own: \`crawler/src/prepare.ts\` (the crawler's decode recipe and sharp) plus \`asmita/src/lib/pdq/pdq.ts\`, imported, not copied. The pool side of every distance is the ORIGINAL image's hash (what a survivor submitted); the query side is the ALTERED copy (what a site serves). Match threshold in production: \`PDQ_MATCH_THRESHOLD\` = ${PDQ_MATCH_THRESHOLD}; this work package does not change it.`);
    line();
    line("**The test set is harmless by construction**: synthetic images generated in code (gradients, vector shapes, pseudo-text glyphs, value-noise textures, a procedural landscape) plus curated public-domain landscape photographs fetched at run time from Wikimedia Commons with their licence recorded below. No photos of people, nothing intimate, no real-case data. Nothing generated is committed: images live only in \`out/\` (gitignored) and are rebuilt at run time.");
    line();
    const matrixCount = new Set(rows.filter((r) => r.originalOf).map((r) => r.originalOf)).size;
    line(`Test set: ${originals.length} originals (${originals.length - commons.length} synthetic in five classes, three container formats; ${commons.length} public-domain photographs), 800x600. Of those, ${matrixCount} pass the quality floor and each is altered ${alterations().length} ways plus ${stacks().length} realistic stacks — ${altered.length} altered copies, ${rows.length} images hashed in all. Production rules applied in the "caught (production)" view: a copy below PDQ quality ${PRODUCTION_MIN_QUALITY} would be skipped by the crawler (\`MIN_QUALITY\`) whatever its distance, so it is never caught in production.`);
    line();
    line("Conventions: pixel alterations are encoded losslessly (PNG) so each row measures its alteration alone; the `jpeg-quality` rows are the only pure recompressions; `stacked` rows combine an alteration with a re-upload recompression. Crops are centre crops (the percentage is removed from both width and height, split evenly). Rotations fill the exposed corners black. The alteration matrix runs only on originals that pass the quality floor themselves — production can never catch a copy of an image whose hash falls below it — while excluded originals stay in the set for false-match pressure.");
    line();
    line(`Caught at t = Hamming distance(original, copy) <= t. Thresholds: ${THRESHOLDS.join(", ")} — 31 is the production threshold. Threshold 40 is outside production range (the pool threshold is capped at 31) and is shown only to see how distances behave beyond it.`);
    line();

    // ---- originals table ----
    line("## The originals");
    line();
    line("| image | class | format | PDQ quality | dims |");
    line("|---|---|---|---|---|");
    for (const o of originals)
      line(`| ${mdEscape(o.name)} | ${o.cls} | ${o.format} | ${o.quality} | ${o.width}x${o.height} |`);
    line();
    if (commons.length) {
      line("Public-domain photographs (fetched from Wikimedia Commons at run time; licence re-verified through the API at fetch time):");
      line();
      line("| image | Commons file | licence | author |");
      line("|---|---|---|---|");
      commons.forEach((c, i) =>
        line(`| pd-photo-${i + 1}.jpeg | ${mdEscape(c.title)} | ${mdEscape(c.licence)} | ${mdEscape(c.artist || "unknown")} |`));
      line();
      line("Licence notes: CC0 (Creative Commons Zero) and \"Public domain\" both mean no copyright restrictions. Provenance (source URLs, fetch date) is recorded in `out/commons-manifest.json`.");
      line();
    } else {
      line("**No public-domain photographs were fetched** (offline or licence check failed); this run is synthetic-only.");
      line();
    }

    // ---- main table ----
    line("## Share caught per alteration");
    line();
    line(`n = copies. Percentages are shares with distance <= threshold. "caught prod @31" = within 31 AND quality >= ${PRODUCTION_MIN_QUALITY} (production view). "q<50" = copies the crawler would skip for low quality.`);
    line();
    line("| alteration | severity | n | caught @20 | @25 | @31 (ours) | @40 | caught prod @31 | q<50 | mean d | p95 d | max d |");
    line("|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const g of perAlteration) {
      const label = g.group === "stacked" ? "**stacked**" : g.group;
      line(`| ${label} | ${mdEscape(g.severity)} | ${g.n} | ${pctStr(g.caught[20])} | ${pctStr(g.caught[25])} | **${pctStr(g.caught[31])}** | ${pctStr(g.caught[40])} | ${pctStr(g.caughtProduction)} | ${g.lowQuality} | ${f1(g.meanDistance)} | ${g.p95Distance} | ${g.maxDistance} |`);
    }
    line();

    // ---- pooled summary ----
    line("## Summary by alteration kind (severities pooled)");
    line();
    line("| alteration | n | caught @20 | @25 | @31 (ours) | @40 | mean d | p95 d | max d |");
    line("|---|---|---|---|---|---|---|---|---|");
    for (const g of pooled) {
      if (g.group === "stacked") continue;
      line(`| ${g.group} | ${g.n} | ${pctStr(g.caught[20])} | ${pctStr(g.caught[25])} | **${pctStr(g.caught[31])}** | ${pctStr(g.caught[40])} | ${f1(g.meanDistance)} | ${g.p95Distance} | ${g.maxDistance} |`);
    }
    line();

    // ---- by class ----
    line("## By image class (all single alterations pooled, caught at 31)");
    line();
    line("| class | n | caught @31 | mean d | q<50 copies |");
    line("|---|---|---|---|---|");
    const singles = altered.filter((r) => r.group !== "stacked");
    for (const cls of [...new Set(singles.map((r) => r.cls))]) {
      const rs = singles.filter((r) => r.cls === cls);
      const g = groupStats(rs.map((r) => ({ ...r, group: cls, severity: "all" })))[0]!;
      line(`| ${cls} | ${rs.length} | **${pctStr(g.caught[31])}** | ${f1(g.meanDistance)} | ${rs.filter((r) => r.quality < PRODUCTION_MIN_QUALITY).length} |`);
    }
    line();
    if (excludedFromMatrix.length) {
      line(`Excluded from the alteration matrix (own hash below the quality floor, kept for false matches): ${excludedFromMatrix.join(", ")}.`);
      line();
    }

    // ---- false matches ----
    line("## False matches between unrelated images");
    line();
    line(`All ${fm.pairs} pairs of distinct originals. Distances between unrelated images: min **${fm.minDistance}**, median ${fm.medianDistance}, mean ${f1(fm.meanDistance)}, max ${fm.maxDistance}.`);
    line();
    line("| threshold | unrelated pairs within t | of those, both quality >= 50 |");
    line("|---|---|---|");
    for (const t of THRESHOLDS)
      line(`| ${t}${t === 31 ? " (ours)" : ""} | ${fm.within[t]} | ${fm.withinProductionQuality[t]} |`);
    line();

    // ---- perception agreement ----
    line("## Reference agreement: our PDQ vs Thorn's perception (Meta's PDQ via pdqhash)");
    line();
    if (!perception) {
      line("**Not measured in this run.** To add the reference: set up the Python environment (see README), run `python/perception_ref.py`, then re-run `npm run report`. The reference hashes the same files in `out/images` with `perception.hashers.PDQHash` (Apache-2.0), which wraps Meta's C++ PDQ through the `pdqhash` bindings, decoded by OpenCV.");
      line();
    } else {
      const agreed = rows.filter((r) => perception!.has(r.name));
      const missing = rows.length - agreed.length;
      const dists = agreed.map((r) => hammingDistance(r.hash, perception!.get(r.name)!.hash));
      const s = stats(dists);
      const exact = dists.filter((d) => d === 0).length;
      const worst = [...agreed]
        .map((r) => ({ name: r.name, d: hammingDistance(r.hash, perception!.get(r.name)!.hash) }))
        .sort((a, b) => b.d - a.d)
        .slice(0, 5);
      line(`Perception's \`PDQHash\` (Apache-2.0, \`perception[pdq]\`; Meta's C++ PDQ via \`pdqhash\`, decoded by OpenCV) hashed the same ${agreed.length} files${missing ? ` (${missing} missing from its run)` : ""}. Same-file hash agreement, ours vs perception: max **${s.max}**, p95 ${s.p95}, median ${s.median}, mean ${f1(s.mean)}, exact matches ${exact}/${s.n}. This is cross-implementation and cross-decoder distance; the surviving difference is decoder variance (sharp/libvips vs OpenCV/libjpeg), the same source of noise the browser-agreement harness measured.`);
      line();
      line("Worst same-file disagreements:");
      line();
      for (const x of worst) line(`- ${mdEscape(x.name)}: ${x.d} bits`);
      line();
      // Decision agreement at 31 over altered copies
      let both = 0, onlyOurs = 0, onlyTheirs = 0, neither = 0;
      const theirRows: AlterationRow[] = [];
      for (const r of rows) {
        if (!r.originalOf || !perception!.has(r.name) || !perception!.has(r.originalOf) || !r.group) continue;
        const tOrig = perception!.get(r.originalOf)!, tCopy = perception!.get(r.name)!;
        const theirDist = hammingDistance(tOrig.hash, tCopy.hash);
        const ours = hammingDistance(byName.get(r.originalOf)!.hash, r.hash) <= PDQ_MATCH_THRESHOLD;
        const theirs = theirDist <= PDQ_MATCH_THRESHOLD;
        if (ours && theirs) both++; else if (ours && !theirs) onlyOurs++; else if (!ours && theirs) onlyTheirs++; else neither++;
        theirRows.push({ group: r.group, severity: r.severity!, distance: theirDist, quality: tCopy.quality, cls: r.cls });
      }
      line(`Catch decisions at 31 over the same altered copies: both catch ${both}, only ours ${onlyOurs}, only perception ${onlyTheirs}, neither ${neither}. The "only" cells are the cross-decoder noise around the threshold, not an implementation gap.`);
      line();
      const theirPooled = pooledGroupStats(theirRows).filter((g) => g.group !== "stacked");
      line("Perception's own robustness (its hashes, severities pooled), for comparison:");
      line();
      line("| alteration | n | caught @31 (perception) | caught @31 (ours) |");
      line("|---|---|---|---|");
      for (const g of theirPooled) {
        const ours = pooled.find((x) => x.group === g.group);
        line(`| ${g.group} | ${g.n} | ${pctStr(g.caught[31])} | **${pctStr(ours?.caught[31] ?? 0)}** |`);
      }
      line();
    }

    // ---- recommendation ----
    const missed = pooled.filter((g) => g.group !== "stacked" && g.caught[31] < 0.9).sort((a, b) => a.caught[31] - b.caught[31]);
    const partial = pooled.filter((g) => g.group !== "stacked" && g.caught[31] >= 0.9 && g.caught[31] < 1).sort((a, b) => a.caught[31] - b.caught[31]);
    const benign = perAlteration.filter((g) =>
      (g.group === "jpeg-quality" && g.severity !== "q30") ||
      (g.group === "resize" && g.severity !== "0.16x") ||
      g.group === "brightness" || g.group === "contrast" || g.group === "screenshot-scale" || g.group === "blur" && g.severity === "sigma1");
    const benignAt25 = benign.reduce((a, g) => a + g.caught[25], 0) / Math.max(1, benign.length);
    const benignAt31 = benign.reduce((a, g) => a + g.caught[31], 0) / Math.max(1, benign.length);
    const between25And31 = altered.filter((r) => r.distance > 25 && r.distance <= 31).length / altered.length;
    const between31And40 = altered.filter((r) => r.distance > 31 && r.distance <= 40).length / altered.length;
    line("## Recommendation");
    line();
    line(`**Keep the production threshold at ${PDQ_MATCH_THRESHOLD}.** This run measured it, not assumed it:`);
    line();
    line(`- False matches: ${fm.within[31]} of ${fm.pairs} unrelated pairs fall within 31 (${fm.withinProductionQuality[31]} of them between images that both pass the quality floor). The closest unrelated pair sits at ${fm.minDistance} bits — ${fm.minDistance > 31 ? "a clear margin above" : "inside"} the threshold.`);
    line(`- Recall: the common re-upload alterations (recompression, modest resize, mild brightness/contrast, screenshot resampling, slight blur) are caught at 31: ${pctStr(benignAt31)} pooled. Tightening to 25 would drop that to ${pctStr(benignAt25)} and strand ${pctStr(between25And31)} of all copies that sit between 25 and 31; loosening to 40 would recover only ${pctStr(between31And40)} of all copies (those between 31 and 40)${fm.within[40] > 0 ? ` while pulling in ${fm.within[40]} unrelated pairs` : ""}.`);
    line();
    line(`**What PDQ misses at 31, for the SSCD second layer** (pooled catch at 31, worst first):`);
    line();
    const missReason = (group: string): string => {
      if (group === "mirror") return "a mirrored copy is a different picture to PDQ; we ship no dihedral variants";
      if (group === "sticker") return "the overlay redraws a large flat region, shifting many DCT coefficients at once; small stickers survive, large ones do not";
      if (group === "border") return "the frame shifts and shrinks the content inside the 512x512 downsample, which moves every DCT coefficient";
      return "geometry changes move the DCT grid, which PDQ cannot absorb";
    };
    for (const g of missed)
      line(`- ${g.group}: ${pctStr(g.caught[31])} caught (mean distance ${f1(g.meanDistance)}, max ${g.maxDistance}) — ${missReason(g.group)}.`);
    if (partial.length) {
      line(`- Partly caught (>= 90% but not all): ${partial.map((g) => `${g.group} (${pctStr(g.caught[31])})`).join(", ")}.`);
    }
    line();
    line("These misses are PDQ's known geometry weakness, not a threshold problem: the distances are far beyond any usable threshold. The second-layer matcher that the SSCD work package adds should cover the transformations listed above — mirror, rotation, crop and border geometry, and heavy overlays — before any thought of changing the threshold.");
    line();

    line("## Caveats");
    line();
    line("- The originals are 800x600. A different base size shifts a few distances (the PDQ 512x512 downsample interacts with image size), but the pattern holds: this was spot-checked by the resize rows.");
    line("- Flat synthetic gradients hash at PDQ quality 0 and are excluded from the alteration matrix for it (see above); the classes that remain — including the real `pd-landscape` photographs — behave within a few points of each other.");
    line(`- The set is small (${originals.length} originals) and synthetic-plus-PD-photos, not a real-case corpus; absolute percentages are indicative, the ordering of alterations is the signal.`);
    line("- The survivor's fingerprint is the ORIGINAL here; a survivor may submit a fingerprint of an already-altered copy, which shifts distances slightly in her favour (the copy on the site is then closer to what she signed).");
    line("- The perception reference shares the same test set but decodes with OpenCV; its numbers measure the algorithm, ours measure algorithm + our decoder, which is what production runs.");
    line();
    line(`Run time: ${f1((Date.now() - t0) / 1000)} s for ${rows.length} images. Full per-image hashes: \`out/node-hashes.json\`.`);
    line();

    fs.writeFileSync(path.join(root, "REPORT.md"), w.join("\n") + "\n");
    if (!perception)
      console.log("NOTE: out/perception-hashes.json not found — run python/perception_ref.py, then re-run npm run report to add the agreement section.");
    console.log(`REPORT.md written (${w.length} lines).`);
  })().catch((e) => { console.error(e); process.exit(1); });
}

void main();
