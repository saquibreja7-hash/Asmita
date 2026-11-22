import { Fragment } from "react";
import { t, type Locale, type MessageKey } from "@/lib/i18n";
import type { Stage } from "@/lib/lab/open-tools/types";
import { STAGE_ORDER } from "@/lib/lab/open-tools/filters";

/*
 * The five-stage trust-and-safety workflow strip (docs/lab/open-tools-spec.md,
 * Parts C3 and C4): Prevent, Detect, Review, Act, Share, connected by thin
 * rules with an orange dot at each stage.
 *
 * Two modes, one component:
 *  - interactive (the directory): every stage is a filter button with
 *    aria-pressed, "All" first and selected by default, and the stage's
 *    one-line meaning under it on wide screens. The parent owns the state.
 *  - read-only (the tool pages, WP152): no buttons; the stages a tool covers
 *    are highlighted so the page can show where it fits.
 *
 * No "use client" on purpose: imported by the client directory it is part
 * of the client bundle; imported by a server page (WP152) it renders as a
 * plain server component with no handler.
 */

const STAGE_NAME: Record<Stage, MessageKey> = {
  prevent: "lab.openTools.stage.prevent.name",
  detect: "lab.openTools.stage.detect.name",
  review: "lab.openTools.stage.review.name",
  act: "lab.openTools.stage.act.name",
  share: "lab.openTools.stage.share.name",
};

const STAGE_MEANING: Record<Stage, MessageKey> = {
  prevent: "lab.openTools.stage.prevent.meaning",
  detect: "lab.openTools.stage.detect.meaning",
  review: "lab.openTools.stage.review.meaning",
  act: "lab.openTools.stage.act.meaning",
  share: "lab.openTools.stage.share.meaning",
};

export function WorkflowStrip({
  locale,
  active = null,
  onSelect,
  highlight = [],
}: {
  locale: Locale;
  /** Interactive mode: the stage filter's current value. */
  active?: Stage | null;
  /** Present only in interactive mode: sets the stage filter (null = all). */
  onSelect?: (stage: Stage | null) => void;
  /** Read-only mode: the stages this tool covers. */
  highlight?: readonly Stage[];
}) {
  const interactive = onSelect !== undefined;
  return (
    <div
      className="ot-strip"
      role={interactive ? "group" : undefined}
      aria-label={interactive ? t(locale, "lab.openTools.strip.label") : undefined}
    >
      {interactive && (
        <button
          type="button"
          className={`ot-stage-btn${active === null ? " is-active" : ""}`}
          aria-pressed={active === null}
          onClick={() => onSelect(null)}
        >
          {t(locale, "lab.openTools.stage.all")}
        </button>
      )}
      {STAGE_ORDER.map((stage, index) => (
        <Fragment key={stage}>
          {index > 0 || interactive ? <span className="ot-connector" aria-hidden="true" /> : null}
          <span className="ot-stage">
            {interactive ? (
              <button
                type="button"
                className={`ot-stage-btn${active === stage ? " is-active" : ""}`}
                aria-pressed={active === stage}
                onClick={() => onSelect(active === stage ? null : stage)}
              >
                {t(locale, STAGE_NAME[stage])}
              </button>
            ) : (
              <span className={`ot-stage-name${highlight.includes(stage) ? " is-on" : ""}`}>
                {t(locale, STAGE_NAME[stage])}
              </span>
            )}
            <span className="ot-stage-meaning">{t(locale, STAGE_MEANING[stage])}</span>
          </span>
        </Fragment>
      ))}
    </div>
  );
}
