import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";
import { t, type Locale, type MessageKey } from "@/lib/i18n";
import type { Category, Effort, OpenTool, Stage } from "@/lib/lab/open-tools/types";

/*
 * One tool card in the open tools directory (docs/lab/open-tools-spec.md,
 * Part C3): icon tile and chips, the name as the only link, the maintainer,
 * the one-sentence summary, then the stage chips and the effort marker with
 * its three squares (the text carries the level, so colour is never the
 * only signal). The same anatomy serves the "Related tools" cards on the
 * tool pages (WP152), so it lives in its own file without "use client": it
 * is a client component inside the directory and a server component inside
 * a tool page.
 */

const CATEGORY_ICON: Record<Category, IconName> = {
  matching: "hashgrid",
  review: "clipboard",
  models: "layers",
  provenance: "seal",
  services: "link",
  asmita: "flame",
  directories: "book",
};

/** Teal or orange tint per category; the two tones just keep neighbours apart. */
const CATEGORY_TONE: Record<Category, "teal" | "coral"> = {
  matching: "teal",
  review: "coral",
  models: "teal",
  provenance: "coral",
  services: "teal",
  asmita: "teal",
  directories: "coral",
};

const STAGE_KEY: Record<Stage, MessageKey> = {
  prevent: "lab.openTools.stage.prevent.name",
  detect: "lab.openTools.stage.detect.name",
  review: "lab.openTools.stage.review.name",
  act: "lab.openTools.stage.act.name",
  share: "lab.openTools.stage.share.name",
};

const EFFORT_KEY: Record<Effort, MessageKey> = {
  low: "lab.openTools.effort.low",
  medium: "lab.openTools.effort.medium",
  high: "lab.openTools.effort.high",
  none: "lab.openTools.effort.none",
};

/** Filled squares out of three: low 1, medium 2, high 3, none 0. */
const EFFORT_FILLED: Record<Effort, number> = {
  low: 1,
  medium: 2,
  high: 3,
  none: 0,
};

export function OpenToolCard({ tool, locale }: { tool: OpenTool; locale: Locale }) {
  const filled = EFFORT_FILLED[tool.effort];
  return (
    <article className="ot-card">
      <div className="ot-card-top">
        <span className={`ot-tile ot-tile-${CATEGORY_TONE[tool.category]}`} aria-hidden="true">
          <Icon name={CATEGORY_ICON[tool.category]} size={22} />
        </span>
        <span className="ot-card-chips">
          <span className="ot-chip ot-chip-licence">{tool.licence}</span>
          {!tool.openSource && (
            <span className="ot-chip ot-chip-closed">{t(locale, "lab.openTools.chip.notOpenSource")}</span>
          )}
          {tool.fromAsmita && (
            <span className="ot-chip ot-chip-asmita">{t(locale, "lab.openTools.chip.fromAsmita")}</span>
          )}
        </span>
      </div>
      <h3 className="ot-card-title">
        <Link className="text-link" href={`/lab/open-tools/${tool.slug}`}>
          {tool.name}
        </Link>
      </h3>
      <p className="ot-by">{t(locale, "lab.openTools.card.by").replace("{maintainer}", tool.maintainer)}</p>
      <p className="ot-summary">{locale === "hi" ? tool.summary.hi : tool.summary.en}</p>
      <div className="ot-card-bottom">
        <ul className="ot-stage-chips" aria-label={t(locale, "lab.openTools.card.stages")}>
          {tool.stages.map((stage) => (
            <li key={stage} className="ot-chip ot-chip-stage">
              {t(locale, STAGE_KEY[stage])}
            </li>
          ))}
        </ul>
        <span className="ot-effort">
          <span className="ot-effort-squares" aria-hidden="true">
            {[0, 1, 2].map((square) => (
              <span key={square} className={`ot-effort-sq${square < filled ? " on" : ""}`} />
            ))}
          </span>
          {t(locale, "lab.openTools.card.effort")}: {t(locale, EFFORT_KEY[tool.effort])}
        </span>
      </div>
    </article>
  );
}
