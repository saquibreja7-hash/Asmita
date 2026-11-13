import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/middleware";
import { QuickExit } from "@/components/QuickExit";
import { getLocale } from "@/lib/get-locale";

/*
 * Victim pages never belong in a search index and keep a neutral tab title:
 * a survivor's browser history must not read like a support-service trail.
 * Quick Exit (button + double-Escape) and the idle sign-out live here so
 * every signed-in survivor screen has them (roadmap Phase 1, item 2).
 */
export const metadata: Metadata = {
  title: "Asmita",
  robots: { index: false, follow: false },
};

export default async function VictimLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireSession();
  if (!auth.ok) {
    redirect("/start");
  }
  if (auth.ok && !auth.session.ageOver18) {
    redirect("/minor-support");
  }
  const locale = await getLocale();
  return (
    <>
      <QuickExit locale={locale} />
      {children}
    </>
  );
}
