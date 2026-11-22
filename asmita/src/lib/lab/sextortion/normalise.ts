/*
 * WP116 (docs/research/research-tools-spec.md, Track D): text normalisation
 * and a deterministic Devanagari romanisation for the sextortion classifier.
 *
 * Pure functions, no dependencies, no I/O: the same input always gives the
 * same output, on every machine. Nothing here stores or sends anything.
 *
 * The classifier (WP117) extracts features from TWO views of every message:
 * - `normalised`: the original script (Devanagari stays Devanagari), NFC,
 *   lowercased Latin, look-alike characters folded, repeated letters
 *   collapsed, whitespace squeezed — the "as written" view, cleaned.
 * - `romanised`: the same text with every Devanagari character mapped through
 *   a small fixed ITRANS-like table, so Devanagari and romanised Hinglish
 *   produce comparable character n-grams.
 *
 * Both views keep the message in memory only, like the rest of the Lab.
 */

export interface NormalisedMessage {
  /** Cleaned text in the original script. */
  normalised: string;
  /** The same text with Devanagari romanised; Latin passes through. */
  romanised: string;
}

/*
 * 1. Invisible and directional characters: stripped, never folded. A blackmailer
 * pasting zero-width characters between letters to dodge keyword filters is a
 * documented evasion trick; the normaliser makes it useless.
 */
const INVISIBLE = /[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

/*
 * 2. Look-alike characters folded to their ASCII or ASCII-digit meaning, as a
 * single code point each. Kept deliberately small: these are the homoglyphs
 * that actually appear in South Asian chat text (Cyrillic a/e/o/p/c/x, the
 * fullwidth ASCII block, Devanagari digits written as words).
 */
const LOOKALIKES: Record<string, string> = {
  // Cyrillic letters shaped like Latin ones.
  "\u0430": "a", "\u0435": "e", "\u043E": "o", "\u0440": "p", "\u0441": "c", "\u0445": "x",
  "\u0456": "i", "\u0458": "j",
  "\u0410": "a", "\u0415": "e", "\u041E": "o", "\u0420": "p", "\u0421": "c", "\u0425": "x",
  "\u0406": "i", "\u0408": "j",
  // Devanagari digits (amounts written ५०,०००).
  "\u0966": "0", "\u0967": "1", "\u0968": "2", "\u0969": "3", "\u096A": "4",
  "\u096B": "5", "\u096C": "6", "\u096D": "7", "\u096E": "8", "\u096F": "9",
};

/*
 * 3. Digits standing in for letters, only where the reading is unambiguous
 * (0→o, 3→e, 4→a, 5→s): mapped only when the digit sits BETWEEN two ASCII
 * letters of the same word ("p4ise" → "paise"). Token-edge digits stay
 * digits, so amounts ("50000"), dates ("24 ghante") and 98XXXXXX00-style
 * placeholder numbers are never rewritten. 1, 2, 6, 7, 8, 9 have two
 * plausible readings each and are never mapped.
 */
const DIGIT_AS_LETTER: Record<string, string> = { "0": "o", "3": "e", "4": "a", "5": "s" };
const ASCII_WORD = /[a-z]+[0-9]+[a-z]+/g;
const UNAMBIGUOUS_DIGITS = /[0345]/;

/*
 * 4. Repeated letters collapsed to two ("plzzz" → "plzz", "kya huaaaa" →
 * "kya huaa"). Runs of the same ASCII letter or Devanagari character; digits
 * and punctuation are never collapsed. Two are kept, not one: Hindi and
 * Hinglish genuinely distinguish long vowels in writing ("maaf" vs "maa").
 */
const REPEATS = /([\u0061-\u007A\u0900-\u097F])\1{2,}/g;

function foldLookalikes(text: string) {
  let out = "";
  for (const char of text) {
    const mapped = LOOKALIKES[char];
    if (mapped !== undefined) out += mapped;
    else if (/[\uFF01-\uFF5A]/.test(char)) {
      // Fullwidth block: subtract 0xFEE0 per position (Ａ→A, ａ→a, ０→0).
      const code = char.codePointAt(0)! - 0xfee0;
      out += String.fromCodePoint(code);
    } else out += char;
  }
  return out;
}

function mapDigitsAsLetters(text: string) {
  return text.replace(ASCII_WORD, (token) => {
    let out = "";
    for (let i = 0; i < token.length; i++) {
      const char = token[i];
      if (UNAMBIGUOUS_DIGITS.test(char) && DIGIT_AS_LETTER[char] !== undefined && /[a-z]/.test(token[i - 1] ?? "") && /[a-z]/.test(token[i + 1] ?? "")) {
        out += DIGIT_AS_LETTER[char];
      } else out += char;
    }
    return out;
  });
}

/*
 * 5. Devanagari → Latin: a fixed ITRANS-like table, one character at a time.
 * Consonants emit an implicit "a" (strict ITRANS: करना → "karanaa") unless a
 * virama (्) or a vowel sign follows. There is no schwa deletion and no
 * machine learning: the goal is a deterministic second view for character
 * n-grams, not a phonetically perfect transcription. Latin text inside a
 * Devanagari message (real messages are code-mixed) passes through as is.
 */
const VOWELS: Record<string, string> = {
  "\u0905": "a", "\u0906": "aa", "\u0907": "i", "\u0908": "ii", "\u0909": "u", "\u090A": "uu",
  "\u090B": "ri", "\u090F": "e", "\u0910": "ai", "\u0913": "o", "\u0914": "au",
  "\u090D": "e", "\u090E": "e", "\u0911": "o", "\u0912": "o",
};

const MATRAS: Record<string, string> = {
  "\u093E": "aa", "\u093F": "i", "\u0940": "ii", "\u0941": "u", "\u0942": "uu",
  "\u0943": "ri", "\u0947": "e", "\u0948": "ai", "\u094B": "o", "\u094C": "au",
  "\u0945": "e", "\u0946": "e", "\u0949": "o", "\u094A": "o",
};

const CONSONANTS: Record<string, string> = {
  "\u0915": "k", "\u0916": "kh", "\u0917": "g", "\u0918": "gh", "\u0919": "n",
  "\u091A": "ch", "\u091B": "chh", "\u091C": "j", "\u091D": "jh", "\u091E": "n",
  "\u091F": "t", "\u0920": "th", "\u0921": "d", "\u0922": "dh", "\u0923": "n",
  "\u0924": "t", "\u0925": "th", "\u0926": "d", "\u0927": "dh", "\u0928": "n",
  "\u092A": "p", "\u092B": "ph", "\u092C": "b", "\u092D": "bh", "\u092E": "m",
  "\u092F": "y", "\u0930": "r", "\u0932": "l", "\u0935": "v", "\u0936": "sh",
  "\u0937": "sh", "\u0938": "s", "\u0939": "h", "\u0958": "q", "\u0959": "kh",
  "\u095A": "g", "\u095B": "z", "\u095C": "d", "\u095D": "dh", "\u095E": "f",
  "\u0929": "n", "\u0931": "r", "\u0933": "l",
};

const OTHERS: Record<string, string> = {
  "\u0902": "n", "\u0901": "n", "\u0903": "h", "\u093C": "", "\u094D": "",
  "\u0964": ".", "\u0965": ".", "\u093D": "'", "\u0950": "om",
};

const DEVANAGARI_DIGITS: Record<string, string> = {
  "\u0966": "0", "\u0967": "1", "\u0968": "2", "\u0969": "3", "\u096A": "4",
  "\u096B": "5", "\u096C": "6", "\u096D": "7", "\u096E": "8", "\u096F": "9",
};

const VIRAMA = "\u094D";
const NUKTA = "\u093C";

/*
 * A nukta written as a combining mark (फ + ़) survives NFC uncomposed — NFC
 * only composes it for the precomposed code points some keyboards emit —
 * so the romaniser folds the mark itself. Urdu-loan dotted consonants.
 */
const NUKTA_FORMS: Record<string, string> = {
  "\u0915": "q", "\u0916": "k", "\u0917": "g", "\u091C": "z", "\u0921": "d",
  "\u0922": "dh", "\u092B": "f", "\u092F": "y",
};

function isKeyOf(map: Record<string, string>, char: string) {
  return Object.prototype.hasOwnProperty.call(map, char);
}

export function romaniseDevanagari(text: string): string {
  // NFC first: nukta forms (फ़ = फ + ़) must be single code points for the
  // consonant table to see them, whichever way the caller stored them.
  const source = text.normalize("NFC");
  let out = "";
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (isKeyOf(CONSONANTS, char)) {
      let base = CONSONANTS[char];
      let next = source[i + 1];
      if (next === NUKTA && isKeyOf(NUKTA_FORMS, char)) {
        base = NUKTA_FORMS[char];
        next = source[i + 2];
      }
      out += base;
      // Implicit "a" unless the next character is a vowel sign or a virama.
      if (!next || !(isKeyOf(MATRAS, next) || next === VIRAMA)) out += "a";
    } else if (isKeyOf(MATRAS, char)) out += MATRAS[char];
    else if (isKeyOf(VOWELS, char)) out += VOWELS[char];
    else if (isKeyOf(OTHERS, char)) out += OTHERS[char];
    else if (isKeyOf(DEVANAGARI_DIGITS, char)) out += DEVANAGARI_DIGITS[char];
    else out += char;
  }
  return out;
}

/**
 * Normalise a pasted message into both feature views. Deterministic, pure,
 * and safe on any input: an empty string normalises to empty views.
 */
export function normaliseMessage(input: string): NormalisedMessage {
  const nfc = input.normalize("NFC");
  const stripped = nfc.replace(INVISIBLE, "");
  const folded = foldLookalikes(stripped);
  const lower = folded.toLowerCase();
  const collapsed = lower.replace(REPEATS, "$1$1");
  const spaced = collapsed.replace(/\s+/g, " ").trim();
  const normalised = mapDigitsAsLetters(spaced);
  const romanised = romaniseDevanagari(normalised);
  return { normalised, romanised };
}
