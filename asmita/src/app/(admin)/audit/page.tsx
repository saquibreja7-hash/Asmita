import { listAuditLogRows } from "@/lib/admin-dashboard";

export default async function AuditPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) || {};
  const filters = {
    eventType: single(params.eventType),
    actorId: single(params.actorId),
    entityId: single(params.entityId),
  };
  const rows = listAuditLogRows(filters);

  return (
    <section>
      <h1 className="text-3xl font-black">Audit log</h1>
      <form className="panel mt-6 grid gap-4 p-5 md:grid-cols-4">
        <label className="grid gap-2 text-sm font-bold">
          Event
          <input className="input" defaultValue={filters.eventType || ""} name="eventType" placeholder="Any event" />
        </label>
        <label className="grid gap-2 text-sm font-bold">
          Actor
          <input className="input" defaultValue={filters.actorId || ""} name="actorId" placeholder="Actor id" />
        </label>
        <label className="grid gap-2 text-sm font-bold">
          Entity
          <input className="input" defaultValue={filters.entityId || ""} name="entityId" placeholder="Entity id" />
        </label>
        <button className="btn btn-primary self-end" type="submit">
          Filter
        </button>
      </form>

      <div className="panel mt-6 overflow-hidden">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-[var(--surface)]">
            <tr>
              <th className="p-4">Seq</th>
              <th className="p-4">Event</th>
              <th className="p-4">Actor</th>
              <th className="p-4">Entity</th>
              <th className="p-4">Timestamp</th>
              <th className="p-4">Hash prefix</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t border-[var(--border)]" key={row.sequence}>
                <td className="p-4">{row.sequence}</td>
                <td className="p-4 font-bold">{row.eventType}</td>
                <td className="p-4">{row.actorId}</td>
                <td className="p-4">
                  {row.entityType}: {row.entityId}
                </td>
                <td className="p-4">{new Date(row.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
                <td className="p-4">{row.eventHash}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="p-5 text-sm text-[var(--muted)]">No audit events match these filters.</p>
        ) : null}
      </div>
    </section>
  );
}

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
