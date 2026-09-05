import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { directory, directoryLastVerified } from "@/lib/resources-content";

export const metadata: Metadata = {
  title: "Support directory",
  description:
    "Verified helplines, government portals, image-removal tools, and free legal aid across India.",
};

export default function DirectoryPage() {
  return (
    <AppShell>
      <div className="page-canvas">
        <section className="hero" aria-label="Support directory">
          <div className="hero-content container section-pad">
            <div className="mx-auto max-w-3xl">
              <p className="text-sm">
                <Link href="/resources" className="text-link font-medium">
                  Resources
                </Link>
              </p>
              <h1 className="font-display mt-4 text-[clamp(2.25rem,5.5vw,3.75rem)] font-medium leading-[1.06] text-[var(--heading)]">
                Support directory
              </h1>
              <p className="font-size-large mt-5 max-w-2xl text-[var(--theme-color-2)]">
                Real helplines and services in India. Every one is a verified,
                official source, not a paid listing.
              </p>
              <p className="eyebrow mt-6">
                Last verified against public source pages: {directoryLastVerified}.
              </p>
            </div>
          </div>
        </section>

        <section className="zone-white section-pad !pt-4" aria-label="Directory">
          <div className="container">
            <div className="mx-auto max-w-3xl space-y-12">
              {directory.map((group) => (
                <div key={group.group}>
                  <h2 className="font-display text-[clamp(1.2rem,2.5vw,1.6rem)] font-medium text-[var(--heading)]">
                    {group.group}
                  </h2>
                  <ul className="mt-5 space-y-3">
                    {group.items.map((item) => (
                      <li
                        key={item.name}
                        className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--color-parchment)] p-6 shadow-[var(--shadow-sm)]"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="max-w-xl">
                            <p className="text-[16px] font-medium text-[var(--heading)]">
                              {item.name}
                              {item.note && (
                                <span className="ml-2 rounded-full bg-[var(--teal-soft)] px-2 py-0.5 text-[11px] font-medium uppercase tracking-[-0.033em] text-[var(--heading)]">
                                  {item.note}
                                </span>
                              )}
                            </p>
                            <p className="mt-1.5 text-sm leading-[1.6] text-[var(--muted)]">
                              {item.what}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            {item.tel && (
                              <a
                                href={`tel:${item.tel}`}
                                className="btn btn-midnight !m-0 !min-h-[40px] !px-4 !text-[14px]"
                              >
                                Call {item.tel}
                              </a>
                            )}
                            {item.href && (
                              <a
                                href={item.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-secondary !m-0 !min-h-[40px] !px-4 !text-[14px]"
                              >
                                Visit ↗
                              </a>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="zone-sunset" aria-label="Get help">
          <div className="zone-sunset-content container section-pad text-center">
            <div className="mx-auto max-w-2xl">
              <h2 className="font-display text-[clamp(1.75rem,4vw,2.5rem)] font-medium leading-[1.14]">
                Want us to help you report?
              </h2>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link className="btn btn-midnight btn-arrow !m-0" href="/get-help">
                  Get help
                </Link>
                <Link className="btn btn-secondary btn-arrow !m-0" href="/resources/legal">
                  Your legal rights
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
