import { AppShell } from "@/components/layout/AppShell";
import { RegisterForm } from "./RegisterForm";
import { FlowProgress } from "@/components/FlowProgress";
import { getLocale } from "@/lib/get-locale";

export default async function RegisterPage() {
  const locale = await getLocale();

  return (
    <AppShell>
      <div className="page-canvas">
        <div className="container py-8 md:py-20">
          <div className="mx-auto max-w-xl">
            <FlowProgress step={3} locale={locale} />
            <RegisterForm locale={locale} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
