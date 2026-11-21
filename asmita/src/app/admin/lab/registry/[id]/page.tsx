import Link from "next/link";
import { notFound } from "next/navigation";
import { deniedFor } from "@/app/(admin)/page-permission";
import { labEnabled } from "@/lib/lab/flags";
import { labRegistryServiceDetail } from "@/lib/lab/lab-registry";
import { LabOffBanner } from "../../LabOffBanner";
import { LinkReview, PromoteFinding, ScanNowButton } from "./ServiceActions";

export const dynamic = "force-dynamic";

// WP115 (research-tools-spec.md): one service's registry page — addresses
// and liveness, the infrastructure findings grouped by category with their
// evidence and "switched from" history, related services to confirm or
// dismiss, the existing chokepoints and reports, and the scan-now action.

const CONFIDENCE_LABEL: Record<string, string> = { HIGH: "high", MEDIUM: "medium", LOW: "low" };

function dayOf(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "—";
}

export default async function LabRegistryServicePage({ params }: { params: Promise<{ id: string }> }) {
  const denied = await deniedFor("lab:manage");
  if (denied) return denied;
  const { id } = await params;
  const detail = await labRegistryServiceDetail(id);
  if (!detail) notFound();
  const { service, scans, categoryGroups, links, chokepoints, reports, providers } = detail;
  const enabled = labEnabled();

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1>{service.name}</h1>
        <Link className="text-sm underline" href="/admin/lab/registry">Back to the registry</Link>
      </div>
      <p className="muted mt-3 text-sm">
        {service.kind}
        {" · "}
        {service.status === "DOWN"
          ? <span className="font-medium text-[var(--coral-ink)]">DOWN{service.downSince ? ` since ${dayOf(service.downSince)}` : ""}</span>
          : service.status}
        {service.lastCheckedAt && ` · liveness checked ${dayOf(service.lastCheckedAt)}`}
      </p>
      {!enabled && <LabOffBanner />}

      <h2 className="mt-8">Addresses and liveness</h2>
      <div className="mt-3 overflow-hidden a-card">
        <table className="a-table w-full text-left text-sm">
          <caption className="sr-only">Addresses and liveness</caption>
          <thead>
            <tr>
              <th className="eyebrow" scope="col">Address</th>
              <th className="eyebrow" scope="col">Last check</th>
            </tr>
          </thead>
          <tbody>
            {service.urls.map((url) => {
              const status = service.urlStatuses?.find((entry) => entry.url === url);
              return (
                <tr key={url}>
                  <td className="font-mono">{url}</td>
                  <td>
                    {!status
                      ? <span className="muted">never</span>
                      : status.up
                        ? <span className="font-medium">up</span>
                        : <span className="font-medium text-[var(--coral-ink)]">down</span>}
                    {status && <span className="muted"> · {dayOf(status.checkedAt)}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
        <h2>Infrastructure</h2>
        <ScanNowButton serviceId={service.id} disabled={!enabled} />
      </div>
      {categoryGroups.length === 0 ? (
        <p className="muted mt-3 text-sm">
          No scan has recorded a finding yet. &quot;Scan now&quot; fetches the service&apos;s public landing page once
          (no JavaScript, at most 1 MB) and records only the extracted evidence.
        </p>
      ) : (
        <div className="mt-3 grid gap-6">
          {categoryGroups.map((group) => (
            <div key={group.category} className="a-card p-4">
              <h3 className="text-base font-semibold">{group.category}</h3>
              <div className="mt-3 overflow-x-auto">
                <table className="a-table w-full min-w-[720px] text-left text-sm">
                  <caption className="sr-only">{group.category} findings</caption>
                  <thead>
                    <tr>
                      <th className="eyebrow" scope="col">Value</th>
                      <th className="eyebrow" scope="col">Provider</th>
                      <th className="eyebrow" scope="col">Evidence</th>
                      <th className="eyebrow" scope="col">Confidence</th>
                      <th className="eyebrow" scope="col">First seen</th>
                      <th className="eyebrow" scope="col">Last seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.active.map((finding) => (
                      <tr key={finding.id}>
                        <td className="font-mono">{finding.value}</td>
                        <td>{finding.providerName ?? <span className="muted">—</span>}</td>
                        <td className="max-w-72">{finding.evidence}</td>
                        <td>{CONFIDENCE_LABEL[finding.confidence] ?? finding.confidence}</td>
                        <td className="a-nowrap tabular-nums">{dayOf(finding.firstSeenAt)}</td>
                        <td className="a-nowrap tabular-nums">{dayOf(finding.lastSeenAt)}</td>
                      </tr>
                    ))}
                    {group.inactive.map((finding) => (
                      <tr key={finding.id}>
                        <td className="font-mono">
                          <span className="muted line-through">{finding.value}</span>
                        </td>
                        <td>{finding.providerName ?? <span className="muted">—</span>}</td>
                        <td className="max-w-72">
                          <span className="muted">{finding.evidence}</span>
                        </td>
                        <td><span className="muted">{CONFIDENCE_LABEL[finding.confidence] ?? finding.confidence}</span></td>
                        <td className="a-nowrap tabular-nums"><span className="muted">{dayOf(finding.firstSeenAt)}</span></td>
                        <td className="a-nowrap tabular-nums"><span className="muted">{dayOf(finding.lastSeenAt)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {group.inactive.length > 0 && (
                <p className="muted mt-2 text-sm">
                  Struck-through rows are what earlier scans saw and the newest scan no longer does: this service
                  switched {group.category.toLowerCase().replace(/_/g, " ")} provider.
                </p>
              )}
              {group.active
                .filter((finding) => finding.promotableKind !== null && !finding.promotedAt)
                .map((finding) => (
                  <PromoteFinding
                    key={finding.id}
                    findingId={finding.id}
                    providers={providers
                      .filter((provider) => provider.kind === finding.promotableKind)
                      .map((provider) => ({
                        id: provider.id,
                        name: provider.name,
                        verified: provider.verifiedAt !== null,
                        abuseEmail: provider.abuseEmail,
                      }))}
                    defaultProviderId={finding.providerId}
                    defaultContact={
                      finding.providerId
                        ? (() => {
                          const provider = providers.find((entry) => entry.id === finding.providerId);
                          return provider && provider.verifiedAt !== null ? provider.abuseEmail ?? "" : "";
                        })()
                        : ""
                    }
                  />
                ))}
              {group.active.some((finding) => finding.promotedAt) && (
                <p className="mt-2 text-sm text-[var(--brand)]">
                  {group.active.filter((finding) => finding.promotedAt).length} finding(s) promoted to a chokepoint.
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <h2 className="mt-8">Recent scans</h2>
      <div className="mt-3 overflow-hidden a-card">
        <table className="a-table w-full min-w-[720px] text-left text-sm">
          <caption className="sr-only">Recent scans of this service</caption>
          <thead>
            <tr>
              <th className="eyebrow" scope="col">Address</th>
              <th className="eyebrow" scope="col">Result</th>
              <th className="eyebrow" scope="col">Scanned</th>
              <th className="eyebrow" scope="col">Signatures</th>
            </tr>
          </thead>
          <tbody>
            {scans.length === 0 && (
              <tr><td className="muted" colSpan={4}>Never scanned.</td></tr>
            )}
            {[...scans].reverse().slice(0, 5).map((scan) => (
              <tr key={scan.id}>
                <td className="font-mono">{scan.url}</td>
                <td>
                  {scan.error
                    ? <span className="text-[var(--coral-ink)]">{scan.error}</span>
                    : <span className="font-medium">{scan.httpStatus ?? "ok"}</span>}
                  {scan.finalUrl && scan.finalUrl !== scan.url && <span className="muted"> · redirected</span>}
                </td>
                <td className="a-nowrap tabular-nums">{dayOf(scan.scannedAt)}</td>
                <td className="font-mono">{scan.signatureVersion}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8">Related services</h2>
      {links.length === 0 ? (
        <p className="muted mt-3 text-sm">
          No cluster candidate links this service yet. Scans create them when two services share an analytics ID,
          crypto address, resolved IP, nameserver set or TLS name.
        </p>
      ) : (
        <div className="mt-3 overflow-hidden a-card">
          <table className="a-table w-full min-w-[840px] text-left text-sm">
            <caption className="sr-only">Cluster links with this service</caption>
            <thead>
              <tr>
                <th className="eyebrow" scope="col">Service</th>
                <th className="eyebrow" scope="col">Reason</th>
                <th className="eyebrow" scope="col">Shared value</th>
                <th className="eyebrow" scope="col">Status</th>
                <th className="eyebrow" scope="col"> </th>
              </tr>
            </thead>
            <tbody>
              {links.map(({ link, otherServiceName }) => (
                <tr key={link.id}>
                  <td className="font-medium">
                    <Link className="underline" href={`/admin/lab/registry/${link.serviceAId === service.id ? link.serviceBId : link.serviceAId}`}>
                      {otherServiceName}
                    </Link>
                  </td>
                  <td>{link.reason}</td>
                  <td className="font-mono">{link.value}</td>
                  <td>
                    {link.status === "CONFIRMED" && <span className="font-medium">confirmed</span>}
                    {link.status === "CANDIDATE" && <span className="text-[var(--coral-ink)]">to review</span>}
                    {link.status === "DISMISSED" && <span className="muted">dismissed</span>}
                  </td>
                  <td className="a-nowrap">
                    <LinkReview linkId={link.id} status={link.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mt-8">Chokepoints</h2>
      {chokepoints.length === 0 ? (
        <p className="muted mt-3 text-sm">
          No chokepoint recorded yet. Promote a finding above, or add one by hand on the{" "}
          <Link className="underline" href="/admin/lab/chokepoints">chokepoints page</Link>.
        </p>
      ) : (
        <div className="mt-3 overflow-hidden a-card">
          <table className="a-table w-full min-w-[840px] text-left text-sm">
            <caption className="sr-only">Chokepoints recorded for this service</caption>
            <thead>
              <tr>
                <th className="eyebrow" scope="col">Kind</th>
                <th className="eyebrow" scope="col">Provider</th>
                <th className="eyebrow" scope="col">Abuse contact</th>
                <th className="eyebrow" scope="col">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {chokepoints.map((chokepoint) => (
                <tr key={chokepoint.id}>
                  <td>{chokepoint.kind}</td>
                  <td className="font-medium">{chokepoint.provider}</td>
                  <td>{chokepoint.abuseContact}</td>
                  <td className="max-w-72">{chokepoint.evidenceNotes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mt-8">Reports</h2>
      {reports.length === 0 ? (
        <p className="muted mt-3 text-sm">No report drafted for this service yet.</p>
      ) : (
        <div className="mt-3 overflow-hidden a-card">
          <table className="a-table w-full min-w-[840px] text-left text-sm">
            <caption className="sr-only">Reports for this service</caption>
            <thead>
              <tr>
                <th className="eyebrow" scope="col">Provider</th>
                <th className="eyebrow" scope="col">Kind</th>
                <th className="eyebrow" scope="col">Status</th>
                <th className="eyebrow" scope="col">Sent</th>
                <th className="eyebrow" scope="col">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.id}>
                  <td className="font-medium">{report.provider}</td>
                  <td>{report.templateKind}</td>
                  <td>
                    {report.status === "DRAFT" ? "Draft" : report.channel === "EMAIL" ? "Sent by email" : "Sent by web form"}
                  </td>
                  <td className="a-nowrap tabular-nums">{dayOf(report.sentAt)}</td>
                  <td>{report.outcome ?? (report.status === "SENT" ? "awaiting" : "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted mt-4 text-sm">
        Reports are drafted, reviewed, sent and recorded on the{" "}
        <Link className="underline" href="/admin/lab/reports">reports page</Link>; a sent report never changes.
      </p>
    </section>
  );
}
