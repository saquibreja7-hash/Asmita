/*
 * The notice PDF is drawn with pdf-lib's built-in Helvetica, which can only
 * encode WinAnsi (Windows-1252) characters: Latin letters, including accented
 * ones, and common punctuation. Any other character (Devanagari, Tamil, the
 * rupee sign, control characters) makes pdf-lib throw.
 *
 * This is checked before signing so a survivor is asked, kindly and before
 * anything is signed, to type their name in Latin letters. Nothing is ever
 * transliterated or stripped: a declaration must carry the name exactly as
 * the survivor typed it. No imports, so the signing forms can use it too.
 */

// The Windows-1252 characters in 0x80-0x9F that WinAnsi maps to Unicode.
const WIN_ANSI_EXTRAS = new Set(
  "€‚ƒ„…†‡ˆ‰Š‹ŒŽ" +
    "‘’“”•–—˜™š›œžŸ",
);

/** True when every character can be drawn in the notice PDF on one line. */
export function isPdfSafeText(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) continue;
    if (WIN_ANSI_EXTRAS.has(char)) continue;
    return false;
  }
  return true;
}
