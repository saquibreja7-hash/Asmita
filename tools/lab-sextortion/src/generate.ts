import { sortSextortionLabels } from "../../../asmita/src/lib/lab/sextortion/taxonomy.ts";
import { applyNoise } from "./noise.ts";
import { rowRng } from "./rng.ts";
import { SLOTS } from "./slots.ts";
import { FAMILIES, SCRIPT_TAGS, type Family, type ScriptTag } from "./templates.ts";
import type { DatasetRow } from "./dataset.ts";

/*
 * WP116 (docs/research/research-tools-spec.md, Track D): the deterministic
 * synthetic training data generator.
 *
 * The seed is a fixed constant (the spec's owner-approval date), recorded in
 * the manifest and later in the WP117 model file. Every row's choices come
 * from its own seeded RNG stream keyed by (seed, family, script, index), so
 * the dataset is byte-identical on every run and machine, and WP117 can
 * regenerate it exactly.
 *
 * Composition: pick a family (its quota fixes how many rows), a script, a
 * template frame, then fill each `{slot}` from that slot's pool in the
 * row's script form. `{slot?}` is optional: half the rows using that frame
 * skip it, and a skipped slot adds no label. Mixed script reuses the
 * romanised frame and flips each slot to Devanagari half the time. A share
 * of rows then get one or two character-level noise operators (noise.ts).
 *
 * Content guarantees (checked in validate.ts): the generator can only
 * produce text from its own templates and slot pools — a closed vocabulary,
 * so no slur, real name or real number can appear — and MINOR_SIGNAL rows
 * only ever contain a stated age or school context.
 */

export const GENERATOR_SEED = 20261122;
export const GENERATOR_VERSION = 1;

/** How the quota splits across the four scripts: evenly, remainders first. */
export function scriptQuotas(quota: number): Record<ScriptTag, number> {
  const per = Math.floor(quota / SCRIPT_TAGS.length);
  const extra = quota % SCRIPT_TAGS.length;
  const result = {} as Record<ScriptTag, number>;
  SCRIPT_TAGS.forEach((script, index) => {
    result[script] = per + (index < extra ? 1 : 0);
  });
  return result;
}

function templateListFor(family: Family, script: ScriptTag): string[] {
  // Mixed reuses the romanised frames; each slot may flip to Devanagari.
  return family.templates[script === "mixed" ? "romanised" : script];
}

function slotForm(value: { dev: string; rom: string; en: string }, script: ScriptTag, coin: () => boolean): string {
  if (script === "devanagari") return value.dev;
  if (script === "english") return value.en;
  if (script === "romanised") return value.rom;
  return coin() ? value.dev : value.rom;
}

/** Tidy up after optional slots resolve to nothing: squeeze whitespace, fix punctuation spacing. */
function cleanup(text: string): string {
  let out = text.replace(/\s+/g, " ").trim();
  // No space before punctuation ("50000 ।" → "50000।"). Never re-spaced
  // after a dot: "cybercrime.gov.in" must stay intact.
  out = out.replace(/\s+([.,।!?;:])/gu, "$1");
  out = out.replace(/\s+/g, " ").trim();
  // A sentence that lost its optional slot can end in a bare comma or colon,
  // or leave an empty reference like "( )".
  out = out.replace(/[,;]\s*$/, "").replace(/^[,;]\s*/, "");
  out = out.replace(/\(\s*\)/g, "");
  return out.trim();
}

/** Fill one frame for one row. Exposed for tests. */
export function composeRow(
  family: Family,
  script: ScriptTag,
  index: number,
  options: { seed?: number; noise?: boolean } = {},
): DatasetRow {
  const rng = rowRng(options.seed ?? GENERATOR_SEED, family.id, script, index);
  const frame = templateListFor(family, script);
  const template = rng.pick(frame);
  const labels = new Set<string>(family.baseLabels);
  let text = template.replace(/\{(\w+)(\?)?\}/g, (_match, name: string, optional: string) => {
    const pool = SLOTS[name];
    if (!pool) throw new Error(`unknown slot {${name}} in family ${family.id}`);
    if (optional === "?") {
      // Half the rows using this frame skip the optional part entirely.
      if (rng.chance(0.5)) return "";
    }
    const value = rng.pick(pool);
    if (value.label) labels.add(value.label);
    return slotForm(value, script, () => rng.chance(0.5));
  });
  text = cleanup(text);
  if (text.length === 0) throw new Error(`empty row in family ${family.id}`);
  // MINOR_SIGNAL rows keep their exact wording: minor routing is rule-based
  // (WP93's mentionsMinor runs before the model) and the age or school
  // statement must stay recognisable. Noise adds nothing there.
  if (!labels.has("MINOR_SIGNAL") && options.noise !== false && rng.chance(0.4)) text = applyNoise(text, rng);
  const kind = family.kind;
  // Coherence: a threat row never carries NOT_THREAT, a negative row always does.
  if (kind === "negative") labels.add("NOT_THREAT");
  else labels.delete("NOT_THREAT");
  return {
    id: `g-${family.id}-${script}-${index}`,
    kind,
    family: family.id,
    script,
    labels: sortSextortionLabels([...labels]),
    text,
  };
}

/** The full dataset, deterministically: family by family, script by script. */
export function generateDataset(options: { noise?: boolean } = {}): DatasetRow[] {
  const rows: DatasetRow[] = [];
  for (const family of FAMILIES) {
    const quotas = scriptQuotas(family.quota);
    for (const script of SCRIPT_TAGS) {
      for (let index = 0; index < quotas[script]; index++) {
        rows.push(composeRow(family, script, index, options));
      }
    }
  }
  return rows;
}
