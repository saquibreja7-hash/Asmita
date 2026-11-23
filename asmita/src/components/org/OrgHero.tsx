import type { ReactNode } from "react";
import { Illustration } from "@/components/Illustration";
import { LabToolHero } from "@/components/lab/LabToolPage";

// The organization pages' header: title and lede on the left, the scene on
// the right (stacked on phones). No label above the title: the title names
// the page on its own.

export function OrgHero({
  title,
  lede,
  illustration,
  badge,
  backLabel,
  backHref,
  children,
}: {
  title: string;
  lede?: string;
  illustration: Parameters<typeof Illustration>[0]["name"];
  badge?: string;
  backLabel?: string;
  backHref?: string;
  children?: ReactNode;
}) {
  return (
    <LabToolHero
      badge={badge}
      backLabel={backLabel}
      backHref={backHref}
      title={title}
      intro={lede ? <p>{lede}</p> : <></>}
      visual={<Illustration name={illustration} eager className="issue-hero-art" />}
    >
      {children}
    </LabToolHero>
  );
}
