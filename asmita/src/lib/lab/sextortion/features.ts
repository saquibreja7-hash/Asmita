import { lexiconMatches } from "./lexicon";
import { normaliseMessage } from "./normalise";

/*
 * WP117 (docs/research/research-tools-spec.md, Track D): the hashed feature
 * extraction for the sextortion classifier.
 *
 * ONE implementation serves both sides, so training and inference can never
 * drift apart: the trainer (tools/lab-sextortion/src/train.ts) imports this
 * file from the app tree, exactly like the Worker-side classifier
 * (classify.ts) does. Relative imports only, so the offline tool (tsx, no
 * "@" alias) can load it.
 *
 * Features, all hashed into one space with FNV-1a:
 * - character 2–5-grams over BOTH script views (the original-script view and
 *   the romanised view), so Devanagari and romanised Hinglish wording of the
 *   same phrase produce overlapping features;
 * - word uni- and bi-grams over the normalised original-script view;
 * - one feature per lexicon label whose terms match (lexicon.ts).
 *
 * Pure functions, no I/O, deterministic: the same text always yields the
 * same buckets on every machine.
 */

/** Character n-gram sizes over both script views (spec: 2–5-grams). */
export const CHAR_NGRAM_SIZES = [2, 3, 4, 5] as const;

// Word splitting and trimming mirror tools/lab-sextortion/src/dataset.ts
// (the token vocabulary of the generator), plus the Devanagari danda.
// \p{M} (combining marks) is a LETTER here: Devanagari vowel signs (मेरे,
// भेजो) are marks, and stripping them as "punctuation" would cut every
// Devanagari word at its last matra.
const WORD_SPLIT = /[\s.,!?;:()"'\u201c\u201d\u2026\-–—।]+/u;
const WORD_TRIM = /^[^\p{L}\p{M}\p{N}₹@]+|[^\p{L}\p{M}\p{N}₹@]+$/gu;

/** Content tokens of a view: punctuation and stray markers stripped. */
export function wordTokens(view: string): string[] {
  return view
    .split(WORD_SPLIT)
    .map((token) => token.replace(WORD_TRIM, ""))
    .filter((token) => token.length > 0);
}

function addCharGrams(view: string, out: Set<string>) {
  for (const n of CHAR_NGRAM_SIZES) {
    if (view.length < n) continue;
    for (let start = 0; start + n <= view.length; start++) {
      out.add(`c${n}:${view.slice(start, start + n)}`);
    }
  }
}

function addWordGrams(view: string, out: Set<string>) {
  const tokens = wordTokens(view);
  for (let i = 0; i < tokens.length; i++) {
    out.add(`w:${tokens[i]}`);
    if (i + 1 < tokens.length) out.add(`b:${tokens[i]} ${tokens[i + 1]}`);
  }
}

/**
 * Every feature string of a message: character 2–5-grams over both script
 * views, word uni/bi-grams, and one feature per matched lexicon term (plus
 * the per-label bit). Exposed for tests and for the trainer's diagnostics;
 * inference uses the hashed form below.
 */
export function featureStrings(text: string): Set<string> {
  const views = normaliseMessage(text);
  const out = new Set<string>();
  addCharGrams(views.normalised, out);
  addCharGrams(views.romanised, out);
  addWordGrams(views.normalised, out);
  for (const match of lexiconMatches(views)) {
    out.add(`l:${match.label}`);
    out.add(`lt:${match.term}`);
  }
  return out;
}

/** FNV-1a 32-bit over the feature string (same construction as the generator's row seeds). */
export function hashFeatureString(feature: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < feature.length; i++) {
    hash ^= feature.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * The hashed feature buckets of a message: unique, ascending. `hashBits`
 * must be a power of two (the model file declares it; decode validates it).
 */
export function extractFeatureBuckets(text: string, hashBits: number): number[] {
  const mask = hashBits - 1;
  const buckets = new Set<number>();
  for (const feature of featureStrings(text)) {
    buckets.add(hashFeatureString(feature) & mask);
  }
  return [...buckets].sort((a, b) => a - b);
}
