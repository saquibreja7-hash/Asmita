import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { audiences } from "@/lib/audience-content";

export const metadata: Metadata = {
  title: "Who we help",
  description:
    "Help for survivors of image-based abuse, the people supporting them, parents and families, young people, and platforms.",
};

export default function WhoWeHelpPage() {
  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="hero" aria-label="Who we help">
          <div className="hero-content container section-pad">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">Who we help</span>
              <h1 className="font-display mt-5 text-[clamp(2.25rem,5.5vw,4rem)] font-medium leading-[1.06] text-[var(--heading)]">
                Wherever you are coming from
              </h1>
              <p className="font-size-large mx-auto mt-5 max-w-2xl text-[var(--theme-color-2)]">
                Image-based abuse touches survivors, the people around them, and
                the platforms that carry the content. Find the path that fits you.
              </p>
            </div>
          </div>
        </section>

        {/* AUDIENCE GRID */}
        <section className="zone-white section-pad" aria-label="Audiences">
          <div className="container">
            <div className="mx-auto max-w-5xl">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {audiences.map((a) => (
                  <Link
                    key={a.slug}
                    href={`/who-we-help/${a.slug}`}
                    className="group flex flex-col rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--color-parchment)] p-7 shadow-[var(--shadow-sm)] transition hover:shadow-[var(--shadow-soft)]"
                  >
                    <h2 className="text-[19px] font-medium leading-snug text-[var(--heading)]">
                      {a.term}
                    </h2>
                    <p className="mt-3 flex-1 text-sm leading-[1.6] text-[var(--muted)]">
                      {a.cardLine}
                    </p>
                    <span className="mt-4 inline-block text-sm font-medium text-[var(--color-off-black)]">
                      Open{" "}
                      <span className="inline-block transition-transform group-hover:translate-x-0.5" aria-hidden>
                        →
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CLOSING */}
        <section className="zone-sunset" aria-label="Get help">
          <div className="zone-sunset-content container section-pad text-center">
            <div className="mx-auto max-w-2xl">
              <h2 className="font-display text-[clamp(1.75rem,4vw,2.5rem)] font-medium leading-[1.14]">
                Not sure where you fit? Start here.
              </h2>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link className="btn btn-midnight btn-arrow !m-0" href="/get-help">
                  Get help
                </Link>
                <Link className="btn btn-secondary btn-arrow !m-0" href="/issue">
                  Understand the issue
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
