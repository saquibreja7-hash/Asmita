import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { siteMap } from "@/lib/site-map";

export const metadata: Metadata = {
  title: "Sitemap",
  description: "Every public page on Asmita, in one place.",
};

export default function SitemapPage() {
  return (
    <AppShell>
      <div className="page-canvas">
        <section className="hero" aria-label="Sitemap">
          <div className="hero-content container section-pad">
            <div className="mx-auto max-w-5xl">
              <span className="eyebrow">Sitemap</span>
              <h1 className="mt-5 max-w-3xl text-[clamp(2.25rem,5.5vw,4rem)]">
                Every page, in one place
              </h1>
              <p className="font-size-large mt-5 max-w-2xl">
                Case pages you open after signing in are private and are not listed here.
              </p>
            </div>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        <section className="section-pad" aria-label="All pages">
          <div className="container">
            <div className="mx-auto grid max-w-5xl gap-12 sm:grid-cols-2 lg:grid-cols-3">
              {siteMap.map((group) => (
                <div key={group.title}>
                  <h2 className="text-[24px]">{group.title}</h2>
                  <ul className="mt-5 space-y-3 border-t border-[var(--color-ash)] pt-5">
                    {group.links.map((link) => (
                      <li key={link.href}>
                        <Link href={link.href} className="text-link font-medium">
                          {link.label}
                        </Link>
                        {link.note && (
                          <p className="mt-0.5 text-sm text-[var(--color-graphite)]">{link.note}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
