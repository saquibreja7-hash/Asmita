/** Assertions that captured log output carries no URLs, hostnames or fingerprints. */
import { expect } from "vitest";

const URL_LIKE = [
  /[a-z][a-z0-9+.-]*:\/\//i, // any scheme://
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/, // dotted IPv4
  /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:test|com|org|net|in|io|invalid|localhost)\b/i, // hostnames
  /\/[a-z0-9_-]+\.(?:png|jpe?g|gif|webp|avif|svg|html?)\b/i, // paths to files
];
const HEX64 = /[0-9a-f]{64}/i;
const HEX_RUN = /[0-9a-f]{16,}/i;

export function assertCleanLog(text: string, opts: { hostnames: string[]; hashes: string[]; secrets?: string[] }): void {
  for (const re of URL_LIKE) expect(text, `log matched ${re}`).not.toMatch(re);
  expect(text).not.toMatch(HEX64);
  expect(text).not.toMatch(HEX_RUN);
  for (const h of opts.hostnames) expect(text.toLowerCase()).not.toContain(h.toLowerCase());
  for (const h of opts.hashes) {
    expect(text).not.toContain(h);
    // and no 8-hex word of it either
    for (let i = 0; i < 64; i += 16) expect(text).not.toContain(h.slice(i, i + 16));
  }
  for (const s of opts.secrets ?? []) expect(text).not.toContain(s);
}
