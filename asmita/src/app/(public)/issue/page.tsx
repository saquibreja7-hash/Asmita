import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { issueTopics } from "@/lib/issue-content";

export const metadata: Metadata = {
  title: "The issue",
  description:
    "Understand image-based abuse in India: non-consensual intimate images, deepfakes, morphing, sextortion, and doxxing, explained in plain language.",
};

export default function IssuePage() {
  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="hero" aria-label="The issue">
          <div className="hero-content container section-pad">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">The issue</span>
              <h1 className="font-display mt-5 text-[clamp(2.25rem,5.5vw,4rem)] font-medium leading-[1.06] text-[var(--heading)]">
                Understand what is happening
              </h1>
              <p className="font-size-large mx-auto mt-5 max-w-2xl text-[var(--theme-color-2)]">
                Image-based abuse takes many forms. Knowing what you are dealing
                with is the first step to acting on it. Here is each one, in plain
                words.
              </p>
            </div>
          </div>
        </section>

        {/* TOPIC GRID */}
        <section className="zone-white section-pad" aria-labelledby="topics-heading">
          <div className="container">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 id="topics-heading" className="sr-only">
                Types of image-based abuse
              </h2>
              <p className="max-w-2xl text-lg leading-[1.6] text-[var(--body)]">
                Pick the one closest to your situation, or read them all.
              </p>
              <Link href="/glossary" className="text-link text-sm font-medium">
                See the glossary of terms →
              </Link>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {issueTopics.map((topic) => (
                <Link
                  key={topic.slug}
                  href={`/issue/${topic.slug}`}
                  className="group flex flex-col rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--color-parchment)] p-6 shadow-[var(--shadow-sm)] transition hover:shadow-[var(--shadow-soft)]"
                >
                  <h3 className="text-[18px] font-medium leading-snug text-[var(--heading)]">
                    {topic.term}
                  </h3>
                  <p className="mt-3 flex-1 text-sm leading-[1.6] text-[var(--muted)]">
                    {topic.short}
                  </p>
                  <span className="mt-4 inline-block text-sm font-medium text-[var(--color-off-black)]">
                    Learn more{" "}
                    <span className="inline-block transition-transform group-hover:translate-x-0.5" aria-hidden>
                      →
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* CLOSING */}
        <section className="zone-sunset" aria-label="Get help">
          <div className="zone-sunset-content container section-pad text-center">
            <div className="mx-auto max-w-2xl">
              <h2 className="font-display text-[clamp(1.75rem,4vw,2.75rem)] font-medium leading-[1.14]">
                Whatever form it takes, you can act on it.
              </h2>
              <p className="mx-auto mt-5 max-w-lg text-lg leading-[1.65] text-[var(--body)]">
                None of this is your fault, and none of it is something you have to
                sort out alone.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link className="btn btn-midnight btn-arrow !m-0" href="/get-help">
                  Get help
                </Link>
                <Link className="btn btn-secondary btn-arrow !m-0" href="/glossary">
                  Glossary of terms
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
