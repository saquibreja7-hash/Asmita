import Link from "next/link";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Icon, type IconName } from "@/components/Icon";
import { LabScene, type LabSceneKind } from "@/components/lab/LabScene";

/*
 * The shared parts of an AI Lab tool page (2026-11-23). They give every
 * tool the hub's faint gradient and its own Three.js scene, while the type,
 * text colours and cards stay the site's, so a tool page reads as part of
 * the Lab without being louder than the rest of the site:
 *
 *   <LabToolShell>        page canvas with the Lab's faint wash
 *   <LabToolHero>         split hero: back chip, badge, title, intro, facts | scene
 *   <LabWorkspace>        the raised panel the tool itself sits in
 *   <LabSection>          a titled section with an optional numbered label
 *   <LabSteps>            numbered step cards (method, next steps)
 *   <LabLinkCards>        card tiles for outbound or inbound links
 *   <LabCallout>          a quiet highlighted note
 *
 * Every string is passed in already translated; nothing here holds text.
 */

export function LabToolShell({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <div className="page-canvas lab-theme lab-sub">{children}</div>
    </AppShell>
  );
}

export type LabFact = { icon: IconName; text: string };

export function LabToolHero({
  backLabel,
  backHref = "/lab",
  badge,
  title,
  intro,
  facts = [],
  scene,
  children,
}: {
  backLabel: string;
  backHref?: string;
  badge?: string;
  title: string;
  intro: ReactNode;
  facts?: LabFact[];
  scene?: LabSceneKind;
  children?: ReactNode;
}) {
  return (
    <section className="lab-tool-hero" aria-label={title}>
      <div className="container lab-tool-hero-grid">
        <div className="lab-tool-hero-copy">
          <Link className="lab-back" href={backHref}>
            <span aria-hidden="true">←</span> {backLabel}
          </Link>
          {badge && <span className="lab-badge lab-badge-hero">{badge}</span>}
          <h1 className="page-title lab-tool-title">{title}</h1>
          <div className="lab-tool-intro">{intro}</div>
          {facts.length > 0 && (
            <ul className="lab-facts" role="list">
              {facts.map((fact) => (
                <li key={fact.text} className="lab-fact">
                  <Icon name={fact.icon} size={18} />
                  <span>{fact.text}</span>
                </li>
              ))}
            </ul>
          )}
          {children}
        </div>
        {scene && (
          <div className="lab-tool-hero-visual">
            <LabScene kind={scene} className="lab-tool-hero-scene" />
          </div>
        )}
      </div>
    </section>
  );
}

export function LabWorkspace({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="lab-workspace-wrap" aria-label={label}>
      <div className="container">
        <div className="lab-workspace">{children}</div>
      </div>
    </section>
  );
}

export function LabSection({
  id,
  index,
  title,
  lede,
  children,
  narrow = false,
}: {
  id: string;
  index?: string;
  title: string;
  lede?: ReactNode;
  children: ReactNode;
  narrow?: boolean;
}) {
  return (
    <section className="lab-sub-section" aria-labelledby={id}>
      <div className={`container ${narrow ? "lab-narrow" : ""}`}>
        <header className="lab-section-head">
          {index && (
            <span className="lab-index" aria-hidden="true">
              {index}
            </span>
          )}
          <h2 id={id} className="lab-h2">
            {title}
          </h2>
          {lede && <div className="lab-section-note">{lede}</div>}
        </header>
        {children}
      </div>
    </section>
  );
}

/** "grid" for short steps side by side; "stack" for paragraphs, one per row. */
export function LabSteps({ steps, ordered = true, layout = "grid" }: { steps: ReactNode[]; ordered?: boolean; layout?: "grid" | "stack" }) {
  const List = ordered ? "ol" : "ul";
  return (
    <List className={`lab-steps ${layout === "stack" ? "lab-steps-stack" : ""}`} role="list">
      {steps.map((step, i) => (
        <li key={i} className="lab-step">
          <span className="lab-step-n" aria-hidden="true">
            {String(i + 1).padStart(2, "0")}
          </span>
          <div className="lab-step-body">{step}</div>
        </li>
      ))}
    </List>
  );
}

export type LabLinkCard = { href: string; label: string; note?: string; icon?: IconName; external?: boolean };

export function LabLinkCards({ cards }: { cards: LabLinkCard[] }) {
  return (
    <ul className="lab-link-cards" role="list">
      {cards.map((card) => (
        <li key={card.href} className="lab-link-card">
          {card.icon && (
            <span className="lab-link-icon" aria-hidden="true">
              <Icon name={card.icon} size={22} />
            </span>
          )}
          <span className="lab-link-text">
            {card.external ? (
              <a className="lab-card-link" href={card.href} rel="noopener noreferrer" target="_blank">
                {card.label}
              </a>
            ) : (
              <Link className="lab-card-link" href={card.href}>
                {card.label}
              </Link>
            )}
            {card.note && <span className="lab-link-note">{card.note}</span>}
          </span>
          <span className="lab-link-go" aria-hidden="true">
            {card.external ? "↗" : "→"}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function LabCallout({ icon = "info", children }: { icon?: IconName; children: ReactNode }) {
  return (
    <div className="lab-callout">
      <Icon name={icon} size={20} />
      <div>{children}</div>
    </div>
  );
}
