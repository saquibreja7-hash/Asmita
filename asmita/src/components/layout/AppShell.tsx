import { cookies } from "next/headers";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { normalizeLocale } from "@/lib/i18n";
import { COOKIE_BASE_NAMES } from "@/lib/cookie-names";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(COOKIE_BASE_NAMES.language)?.value);
  return (
    <div className="page-shell">
      <Header locale={locale} />
      <main className="flex-1" id="main" tabIndex={-1}>
        {children}
      </main>
      <Footer locale={locale} />
    </div>
  );
}
