import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { glossary } from "@/lib/issue-content";

export const metadata: Metadata = {
  title: "Glossary",
  description:
    "Plain-language definitions of the terms used around image-based abuse and takedowns in India.",
};

export default function GlossaryPage() {
  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="hero" aria-label="Glossary">
          <div className="hero-content container section-pad">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">Glossary</span>
              <h1 className="font-display mt-5 text-[clamp(2.25rem,5.5vw,4rem)] font-medium leading-[1.06] text-[var(--heading)]">
                Words, in plain language
              </h1>
              <p className="font-size-large mx-auto mt-5 max-w-2xl text-[var(--theme-color-2)]">
                The terms you will see on this site and in the law, explained
                without jargon. You do not need to know any of these to get help.
              </p>
            </div>
          </div>
        </section>

        {/* TERMS */}
        <section className="zone-white section-pad" aria-label="Terms">
          <div className="container">
            <dl className="mx-auto max-w-3xl divide-y divide-[var(--hairline)]">
              {glossary.map((entry) => (
                <div key={entry.term} className="py-6">
                  <dt className="font-display text-[1.15rem] font-medium text-[var(--heading)]">
                    {entry.term}
                  </dt>
                  <dd className="mt-2 text-[16px] leading-[1.65] text-[var(--body)]">
                    {entry.definition}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* CLOSING */}
        <section className="zone-sunset" aria-label="Get help">
          <div className="zone-sunset-content container section-pad text-center">
            <div className="mx-auto max-w-2xl">
              <h2 className="font-display text-[clamp(1.75rem,4vw,2.5rem)] font-medium leading-[1.14]">
                Ready when you are.
              </h2>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link className="btn btn-midnight btn-arrow !m-0" href="/get-help">
                  Get help
                </Link>
                <Link className="btn btn-secondary btn-arrow !m-0" href="/issue">
                  Back to the issue
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
