import Link from "next/link";
import { deniedFor } from "@/app/(admin)/page-permission";
import { labRegistryData } from "@/lib/lab/lab-registry";
import { labEnabled } from "@/lib/lab/flags";
import { LAB_SERVICE_STATUSES, type LabInfraCategory, type LabServiceStatus } from "@/lib/lab/lab-store";
import { LAB_RESEARCH_CREDITS } from "@/lib/lab/research-credits";
import { LabOffBanner } from "../LabOffBanner";

export const dynamic = "force-dynamic";

// WP115 (research-tools-spec.md): the registry table — every tracked service
// with its liveness status, its last infrastructure scan, its chokepoints by
// category and its cluster badge, filterable by status, category and
// provider. English, like the rest of the console. Each row opens the
// service's own registry page.

function isValidStatus(value: string): value is LabServiceStatus {
  return (LAB_SERVICE_STATUSES as readonly string[]).includes(value);
}

function isValidCategory(value: string): value is LabInfraCategory {
  return /^[A-Z_]+$/.test(value);
}

export default async function LabRegistryPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; category?: string; provider?: string }>;
}) {
  const denied = await deniedFor("lab:manage");
  if (denied) return denied;
  const params = await searchParams;
  const filters = {
    status: params.status && isValidStatus(params.status) ? params.status : undefined,
    category: params.category && isValidCategory(params.category) ? params.category : undefined,
    provider: params.provider?.slice(0, 200) || undefined,
  };
  const data = await labRegistryData(filters);

  return (
    <section>
      <h1>Service registry</h1>
      <p className="muted mt-4 max-w-2xl text-sm">
        Every tracked service with what the weekly infrastructure scan last saw: the companies it depends on, its
        chokepoints, and the other services it appears to share an operator with. Open a service to read the evidence,
        promote a finding to a chokepoint, review its cluster links, and scan it again.
      </p>
      {!labEnabled() && <LabOffBanner />}

      <form className="a-card mt-6 grid gap-4 p-4 sm:grid-cols-4" method="get">
        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor="registry-filter-status">Status</label>
          <select id="registry-filter-status" name="status" className="field" defaultValue={filters.status ?? ""}>
            <option value="">All</option>
            {LAB_SERVICE_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </div>
        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor="registry-filter-category">Scan category</label>
          <select id="registry-filter-category" name="category" className="field" defaultValue={filters.category ?? ""}>
            <option value="">All</option>
            {data.categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </div>
        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor="registry-filter-provider">Provider</label>
          <select id="registry-filter-provider" name="provider" className="field" defaultValue={filters.provider ?? ""}>
            <option value="">All</option>
            {data.providerNames.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button className="btn btn-primary px-4 py-1 text-sm" type="submit">Apply filters</button>
          {(filters.status || filters.category || filters.provider) && (
            <Link className="btn btn-secondary px-4 py-1 text-sm" href="/admin/lab/registry">Clear</Link>
          )}
        </div>
      </form>

      <div className="mt-6 overflow-hidden a-card">
        <table className="a-table w-full min-w-[960px] text-left text-sm">
          <caption className="sr-only">Tracked services with scan, chokepoint and cluster status</caption>
          <thead>
            <tr>
              <th className="eyebrow" scope="col">Service</th>
              <th className="eyebrow" scope="col">Kind</th>
              <th className="eyebrow" scope="col">Status</th>
              <th className="eyebrow" scope="col">Last scan</th>
              <th className="eyebrow" scope="col">Chokepoints</th>
              <th className="eyebrow" scope="col">Cluster</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 && (
              <tr><td className="muted" colSpan={6}>No service matches these filters.</td></tr>
            )}
            {data.rows.map((row) => (
              <tr key={row.service.id}>
                <td className="font-medium">
                  <Link className="underline" href={`/admin/lab/registry/${row.service.id}`}>{row.service.name}</Link>
                </td>
                <td>{row.service.kind}</td>
                <td>
                  {row.service.status === "DOWN"
                    ? <span className="font-medium text-[var(--coral-ink)]">DOWN</span>
                    : row.service.status}
                </td>
                <td className="a-nowrap tabular-nums">{row.lastScanAt?.slice(0, 10) ?? "—"}</td>
                <td>
                  {row.chokepointTotal === 0
                    ? <span className="muted">—</span>
                    : (
                      <span>
                        <span className="tabular-nums font-medium">{row.chokepointTotal}</span>
                        <span className="muted">
                          {" "}
                          {Object.entries(row.chokepointsByKind).map(([kind, count]) => `${kind} ×${count}`).join(", ")}
                        </span>
                      </span>
                    )}
                </td>
                <td>
                  {row.confirmedLinks === 0 && row.candidateLinks === 0
                    ? <span className="muted">—</span>
                    : (
                      <span>
                        {row.confirmedLinks > 0 && (
                          <span className="font-medium">{row.confirmedLinks} linked</span>
                        )}
                        {row.confirmedLinks > 0 && row.candidateLinks > 0 && " · "}
                        {row.candidateLinks > 0 && <span className="text-[var(--coral-ink)]">{row.candidateLinks} to review</span>}
                      </span>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="muted mt-4 max-w-2xl text-sm">
        The scanner fetches one public, JavaScript-free copy of a service&apos;s landing page (at most 1 MB, 10 seconds),
        records only the extracted evidence — never the page — and never fetches anything the page references. Findings
        that stop appearing stay on record as inactive, which is how &quot;switched from X to Y&quot; is shown.
      </p>
      <p className="muted mt-4 text-sm">
        <Link className="underline" href="/admin/lab/providers">Provider directory</Link>
        {" · "}
        <Link className="underline" href="/admin/lab/services">Services</Link>
        {" · "}
        <Link className="underline" href="/admin/lab/reports">Reports</Link>
      </p>

      <details className="a-card mt-6 p-4 text-sm">
        <summary className="cursor-pointer font-medium">Research behind this</summary>
        <ul className="mt-3 grid gap-2 pl-1">
          {LAB_RESEARCH_CREDITS.map((credit) => (
            <li key={credit.url}>
              <a className="underline" href={credit.url} rel="noopener noreferrer" target="_blank">{credit.label}</a>
            </li>
          ))}
        </ul>
        <p className="muted mt-3">
          This registry follows the published research on the nudify ecosystem: its concentration on a small set of
          hosts, registrars, payment processors and app stores, and why reporting to those companies — not to the
          services themselves — is the intervention that works.
        </p>
      </details>
    </section>
  );
}
