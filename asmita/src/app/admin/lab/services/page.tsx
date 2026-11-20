import { deniedFor } from "@/app/(admin)/page-permission";
import { listLabServices } from "@/lib/lab/lab-services";
import { labEnabled } from "@/lib/lab/flags";
import { LabOffBanner } from "../LabOffBanner";
import { ServicesManager } from "./ServicesManager";

export const dynamic = "force-dynamic";

export default async function LabServicesPage() {
  const denied = await deniedFor("lab:manage");
  if (denied) return denied;
  const services = await listLabServices();

  return (
    <section>
      <p className="eyebrow">Console · Lab</p>
      <h1 className="mt-3">Services</h1>
      <p className="muted mt-4 max-w-2xl text-sm">
        E2 (docs/lab/charter.md): the services that make &apos;undress&apos; or face-swap images — apps, websites, chat
        bots, channels, social accounts — with the addresses the daily liveness check watches. Research data: real
        names and URLs live only in this database, never in code or docs.
      </p>
      {!labEnabled() && <LabOffBanner />}
      <div className="mt-6">
        <ServicesManager services={services} labEnabled={labEnabled()} />
      </div>
    </section>
  );
}
