import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";

export const metadata: Metadata = {
  title: "Resources",
  description:
    "Practical guides, a verified support directory, and your legal rights in India for image-based abuse.",
};

const sections = [
  {
    title: "Practical guides",
    body: "Step-by-step help: secure your accounts, collect evidence safely, and report to a platform.",
    href: "/resources/guides",
    cta: "Read the guides",
  },
  {
    title: "Support directory",
    body: "Verified helplines, government portals, image-removal tools, and free legal aid across India.",
    href: "/resources/directory",
    cta: "Find support",
  },
  {
    title: "Your legal rights",
    body: "What the IT Rules, the MeitY procedure, and the reporting channels actually mean for you.",
    href: "/resources/legal",
    cta: "Know your rights",
  },
] as const;

export default function ResourcesPage() {
  return (
    <AppShell>
      <div className="page-canvas">
        <section className="hero" aria-label="Resources">
          <div className="hero-content container section-pad">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">Resources</span>
              <h1 className="font-display mt-5 text-[clamp(2.25rem,5.5vw,4rem)] font-medium leading-[1.06] text-[var(--heading)]">
                Practical help, in one place
              </h1>
              <p className="font-size-large mx-auto mt-5 max-w-2xl text-[var(--theme-color-2)]">
                Guides you can follow, people you can call, and a plain account of
                what the law gives you. Take what you need.
              </p>
            </div>
          </div>
        </section>

        <section className="zone-white section-pad" aria-label="Resource areas">
          <div className="container">
            <div className="grid gap-4 md:grid-cols-3">
              {sections.map((s) => (
                <Link
                  key={s.title}
                  href={s.href}
                  className="group flex flex-col rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-7 shadow-[var(--shadow-sm)] transition hover:shadow-[var(--shadow-soft)]"
                >
                  <h2 className="text-[19px] font-semibold text-[var(--heading)]">
                    {s.title}
                  </h2>
                  <p className="mt-3 flex-1 text-sm leading-[1.6] text-[var(--muted)]">
                    {s.body}
                  </p>
                  <span className="mt-5 inline-block text-sm font-semibold text-[var(--coral-deep)]">
                    {s.cta}{" "}
                    <span className="inline-block transition-transform group-hover:translate-x-0.5" aria-hidden>
                      →
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="zone-sunset" aria-label="Get help">
          <div className="zone-sunset-content container section-pad text-center">
            <div className="mx-auto max-w-2xl">
              <h2 className="font-display text-[clamp(1.75rem,4vw,2.5rem)] font-medium leading-[1.14]">
                Need to act now?
              </h2>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link className="btn btn-midnight btn-arrow !m-0" href="/get-help">
                  Get help
                </Link>
                <Link className="btn btn-secondary btn-arrow !m-0" href="/resources/directory">
                  Helplines
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
