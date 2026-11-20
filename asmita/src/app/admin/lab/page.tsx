import Link from "next/link";
import { deniedFor } from "@/app/(admin)/page-permission";
import { labEnabled } from "@/lib/lab/flags";
import { labDashboardStats } from "@/lib/lab/lab-stats";
import { LAB_CHOKEPOINT_KINDS, type LabChokepointKind } from "@/lib/lab/lab-store";
import { LabOffBanner } from "./LabOffBanner";

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<LabChokepointKind, string> = {
  HOST: "Hosting providers",
  CDN: "CDNs",
  REGISTRAR: "Registrars",
  PAYMENT_PROCESSOR: "Payment processors",
  APP_STORE: "App stores",
  AD_NETWORK: "Ad networks",
  PLATFORM_ACCOUNT: "Platform accounts",
};

export default async function LabDashboardPage() {
  const denied = await deniedFor("lab:manage");
  if (denied) return denied;
  const enabled = labEnabled();
  const stats = await labDashboardStats();

  return (
    <section>
      <p className="eyebrow">Console · Lab</p>
      <h1 className="mt-3">AI Lab</h1>
      <p className="muted mt-4 max-w-2xl text-sm">
        The research side of Asmita (docs/lab/charter.md): experiments across stopping AI-made and morphed intimate
        images, tracking where they spread, and getting them taken down. E2 maps the services that make them and
        reports them to the companies those services depend on.
      </p>
      {!enabled && <LabOffBanner />}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="a-card p-4">
          <p className="eyebrow">Services</p>
          <p className="mt-2 text-2xl font-medium tabular-nums">{stats.servicesTotal}</p>
          <p className="muted mt-1 text-sm">
            {stats.servicesByStatus.ACTIVE} active · {stats.servicesByStatus.DOWN} down · {stats.servicesByStatus.UNKNOWN} unknown
          </p>
          <Link href="/admin/lab/services" className="mt-3 inline-block text-sm underline">
            Services and chokepoints
          </Link>
        </div>
        <div className="a-card p-4">
          <p className="eyebrow">Reports</p>
          <p className="mt-2 text-2xl font-medium tabular-nums">{stats.reports.sent}</p>
          <p className="muted mt-1 text-sm">
            {stats.reports.drafts} in draft · {stats.reports.awaitingOutcome} awaiting an outcome
          </p>
          <Link href="/admin/lab/reports" className="mt-3 inline-block text-sm underline">
            Draft, review and send
          </Link>
        </div>
        <div className="a-card p-4">
          <p className="eyebrow">Down within 30 days of first report</p>
          <p className="mt-2 text-2xl font-medium tabular-nums">
            {stats.downWithin30Days.reported === 0
              ? "—"
              : `${stats.downWithin30Days.downWithin} / ${stats.downWithin30Days.reported}`}
          </p>
          <p className="muted mt-1 text-sm">
            The E2 metric: how many reported services went down within 30 days of the first report.
          </p>
        </div>
      </div>

      <div className="overflow-hidden a-card mt-6">
        <table className="a-table w-full text-left text-sm">
          <caption className="sr-only">Median days from first report to down, per provider kind</caption>
          <thead>
            <tr>
              <th className="eyebrow" scope="col">Provider kind</th>
              <th className="eyebrow" scope="col">Median days, first report to down</th>
            </tr>
          </thead>
          <tbody>
            {LAB_CHOKEPOINT_KINDS.map((kind) => (
              <tr key={kind}>
                <td>{KIND_LABELS[kind]}</td>
                <td className="tabular-nums">{stats.medianDaysByKind[kind] === null ? "—" : stats.medianDaysByKind[kind]?.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted mt-4 max-w-2xl text-sm">
        Chokepoint counts per kind and the first-report-to-down median are aggregate research numbers only; nothing on
        the public /lab page names or links a service. Overall median so far:{" "}
        {stats.medianDaysOverall === null ? "no service has gone down after a report yet" : `${stats.medianDaysOverall.toFixed(1)} days`}.
      </p>
    </section>
  );
}
