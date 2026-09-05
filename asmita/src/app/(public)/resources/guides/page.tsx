import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { guides } from "@/lib/resources-content";

export const metadata: Metadata = {
  title: "Practical guides",
  description:
    "Step-by-step guides: secure your accounts, collect evidence safely, and report to a platform.",
};

export default function GuidesPage() {
  return (
    <AppShell>
      <div className="page-canvas">
        <section className="hero" aria-label="Practical guides">
          <div className="hero-content container section-pad">
            <div className="mx-auto max-w-3xl">
              <p className="text-sm">
                <Link href="/resources" className="text-link font-medium">
                  Resources
                </Link>
              </p>
              <h1 className="font-display mt-4 text-[clamp(2.25rem,5.5vw,3.75rem)] font-medium leading-[1.06] text-[var(--heading)]">
                Practical guides
              </h1>
              <p className="font-size-large mt-5 max-w-2xl text-[var(--theme-color-2)]">
                Short, plain steps you can follow at your own pace. Do what you
                can. You do not have to do all of it at once.
              </p>
            </div>
          </div>
        </section>

        <section className="zone-white section-pad !pt-4" aria-label="Guides">
          <div className="container">
            <div className="mx-auto max-w-3xl space-y-6">
              {guides.map((guide) => (
                <article
                  key={guide.slug}
                  id={guide.slug}
                  className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--color-parchment)] p-7 shadow-[var(--shadow-sm)] md:p-9"
                >
                  <h2 className="font-display text-[clamp(1.35rem,3vw,1.9rem)] font-medium leading-[1.16]">
                    {guide.title}
                  </h2>
                  <p className="mt-3 text-[16px] leading-[1.65] text-[var(--body)]">
                    {guide.intro}
                  </p>
                  <ol className="mt-6 space-y-3">
                    {guide.steps.map((step, i) => (
                      <li key={step} className="flex gap-3 text-[15px] leading-[1.6] text-[var(--body)]">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--teal-soft)] text-[13px] font-medium text-[var(--heading)]">
                          {i + 1}
                        </span>
                        <span className="pt-0.5">{step}</span>
                      </li>
                    ))}
                  </ol>
                  {guide.note && (
                    <p className="mt-6 rounded-[var(--radius)] border-l-4 border-[var(--coral)] bg-[var(--coral-soft)] p-4 text-[14px] leading-[1.6] text-[var(--body)]">
                      {guide.note}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="zone-sunset" aria-label="Get help">
          <div className="zone-sunset-content container section-pad text-center">
            <div className="mx-auto max-w-2xl">
              <h2 className="font-display text-[clamp(1.75rem,4vw,2.5rem)] font-medium leading-[1.14]">
                Ready to report?
              </h2>
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
