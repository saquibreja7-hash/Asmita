import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { requireSession } from "@/lib/auth/middleware";
import { ReviewSignForm } from "./ReviewSignForm";
import { getLocale } from "@/lib/get-locale";

export default async function ReviewSignPage() {
  const auth = await requireSession({ adultOnly: true });
  if (!auth.ok) {
    redirect("/register");
  }
  const locale = await getLocale();

  return (
    <AppShell>
      <div className="page-canvas">
        <div className="container py-16 md:py-24">
          <ReviewSignForm locale={locale} />
        </div>
      </div>
    </AppShell>
  );
}
