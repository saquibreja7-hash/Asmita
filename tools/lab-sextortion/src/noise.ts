import type { Rng } from "./rng.ts";

/*
 * WP116 (docs/research/research-tools-spec.md, Track D): typo and spacing
 * noise for the synthetic training data generator.
 *
 * Every operator only MUTATES characters inside words that are already
 * there: it can never introduce a new word, a new script or new meaning.
 * That property is what the closed-vocabulary check relies on (see
 * validate.ts): with noise off, every generated token comes from the
 * generator's own templates and slots, and noise can only shuffle what
 * those tokens contain.
 *
 * The normaliser (asmita/src/lib/lab/sextortion/normalise.ts) is built to
 * undo most of this noise, and the generator deliberately produces it so
 * the classifier (WP117) sees messages as people actually type them.
 */

function wordAt(text: string, index: number): { start: number; end: number } {
  const isWord = (char: string) => /[\p{L}\p{N}]/u.test(char);
  let start = index;
  while (start > 0 && isWord(text[start - 1])) start--;
  let end = index;
  while (end < text.length && isWord(text[end])) end++;
  return { start, end };
}

/** Swap two adjacent letters inside one word (i and i+1 both letters). */
export function swapLetters(text: string, index: number): string {
  const { start, end } = wordAt(text, index);
  if (end - start < 3) return text;
  const inner = index < end - 1 ? index : index - 1;
  const a = text[inner];
  const b = text[inner + 1];
  if (!/[\p{L}]/u.test(a) || !/[\p{L}]/u.test(b)) return text;
  return text.slice(0, inner) + b + a + text.slice(inner + 2);
}

/** Drop one letter from a word (length >= 4 only, so the word stays readable). */
export function dropLetter(text: string, index: number): string {
  const { start, end } = wordAt(text, index);
  if (end - start < 4) return text;
  if (index >= end) return text;
  return text.slice(0, index) + text.slice(index + 1);
}

/** Triple one letter inside a word ("plz" → "plzz"→ here "plzzz"). */
export function repeatLetter(text: string, index: number): string {
  if (!/[\p{L}]/u.test(text[index] ?? "")) return text;
  return text.slice(0, index) + text[index] + text[index] + text.slice(index);
}

/** Replace a letter with the unambiguous digit people type for it ("paise" → "p4ise"). */
export function letterToDigit(text: string, index: number): string {
  const map: Record<string, string> = { a: "4", e: "3", o: "0", s: "5" };
  const char = text[index];
  if (char === undefined || !/[\p{L}]/u.test(char)) return text;
  const lower = char.toLowerCase();
  const digit = map[lower];
  if (digit === undefined) return text;
  const { start, end } = wordAt(text, index);
  // Only inside a word of at least three letters, never at its edges.
  if (end - start < 3 || index === start || index === end - 1) return text;
  return text.slice(0, index) + digit + text.slice(index + 1);
}

/** Glue two words together by removing the space between them. */
export function dropSpace(text: string): string {
  const at = text.indexOf(" ");
  if (at === -1) return text;
  return text.slice(0, at) + text.slice(at + 1);
}

/** Hide a zero-width space inside a word, the documented filter-dodging trick. */
export function insertZeroWidth(text: string, index: number): string {
  const { start, end } = wordAt(text, index);
  if (end <= start) return text;
  const inner = Math.max(start + 1, Math.min(index, end - 1));
  return text.slice(0, inner) + "\u200B" + text.slice(inner);
}

export const NOISE_OPS = [
  swapLetters,
  dropLetter,
  repeatLetter,
  letterToDigit,
  dropSpace,
  insertZeroWidth,
] as const;

/**
 * Apply one or two noise operators at deterministic positions. The RNG
 * decides IF noise happens; the positions come from the same stream, so the
 * same row always gets the same noise. Text with no safe position for an
 * operator comes back unchanged (operators guard themselves).
 */
export function applyNoise(text: string, rng: Rng): string {
  let out = text;
  const rounds = rng.chance(0.12) ? 2 : 1;
  for (let round = 0; round < rounds; round++) {
    const op = NOISE_OPS[rng.int(NOISE_OPS.length)];
    if (op === dropSpace) {
      out = dropSpace(out);
      continue;
    }
    const position = rng.int(out.length);
    out = op(out, position);
  }
  return out;
}
