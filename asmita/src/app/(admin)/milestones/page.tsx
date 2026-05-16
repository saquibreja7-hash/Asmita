import { calculateCaseMilestone } from "@/lib/milestones";
import { listAllCases } from "@/lib/case-ops";

export default async function MilestonesPage() {
  const records = await listAllCases();
  const stats = calculateCaseMilestone(records);

  return (
    <section>
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
          Console · Milestones
        </p>
        <h1 className="font-display mt-3 text-[32px] font-normal leading-[1.1] tracking-tight md:text-[44px] md:leading-[1.08]">
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
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
            Progress toward {stats.target} cases
          </p>
          <p className="font-display text-[24px] tabular-nums">
            {stats.progressPercent}%
          </p>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--hairline)]">
          <div
            aria-label={`${stats.progressPercent}% of 100-case milestone`}
            className="h-full bg-[var(--teal)] transition-[width] duration-500"
            style={{ width: `${stats.progressPercent}%` }}
          />
        </div>
      </div>

      <div className="mt-10 overflow-hidden rounded-[14px] border border-[var(--hairline)] bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--hairline)]">
              <Th>Reference</Th>
              <Th>Status</Th>
              <Th>Submitted URLs</Th>
              <Th>Created</Th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr
                className="border-t border-[var(--hairline)]"
                key={record.id}
              >
                <td className="font-mono p-4">{record.referenceNumber}</td>
                <td className="p-4 capitalize">
                  {record.status.toLowerCase()}
                </td>
                <td className="p-4 tabular-nums">{record.urls.length}</td>
                <td className="font-mono p-4 text-xs text-[var(--muted)]">
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
    <th className="font-mono p-4 text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
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
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </p>
      <p className="font-display mt-2 text-[36px] leading-none tracking-tight text-[var(--foreground)] tabular-nums">
        {value}
      </p>
    </div>
  );
}
