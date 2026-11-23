import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/Icon";

/*
 * Topic cards for the calm pages (The Issue, Who we help, the Glossary):
 * an icon tile, an optional quiet number, a title that links (the whole
 * card is its hit area), one line, and a "Learn more" cue. Cards take the
 * three brand colours in turn (styles: .issue-topic, .issue-tone-*).
 */

export type BrandTone = "teal" | "coral" | "gold";
export const BRAND_TONES: BrandTone[] = ["teal", "coral", "gold"];

export type IssueCard = {
  href: string;
  title: string;
  short?: string;
  icon: IconName;
  tone?: BrandTone;
  number?: number;
};

/** `children` are extra <li> tiles appended to the same grid. */
export function IssueTopicCards({
  cards,
  moreLabel,
  headingLevel = 3,
  children,
}: {
  cards: IssueCard[];
  moreLabel?: string;
  /** The card titles' heading level, so the page outline stays in order. */
  headingLevel?: 2 | 3;
  children?: ReactNode;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <ul className="issue-topics" role="list">
      {cards.map((card, index) => (
        <li key={card.href} className={`issue-topic issue-tone-${card.tone ?? BRAND_TONES[index % BRAND_TONES.length]}`}>
          <div className="issue-topic-top">
            <span className="issue-topic-icon" aria-hidden="true">
              <Icon name={card.icon} size={22} />
            </span>
            {card.number !== undefined && (
              <span className="issue-topic-n" aria-hidden="true">
                {String(card.number).padStart(2, "0")}
              </span>
            )}
          </div>
          <Heading className="issue-topic-title">
            <Link className="lab-card-link" href={card.href}>
              {card.title}
            </Link>
          </Heading>
          {card.short && <p className="issue-topic-short">{card.short}</p>}
          {moreLabel && (
            <span className="issue-topic-more" aria-hidden="true">
              {moreLabel} <span className="issue-topic-arrow">→</span>
            </span>
          )}
        </li>
      ))}
      {children}
    </ul>
  );
}

/** Each Issue topic's icon and colour, shared by the hub and the topic pages. */
export const ISSUE_TOPIC_STYLE: Record<string, { icon: IconName; tone: BrandTone }> = {
  ncii: { icon: "eyeOff", tone: "teal" },
  deepfakes: { icon: "scan", tone: "coral" },
  morphing: { icon: "overlap", tone: "gold" },
  sextortion: { icon: "alert", tone: "teal" },
  doxxing: { icon: "users", tone: "coral" },
};

/** Each Who we help audience's icon and colour. */
export const AUDIENCE_STYLE: Record<string, { icon: IconName; tone: BrandTone }> = {
  survivors: { icon: "heart", tone: "teal" },
  "helping-someone": { icon: "handshake", tone: "coral" },
  parents: { icon: "users", tone: "gold" },
  "young-people": { icon: "shieldCheck", tone: "teal" },
  platforms: { icon: "building", tone: "coral" },
};
