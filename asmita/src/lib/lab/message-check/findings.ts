import type { MessageCheckPatternId } from "@/lib/lab/message-check/patterns";
import { countsAsFinding, detectedElements, ELEMENT_LABELS, RULE_COVERED_BY } from "@/lib/lab/message-check/elements";
import { lexiconHits } from "@/lib/lab/sextortion/lexicon";
import { normaliseMessage } from "@/lib/lab/sextortion/normalise";
import type { SextortionLabel } from "@/lib/lab/sextortion/taxonomy";

/*
 * Which classifier labels the message-check API may report, server side.
 *
 * The classifier's per-label thresholds were tuned on synthetic data, and on
 * short everyday text a single label can cross its threshold with nothing
 * behind it ("hi" scoring DEADLINE, "ok" scoring VICTIM_PLEA). A label alone
 * is therefore never reported. A label is reported only when it is backed:
 * - the combination rule flagged the message (core + supporting labels), or
 * - a lexicon term for that same label is present in the text, or
 * - a WP93 rule that covers the same element fired.
 *
 * And the result as a whole counts as a finding (headline + advice) only
 * when it is flagged or something other than VICTIM_PLEA remains — a plea
 * on its own is the person's own words, not a warning sign. When nothing
 * counts, no label is reported at all.
 *
 * Minor routing is NOT decided here: the route checks the WP93 under-18
 * rule and the raw MINOR_SIGNAL label before this runs, unchanged.
 */
export function backedFindings(input: {
  text: string;
  labels: readonly SextortionLabel[];
  flagged: boolean;
  matches: readonly MessageCheckPatternId[];
}): { labels: SextortionLabel[]; finding: boolean } {
  const lexicon = new Set<SextortionLabel>(lexiconHits(normaliseMessage(input.text)));
  const ruleBacked = new Set<SextortionLabel>(input.matches.flatMap((id) => RULE_COVERED_BY[id]));
  const backed = input.labels.filter(
    (label) => ELEMENT_LABELS.includes(label) && (input.flagged || lexicon.has(label) || ruleBacked.has(label)),
  );
  const finding = countsAsFinding(detectedElements(input.matches, backed), input.flagged);
  return { labels: finding ? backed : [], finding };
}
