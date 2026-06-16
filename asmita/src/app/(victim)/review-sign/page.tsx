import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { requireSession } from "@/lib/auth/middleware";
import { ReviewSignForm } from "./ReviewSignForm";

export default async function ReviewSignPage() {
  const auth = await requireSession({ adultOnly: true });
  if (!auth.ok) {
    redirect("/register");
  }

  return (
    <AppShell>
      <div className="page-canvas">
        <div className="container py-16 md:py-24">
          <ReviewSignForm />
        </div>
      </div>
    </AppShell>
  );
}
