import { AppShell } from "@/components/layout/AppShell";
import { EligibilityWizard } from "./EligibilityWizard";

export default function EligibilityPage() {
  return (
    <AppShell>
      <div className="page-canvas">
        <section className="container pb-10 pt-20 text-center md:pb-12 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              Check eligibility
            </span>
            <p className="muted mt-3 text-xs tracking-wide">
              No data is collected on this page
            </p>
          </div>
        </section>

        <section className="container pb-24 md:pb-32">
          <div className="mx-auto max-w-xl">
            <EligibilityWizard />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
