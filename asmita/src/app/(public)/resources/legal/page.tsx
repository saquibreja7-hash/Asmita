import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { legalSections } from "@/lib/resources-content";

export const metadata: Metadata = {
  title: "Your legal rights",
  description:
    "Plain-language rights for image-based abuse in India: the IT Rules, the MeitY procedure, reporting, escalation, and legal aid.",
};

export default function LegalRightsPage() {
  return (
    <AppShell>
      <div className="page-canvas">
        <section className="hero" aria-label="Your legal rights">
          <div className="hero-content container section-pad">
            <div className="mx-auto max-w-3xl">
              <p className="text-sm">
                <Link href="/resources" className="text-link font-medium">
                  Resources
                </Link>
              </p>
              <h1 className="font-display mt-4 text-[clamp(2.25rem,5.5vw,3.75rem)] font-medium leading-[1.06] text-[var(--heading)]">
                Your rights, in plain words
              </h1>
              <p className="font-size-large mt-5 max-w-2xl text-[var(--theme-color-2)]">
                The law in India gives you real ways to act. Here is what it means,
                without the legalese.
              </p>
            </div>
          </div>
        </section>

        <section className="zone-white section-pad !pt-4" aria-label="Rights">
          <div className="container">
            <div className="mx-auto max-w-3xl divide-y divide-[var(--hairline)]">
              {legalSections.map((s) => (
                <div key={s.title} className="py-7">
                  <h2 className="font-display text-[clamp(1.2rem,2.5vw,1.6rem)] font-medium leading-[1.2] text-[var(--heading)]">
                    {s.title}
                  </h2>
                  <p className="mt-3 text-[16px] leading-[1.65] text-[var(--body)]">
                    {s.body}
                  </p>
                </div>
              ))}
            </div>

            <p className="mx-auto mt-8 max-w-3xl text-sm leading-[1.6] text-[var(--muted)]">
              This is general information, not legal advice, and the law can
              change. For advice on your situation, use free legal aid through
              NALSA or a lawyer.
            </p>
          </div>
        </section>

        <section className="zone-sunset" aria-label="Get help">
          <div className="zone-sunset-content container section-pad text-center">
            <div className="mx-auto max-w-2xl">
              <h2 className="font-display text-[clamp(1.75rem,4vw,2.5rem)] font-medium leading-[1.14]">
                Put your rights to work.
              </h2>
              <p className="mx-auto mt-5 max-w-lg text-lg leading-[1.65] text-[var(--body)]">
                We turn these rights into a takedown notice you can review and
                sign, then route it to the platform.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link className="btn btn-midnight btn-arrow !m-0" href="/get-help">
                  Get help
                </Link>
                <Link className="btn btn-secondary btn-arrow !m-0" href="/resources/directory">
                  Support directory
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
