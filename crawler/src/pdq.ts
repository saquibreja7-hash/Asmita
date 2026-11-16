/**
 * The single import point for PDQ in the crawler.
 *
 * The crawler hashes with exactly the same code that survivors' browsers run
 * (asmita/src/lib/pdq/pdq.ts), imported read-only. The bundler inlines it into
 * dist/main.js, so the container never needs the asmita/ tree at runtime.
 * tests/unit/pdq-contract.test.ts fails if that module's exports or output
 * change, so a change on the app side cannot silently desynchronise the two.
 */
export {
  computePdqHash,
  hammingDistance,
  PDQ_MATCH_THRESHOLD,
  PDQ_HASH_PATTERN,
  PDQ_CLIENT_VERSION,
} from "../../asmita/src/lib/pdq/pdq.ts";
export type { PdqInput, PdqResult } from "../../asmita/src/lib/pdq/pdq.ts";
