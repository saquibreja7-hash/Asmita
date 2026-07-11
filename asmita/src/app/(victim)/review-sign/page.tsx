import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { requireSession } from "@/lib/auth/middleware";
import { ReviewSignForm } from "./ReviewSignForm";
import { FlowProgress } from "@/components/FlowProgress";
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
          <div className="mx-auto max-w-5xl">
            <FlowProgress step={4} locale={locale} />
          </div>
          <ReviewSignForm locale={locale} />
        </div>
      </div>
    </AppShell>
  );
}
