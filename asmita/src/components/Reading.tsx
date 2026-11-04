import Link from "next/link";
import { t, type Locale } from "@/lib/i18n";
import { Icon, type IconName } from "./Icon";

// Building blocks for long text pages: a contents sidebar beside a readable
// column, icon section headings, a callout for the one line that matters,
// cards and tables in place of long lists, folded detail, and a next-step
// card that ends a section with something to do.

export type TocItem = { id: string; title: string };

export function ReadingLayout({ tocLabel, toc, children }: { tocLabel: string; toc: TocItem[]; children: React.ReactNode }) {
  return (
    <div className="container py-14 md:py-20">
      <div className="mx-auto max-w-5xl gap-16 md:flex md:items-start">
        <aside className="mb-12 md:mb-0 md:w-56 md:shrink-0">
          <div className="md:sticky md:top-24">
            <p className="eyebrow mb-4 block">{tocLabel}</p>
            <nav aria-label={tocLabel}>
              <ol className="space-y-1">
                {toc.map((s, i) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="flex items-baseline gap-2 rounded-[var(--radius-box)] px-2 py-1 text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--brand-soft)] hover:text-[var(--brand-strong)]"
                    >
                      <span className="shrink-0 text-[10px] tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                      <span className="leading-[1.5]">{s.title}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </div>
        </aside>
        <div className="reading-col min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

export function ReadingSection({ id, icon, title, children }: { id: string; icon: IconName; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-[var(--line)] py-10 first:border-t-0 first:pt-0">
      <SectionHeading icon={icon}>{title}</SectionHeading>
      <div className="reading-body mt-5">{children}</div>
    </section>
  );
}

export function SectionHeading({ icon, id, as: Tag = "h2", children }: { icon: IconName; id?: string; as?: "h2" | "h3"; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="icon-tile" aria-hidden>
        <Icon name={icon} />
      </span>
      <Tag id={id} className="subsection-title">{children}</Tag>
    </div>
  );
}

export function Callout({ icon = "info", children }: { icon?: IconName; children: React.ReactNode }) {
  return (
    <div className="callout">
      <Icon name={icon} className="mt-0.5 text-[var(--brand)]" />
      <div>{children}</div>
    </div>
  );
}

export function Fold({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return (
    <details className="fold">
      <summary>{t(locale, "reading.more")}</summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}

export function NextStep({ title, body, cta, href }: { title: string; body: string; cta: string; href: string }) {
  return (
    <div className="next-step">
      <div>
        <p className="font-semibold text-[var(--ink)]">{title}</p>
        <p className="mt-1 text-[15px] text-[var(--text)]">{body}</p>
      </div>
      <Link href={href} className="btn btn-secondary btn-arrow !m-0 shrink-0">{cta}</Link>
    </div>
  );
}

// List items as cards, optionally marked as allowed (check) or not (x).
export function ItemCards({
  items,
  mark,
  grid = false,
}: {
  items: { title?: string; body: React.ReactNode }[];
  mark?: "check" | "x";
  grid?: boolean;
}) {
  return (
    <ul className={`item-cards ${grid ? "sm:grid-cols-2" : ""}`}>
      {items.map((item, i) => (
        <li key={i} className="item-card">
          {mark && (
            <span className={`item-mark ${mark === "x" ? "item-mark-x" : ""}`} aria-hidden>
              <Icon name={mark} size={14} />
            </span>
          )}
          <div>
            {item.title && <p className="font-semibold text-[var(--ink)]">{item.title}</p>}
            <div className={item.title ? "mt-1" : ""}>{item.body}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

// Steps to follow, numbered down a line.
export function StepList({ steps }: { steps: React.ReactNode[] }) {
  return (
    <ol className="step-list">
      {steps.map((step, i) => (
        <li key={i}>{step}</li>
      ))}
    </ol>
  );
}

// Label-and-detail rows as a two-column table. On phones each row stacks.
// A trailing "-" or ":" left over from list styling is dropped from the label.
export function ItemTable({ head, rows }: { head: [string, string]; rows: [string, React.ReactNode][] }) {
  return (
    <table className="data-table">
      <thead>
        <tr><th scope="col">{head[0]}</th><th scope="col">{head[1]}</th></tr>
      </thead>
      <tbody>
        {rows.map(([label, detail]) => (
          <tr key={label}>
            <th scope="row">{label.replace(/\s*[-:–।]\s*$/, "")}</th>
            <td>{detail}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
