import { calculateCaseMilestone } from "@/lib/milestones";
import { cases, ensureDemoCase } from "@/lib/store";

export default function MilestonesPage() {
  ensureDemoCase();
  const stats = calculateCaseMilestone(Array.from(cases.values()));

  return (
    <section>
      <p className="text-sm font-bold uppercase text-[var(--muted)]">Milestone tracking</p>
      <h1 className="mt-2 text-3xl font-black">100-case milestone</h1>
      <div className="mt-6 grid gap-4 md:grid-cols-4">
        {[
          ["Cases processed", stats.totalCases],
          ["Remaining", stats.remaining],
          ["Open", stats.openCases],
          ["Resolved", stats.resolvedCases],
        ].map(([label, value]) => (
          <div className="panel p-5" key={label}>
            <p className="text-sm text-[var(--muted)]">{label}</p>
            <p className="mt-2 text-3xl font-black">{value}</p>
          </div>
        ))}
      </div>
      <div className="panel mt-6 p-5">
        <div className="flex items-center justify-between gap-4">
          <p className="font-bold">Progress toward {stats.target} cases</p>
          <p className="font-black">{stats.progressPercent}%</p>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-[var(--surface)]">
          <div
            aria-label={`${stats.progressPercent}% of 100-case milestone`}
            className="h-full bg-[var(--teal)]"
            style={{ width: `${stats.progressPercent}%` }}
          />
        </div>
      </div>
      <div className="panel mt-6 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--surface)]">
            <tr>
              <th className="p-4">Reference</th>
              <th className="p-4">Status</th>
              <th className="p-4">Submitted URLs</th>
              <th className="p-4">Created</th>
            </tr>
          </thead>
          <tbody>
            {Array.from(cases.values()).map((record) => (
              <tr className="border-t border-[var(--border)]" key={record.id}>
                <td className="p-4 font-bold">{record.referenceNumber}</td>
                <td className="p-4">{record.status}</td>
                <td className="p-4">{record.urls.length}</td>
                <td className="p-4">{new Date(record.createdAt).toLocaleDateString("en-IN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
