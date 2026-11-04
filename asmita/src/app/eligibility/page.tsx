import { AppShell } from "@/components/layout/AppShell";
import { EligibilityWizard } from "./EligibilityWizard";
import { FlowProgress } from "@/components/FlowProgress";
import { getLocale } from "@/lib/get-locale";

export default async function EligibilityPage() {
  const locale = await getLocale();

  return (
    <AppShell>
      <div className="page-canvas">
        <div className="container py-8 md:py-20">
          <div className="mx-auto max-w-xl">
            <FlowProgress step={1} locale={locale} />
            <EligibilityWizard locale={locale} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
