/**
 * The decode recipe under test is the crawler's own module, imported, not a
 * copy: crawler/src/prepare.ts is the single source of truth, so what this
 * harness measures is exactly what the crawler runs (including its sharp
 * version and failOn setting). Install the crawler's dependencies first
 * (`npm ci` in crawler/), because that module resolves sharp from there.
 */
export {
  prepareForPdq,
  canvasAlphaRoundTrip,
  DEFAULT_LIMIT_INPUT_PIXELS,
  FAIL_ON,
} from "../../../crawler/src/prepare.ts";
export type { PrepareOptions } from "../../../crawler/src/prepare.ts";

import { createRequire } from "node:module";

/** The sharp the recipe actually uses (the crawler's), for the report header. */
export function recipeSharpVersions(): { sharp: string; vips: string } {
  const crawlerRequire = createRequire(new URL("../../../crawler/src/prepare.ts", import.meta.url));
  return (crawlerRequire("sharp") as { versions: { sharp: string; vips: string } }).versions;
}
