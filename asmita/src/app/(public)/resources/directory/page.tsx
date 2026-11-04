import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { directory, directoryLastVerified } from "@/lib/resources-content";
import { directoryHi } from "@/lib/resources-content-hi";
import { getLocale } from "@/lib/get-locale";

export const metadata: Metadata = {
  title: "Support directory",
  description:
    "Verified helplines, government portals, image-removal tools, and free legal aid across India.",
};

export default async function DirectoryPage() {
  const locale = await getLocale();
  const say = (en: string, hi: string) => locale === "hi" ? hi : en;
  return (
    <AppShell>
      <div className="page-canvas">
        <section className="hero" aria-label={say("Support directory", "सहायता सूची")}>
          <div className="hero-content container section-pad">
            <div className="mx-auto max-w-3xl">
              <p className="text-sm">
                <Link href="/resources" className="text-link font-medium">
                  {say("Resources", "संसाधन")}
                </Link>
              </p>
              <h1 className="page-title mt-4">
                {say("Support directory", "सहायता सूची")}
              </h1>
              <p className="font-size-large mt-5 max-w-2xl text-[var(--ink)]">
                {say("Public helplines and support services in India. Availability and hours can change; check the linked service before relying on it.", "भारत की सार्वजनिक हेल्पलाइन और सहायता सेवाएँ। उपलब्धता और समय बदल सकते हैं; सेवा पर भरोसा करने से पहले उसका लिंक जाँचें।")}
              </p>
              <p className="eyebrow mt-6">
                {say("Last complete directory verification", "पूरी सूची की पिछली जाँच")}: {directoryLastVerified}.
              </p>
            </div>
          </div>
        </section>

        <section className="zone-white section-pad !pt-4" aria-label={say("Directory", "सहायता सूची")}>
          <div className="container">
            <div className="mx-auto max-w-3xl space-y-12">
              {directory.map((group, groupIndex) => (
                <div key={group.group}>
                  <h2 className="subsection-title">
                    {say(group.group, directoryHi[groupIndex].group)}
                  </h2>
                  <ul className="mt-5 space-y-3">
                    {group.items.map((item, itemIndex) => (
                      <li
                        key={item.name}
                        className="rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-6 shadow-[var(--shadow-sm)]"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="max-w-xl">
                            <p className="text-[16px] font-medium text-[var(--ink)]">
                              {say(item.name, directoryHi[groupIndex].items[itemIndex].name)}
                              {item.note && (
                                <span className="ml-2 rounded-full bg-[var(--brand-soft)] px-2 py-0.5 text-[11px] font-medium uppercase tracking-[-0.033em] text-[var(--ink)]">
                                  {say(item.note, "note" in directoryHi[groupIndex].items[itemIndex] ? directoryHi[groupIndex].items[itemIndex].note : item.note)}
                                </span>
                              )}
                            </p>
                            <p className="mt-1.5 text-sm leading-[1.6] text-[var(--text-muted)]">
                              {say(item.what, directoryHi[groupIndex].items[itemIndex].what)}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            {item.tel && (
                              <a
                                href={`tel:${item.tel}`}
                                className="btn btn-primary !m-0 !min-h-[40px] !px-4 !text-[14px]"
                              >
                                {say("Call", "कॉल करें")} {item.tel}
                              </a>
                            )}
                            {item.href && (
                              <a
                                href={item.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-secondary !m-0 !min-h-[40px] !px-4 !text-[14px]"
                              >
                                {say("Visit", "वेबसाइट देखें")} ↗
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

        <section className="zone-sunset" aria-label={say("Get help", "मदद लें")}>
          <div className="zone-sunset-content container section-pad text-center">
            <div className="mx-auto max-w-2xl">
              <h2 className="section-title">
                {say("Want help preparing a report?", "रिपोर्ट तैयार करने में मदद चाहिए?")}
              </h2>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link className="btn btn-primary btn-arrow !m-0" href="/get-help">
                  {say("Get help", "मदद लें")}
                </Link>
                <Link className="btn btn-secondary btn-arrow !m-0" href="/resources/legal">
                  {say("Your legal rights", "आपके कानूनी अधिकार")}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
