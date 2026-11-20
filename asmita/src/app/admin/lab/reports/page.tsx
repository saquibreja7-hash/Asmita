import { deniedFor } from "@/app/(admin)/page-permission";
import { listLabChokepoints } from "@/lib/lab/lab-chokepoints";
import { listLabReports } from "@/lib/lab/lab-reports";
import { labEnabled } from "@/lib/lab/flags";
import { LabOffBanner } from "../LabOffBanner";
import { ReportsManager } from "./ReportsManager";

export const dynamic = "force-dynamic";

export default async function LabReportsPage() {
  const denied = await deniedFor("lab:manage");
  if (denied) return denied;
  const [chokepoints, reports] = await Promise.all([listLabChokepoints(), listLabReports()]);

  return (
    <section>
      <p className="eyebrow">Console · Lab</p>
      <h1 className="mt-3">Reports</h1>
      <p className="muted mt-4 max-w-2xl text-sm">
        E2 (docs/lab/charter.md): a report is drafted from the per-kind template filled with the service&apos;s data,
        reviewed here, and then sent by email under the lab sender address or copied into the provider&apos;s own web
        form. What was sent never changes; the outcome is recorded when the provider replies or does not.
      </p>
      {!labEnabled() && <LabOffBanner />}
      <div className="mt-6">
        <ReportsManager
          chokepoints={chokepoints.map((chokepoint) => ({
            id: chokepoint.id,
            label: `${chokepoint.serviceName} · ${chokepoint.kind} · ${chokepoint.provider}`,
            abuseContact: chokepoint.abuseContact,
          }))}
          reports={reports}
          labEnabled={labEnabled()}
        />
      </div>
    </section>
  );
}
