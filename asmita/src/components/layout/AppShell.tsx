import { cookies } from "next/headers";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { SupportPanel } from "@/components/layout/SupportPanel";
import { normalizeLocale } from "@/lib/i18n";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get("asmita_lang")?.value);
  return (
    <div className="page-shell">
      <Header locale={locale} />
      <main className="flex-1">{children}</main>
      <Footer />
      <SupportPanel locale={locale} />
    </div>
  );
}
