import type { ReactNode } from "react";
import { Illustration } from "@/components/Illustration";

// The organization pages' header: title and lede on the left, the scene on
// the right (stacked on phones). No label above the title: the title names
// the page on its own.

export function OrgHero({
  title,
  lede,
  illustration,
  children,
}: {
  title: string;
  lede?: string;
  illustration: Parameters<typeof Illustration>[0]["name"];
  children?: ReactNode;
}) {
  return (
    <section className="hero" aria-label={title}>
      <div className="hero-content container org-hero page-hero-split">
        <div className="max-w-3xl">
          <h1 className="page-title">{title}</h1>
          {lede ? <p className="org-hero-lede">{lede}</p> : null}
          {children}
        </div>
        <Illustration name={illustration} eager className="page-hero-art" />
      </div>
    </section>
  );
}
