import { cookies } from "next/headers";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { normalizeLocale } from "@/lib/i18n";
import { hasPublishedScorecard } from "@/lib/scorecard-snapshots";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get("asmita_lang")?.value);
  // The scorecard nav link appears only once a snapshot is published (WP58);
  // one existence check per page render, like the locale cookie read above.
  const scorecard = await hasPublishedScorecard();
  return (
    <div className="page-shell">
      <Header locale={locale} scorecard={scorecard} />
      <main className="flex-1">{children}</main>
      <Footer locale={locale} />
    </div>
  );
}
