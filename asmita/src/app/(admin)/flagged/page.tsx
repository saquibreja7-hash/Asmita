import { listReviewQueueRows } from "@/lib/admin-dashboard";

export default async function FlaggedPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) || {};
  const filters = {
    platform: single(params.platform),
    reason: single(params.reason),
    age: single(params.age),
    status: single(params.status),
    accountAge: single(params.accountAge),
  };
  const rows = listReviewQueueRows().filter((row) => {
    const platformMatch =
      !filters.platform || row.platformName.toLowerCase().includes(filters.platform.toLowerCase());
    const reasonMatch = !filters.reason || row.reason.toLowerCase().includes(filters.reason.toLowerCase());
    const statusMatch = !filters.status || filters.status === "all" || row.status === filters.status;
    const ageMatch =
      !filters.age ||
      filters.age === "all" ||
      (filters.age === "breached" ? row.slaState === "breached" : row.slaState !== "breached");
    const accountAgeMatch =
      !filters.accountAge ||
      filters.accountAge === "all" ||
      (filters.accountAge === "new" ? row.ageMinutes < 60 : row.ageMinutes >= 60);
    return platformMatch && reasonMatch && statusMatch && ageMatch && accountAgeMatch;
  });

  return (
    <section>
      <h1 className="text-3xl font-black">Flagged review queue</h1>
      <form className="panel mt-6 grid gap-4 p-5 md:grid-cols-5">
        <label className="grid gap-2 text-sm font-bold">
          Platform
          <input className="input" defaultValue={filters.platform || ""} name="platform" placeholder="Any platform" />
        </label>
        <label className="grid gap-2 text-sm font-bold">
          Reason
          <input className="input" defaultValue={filters.reason || ""} name="reason" placeholder="Any reason" />
        </label>
        <label className="grid gap-2 text-sm font-bold">
          Queue age
          <select className="input" defaultValue={filters.age || "all"} name="age">
            <option value="all">All</option>
            <option value="within">Within SLA</option>
            <option value="breached">SLA breached</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-bold">
          Review status
          <select className="input" defaultValue={filters.status || "all"} name="status">
            <option value="all">All</option>
            <option value="PENDING_REVIEW">Pending</option>
            <option value="NOTICE_QUEUED">Queued</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-bold">
          Account age
          <select className="input" defaultValue={filters.accountAge || "all"} name="accountAge">
            <option value="all">All</option>
            <option value="new">Under 1 hour</option>
            <option value="older">1 hour or more</option>
          </select>
        </label>
        <button className="btn btn-primary md:col-span-5" type="submit">
          Apply filters
        </button>
      </form>
      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <div className="panel p-5">
          <p className="text-sm text-[var(--muted)]">Open review items</p>
          <p className="mt-2 text-3xl font-black">{rows.length}</p>
        </div>
        <div className="panel p-5">
          <p className="text-sm text-[var(--muted)]">SLA target</p>
          <p className="mt-2 text-3xl font-black">4h</p>
        </div>
        <div className="panel p-5">
          <p className="text-sm text-[var(--muted)]">Breached</p>
          <p className="mt-2 text-3xl font-black">{rows.filter((row) => row.slaState === "breached").length}</p>
        </div>
        <div className="panel p-5">
          <p className="text-sm text-[var(--muted)]">Due soon</p>
          <p className="mt-2 text-3xl font-black">{rows.filter((row) => row.slaState === "due_soon").length}</p>
        </div>
      </div>

      <div className="panel mt-6 overflow-hidden">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-[var(--surface)]">
            <tr>
              <th className="p-4">Case</th>
              <th className="p-4">Platform</th>
              <th className="p-4">Domain</th>
              <th className="p-4">Reason</th>
              <th className="p-4">Age</th>
              <th className="p-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t border-[var(--border)]" key={`${row.caseId}-${row.urlId}`}>
                <td className="p-4 font-bold">{row.referenceNumber}</td>
                <td className="p-4">{row.platformName}</td>
                <td className="p-4">{row.domain}</td>
                <td className="p-4">{row.reason}</td>
                <td className="p-4">{Math.floor(row.ageMinutes / 60)}h {row.ageMinutes % 60}m</td>
                <td className="p-4">{row.slaState}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="p-5 text-sm text-[var(--muted)]">No flagged submissions in the queue.</p>
        ) : null}
      </div>
    </section>
  );
}

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
