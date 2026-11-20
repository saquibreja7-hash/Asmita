/**
 * PDQ for the Lab: the site's own hashing code, imported, never copied.
 *
 * asmita/src/lib/pdq/pdq.ts is pure TypeScript (no dependencies, no DOM), so
 * this tool runs the exact hash that survivors' browsers and the crawler
 * compute. Anything measured here is directly comparable to production PDQ
 * hashes.
 */
export {
  computePdqHash,
  hammingDistance,
  PDQ_HASH_PATTERN,
  PDQ_MATCH_THRESHOLD,
  PDQ_CLIENT_VERSION,
  type PdqInput,
  type PdqResult,
} from "../../../asmita/src/lib/pdq/pdq.ts";

/**
 * The crawler skips a found image whose PDQ quality is below 50
 * (crawler/src/match/matcher.ts, MIN_QUALITY). The lab uses the same floor
 * for the whole-image PDQ baseline so the number reflects the deployed
 * pipeline, and applies it to the region-PDQ variants too (a crop the
 * production rules would skip is not a match in production either).
 */
export const PRODUCTION_MIN_QUALITY = 50;
