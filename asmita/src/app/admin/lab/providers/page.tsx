import { deniedFor } from "@/app/(admin)/page-permission";
import { labEnabled } from "@/lib/lab/flags";
import { labProviderDirectory } from "@/lib/lab/lab-registry";
import { LabOffBanner } from "../LabOffBanner";
import { ProvidersManager } from "./ProvidersManager";

export const dynamic = "force-dynamic";

// WP115 (research-tools-spec.md): the provider directory — the companies an
// abuse report can go to, with how many services depend on each and how its
// reports turned out. English, like the rest of the console.

export default async function LabProvidersPage() {
  const denied = await deniedFor("lab:manage");
  if (denied) return denied;
  const directory = await labProviderDirectory();

  return (
    <section>
      <h1>Provider directory</h1>
      <p className="muted mt-4 max-w-2xl text-sm">
        The companies the registry reports to: hosts, CDNs, registrars, payment processors, app stores, ad networks and
        platforms. A row carries only what an analyst verified against the provider&apos;s own site — a seed starts
        unverified, with no abuse email, until someone confirms it. Verifying records who verified it and when.
      </p>
      {!labEnabled() && <LabOffBanner />}
      <div className="mt-6">
        <ProvidersManager
          labEnabled={labEnabled()}
          providers={directory.map((entry) => ({
            id: entry.provider.id,
            name: entry.provider.name,
            kind: entry.provider.kind,
            website: entry.provider.website,
            abusePageUrl: entry.provider.abusePageUrl,
            abuseEmail: entry.provider.abuseEmail,
            policyUrl: entry.provider.policyUrl,
            notes: entry.provider.notes,
            verifiedAt: entry.provider.verifiedAt,
            dependents: entry.dependents.map((dependent) => ({
              id: dependent.id,
              name: dependent.name,
              kind: dependent.kind,
              viaChokepoint: dependent.viaChokepoint,
              viaFinding: dependent.viaFinding,
            })),
            reports: entry.reports,
          }))}
        />
      </div>
    </section>
  );
}
