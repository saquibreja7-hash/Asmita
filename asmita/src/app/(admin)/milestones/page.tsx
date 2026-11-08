import { calculateCaseMilestone } from "@/lib/milestones";
import { listAllCases } from "@/lib/case-ops";
import { deniedFor } from "../page-permission";

export default async function MilestonesPage() {
  const denied = await deniedFor("metrics:read");
  if (denied) return denied;
  const records = await listAllCases();
  const stats = calculateCaseMilestone(records);

  return (
    <section>
      <div>
        <p className="eyebrow">
          Console · Milestones
        </p>
        <h1 className="page-title-sm mt-3">
          100-case milestone
        </h1>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-4">
        <Metric label="Cases processed" value={stats.totalCases} />
        <Metric label="Remaining" value={stats.remaining} />
        <Metric label="Open" value={stats.openCases} />
        <Metric label="Resolved" value={stats.resolvedCases} />
      </div>

      <div className="mt-10">
        <div className="flex items-end justify-between gap-4">
          <p className="eyebrow">
            Progress toward {stats.target} cases
          </p>
          <p className="font-display text-[24px] tabular-nums">
            {stats.progressPercent}%
          </p>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--line)]">
          <div
            aria-label={`${stats.progressPercent}% of 100-case milestone`}
            className="h-full bg-[var(--brand)] transition-[width] duration-500"
            style={{ width: `${stats.progressPercent}%` }}
          />
        </div>
      </div>

      <div className="mt-10 overflow-hidden rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--page)]">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--line)]">
              <Th>Reference</Th>
              <Th>Status</Th>
              <Th>Submitted URLs</Th>
              <Th>Created</Th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr
                className="border-t border-[var(--line)]"
                key={record.id}
              >
                <td className="font-mono p-4">{record.referenceNumber}</td>
                <td className="p-4 capitalize">
                  {record.status.toLowerCase()}
                </td>
                <td className="p-4 tabular-nums">{record.urls.length}</td>
                <td className="font-mono p-4 text-xs text-[var(--text-muted)]">
                  {new Date(record.createdAt).toLocaleDateString("en-IN")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {records.length === 0 && (
          <p className="muted p-6 text-center text-sm">No cases yet.</p>
        )}
      </div>
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="eyebrow p-4">
      {children}
    </th>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div>
      <p className="eyebrow">
        {label}
      </p>
      <p className="font-display mt-2 text-[36px] leading-none tracking-tight text-[var(--ink)] tabular-nums">
        {value}
      </p>
    </div>
  );
}
