import { listAdminCaseRows } from "@/lib/admin-dashboard";

export default async function AdminCasesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) || {};
  const filters = {
    status: single(params.status),
    platform: single(params.platform),
    review: single(params.review),
    escalation: single(params.escalation),
    from: single(params.from),
    to: single(params.to),
  };
  const rows = listAdminCaseRows(filters);

  return (
    <section>
      <h1 className="text-3xl font-black">Cases</h1>
      <form className="panel mt-6 grid gap-4 p-5 md:grid-cols-6">
        <label className="grid gap-2 text-sm font-bold">
          Status
          <select className="input" defaultValue={filters.status || "all"} name="status">
            <option value="all">All</option>
            <option value="OPEN">Open</option>
            <option value="RESOLVED">Resolved</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-bold">
          Platform
          <input className="input" defaultValue={filters.platform || ""} name="platform" placeholder="Any platform" />
        </label>
        <label className="grid gap-2 text-sm font-bold">
          Review
          <select className="input" defaultValue={filters.review || "all"} name="review">
            <option value="all">All</option>
            <option value="flagged">Flagged</option>
            <option value="clear">Clear</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-bold">
          Escalation
          <select className="input" defaultValue={filters.escalation || "all"} name="escalation">
            <option value="all">All</option>
            <option value="review">Review</option>
            <option value="queued">Queued</option>
            <option value="resolved">Resolved</option>
            <option value="none">None</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-bold">
          From
          <input className="input" defaultValue={filters.from || ""} name="from" type="date" />
        </label>
        <label className="grid gap-2 text-sm font-bold">
          To
          <input className="input" defaultValue={filters.to || ""} name="to" type="date" />
        </label>
        <button className="btn btn-primary md:col-span-6" type="submit">
          Apply filters
        </button>
      </form>

      <div className="panel mt-6 overflow-hidden">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-[var(--surface)]">
            <tr>
              <th className="p-4">Reference</th>
              <th className="p-4">Status</th>
              <th className="p-4">Platforms</th>
              <th className="p-4">Review flags</th>
              <th className="p-4">Escalation</th>
              <th className="p-4">Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t border-[var(--border)]" key={row.caseId}>
                <td className="p-4 font-bold">{row.referenceNumber}</td>
                <td className="p-4">{row.status}</td>
                <td className="p-4">{row.platforms.join(", ") || "Unclassified"}</td>
                <td className="p-4">{row.reviewFlagCount}</td>
                <td className="p-4">{row.escalationState}</td>
                <td className="p-4">{new Date(row.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="p-5 text-sm text-[var(--muted)]">No cases match these filters.</p> : null}
      </div>
    </section>
  );
}

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
