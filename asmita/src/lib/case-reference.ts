import { randomBytes } from "node:crypto";

// Crockford-style alphabet: no 0/O, 1/I/L, or U - unambiguous when a
// survivor reads the reference aloud to a helpline or writes it by hand.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Random, non-sequential case reference, e.g. ASMITA-2026-7K3M9Q.
 * Sequential numbering leaked total case volume and made references
 * guessable; 30^6 (~729M) random space per year makes collisions rare -
 * callers must still retry on a unique-constraint hit.
 */
export function generateCaseReference(date: Date = new Date()): string {
  const bytes = randomBytes(6);
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `ASMITA-${date.getFullYear()}-${code}`;
}
