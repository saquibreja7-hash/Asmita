import { deniedFor } from "@/app/(admin)/page-permission";
import { listLabChokepoints } from "@/lib/lab/lab-chokepoints";
import { listLabServices } from "@/lib/lab/lab-services";
import { rdapConfigured } from "@/lib/lab/lab-lookup";
import { labEnabled } from "@/lib/lab/flags";
import { LabOffBanner } from "../LabOffBanner";
import { ChokepointsManager } from "./ChokepointsManager";

export const dynamic = "force-dynamic";

export default async function LabChokepointsPage() {
  const denied = await deniedFor("lab:manage");
  if (denied) return denied;
  const [services, chokepoints] = await Promise.all([listLabServices(), listLabChokepoints()]);

  return (
    <section>
      <p className="eyebrow">Console · Lab</p>
      <h1 className="mt-3">Chokepoints</h1>
      <p className="muted mt-4 max-w-2xl text-sm">
        The companies a tracked service depends on — host, CDN, registrar, payment processor, app store, ad network,
        platform account — with the abuse contact copied from that provider&apos;s own abuse page. The lookup suggests a
        host and registrar from a service address (DNS plus RDAP); the analyst confirms everything by hand.
      </p>
      {!labEnabled() && <LabOffBanner />}
      <div className="mt-6">
        <ChokepointsManager
          services={services.map((service) => ({ id: service.id, name: service.name, urls: service.urls }))}
          chokepoints={chokepoints}
          rdapConfigured={rdapConfigured()}
        />
      </div>
    </section>
  );
}
