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
  const rows = await listAdminCaseRows(filters);

  return (
    <section>
      <AdminPageHeader label="Console · Cases" title="Cases" />

      <form className="mt-10 grid gap-4 md:grid-cols-6">
        <FilterField label="Status" name="status">
          <select
            className="field"
            defaultValue={filters.status || "all"}
            name="status"
          >
            <option value="all">All</option>
            <option value="OPEN">Open</option>
            <option value="RESOLVED">Resolved</option>
          </select>
        </FilterField>
        <FilterField label="Platform" name="platform">
          <input
            className="field"
            defaultValue={filters.platform || ""}
            name="platform"
            placeholder="Any platform"
          />
        </FilterField>
        <FilterField label="Review" name="review">
          <select
            className="field"
            defaultValue={filters.review || "all"}
            name="review"
          >
            <option value="all">All</option>
            <option value="flagged">Flagged</option>
            <option value="clear">Clear</option>
          </select>
        </FilterField>
        <FilterField label="Escalation" name="escalation">
          <select
            className="field"
            defaultValue={filters.escalation || "all"}
            name="escalation"
          >
            <option value="all">All</option>
            <option value="review">Review</option>
            <option value="queued">Queued</option>
            <option value="resolved">Resolved</option>
            <option value="none">None</option>
          </select>
        </FilterField>
        <FilterField label="From" name="from">
          <input
            className="field"
            defaultValue={filters.from || ""}
            name="from"
            type="date"
          />
        </FilterField>
        <FilterField label="To" name="to">
          <input
            className="field"
            defaultValue={filters.to || ""}
            name="to"
            type="date"
          />
        </FilterField>
        <button className="btn btn-primary md:col-span-6" type="submit">
          Apply filters
        </button>
      </form>

      <div className="mt-10 overflow-hidden rounded-[14px] border border-[var(--hairline)] bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--hairline)]">
              <Th>Reference</Th>
              <Th>Status</Th>
              <Th>Platforms</Th>
              <Th>Review flags</Th>
              <Th>Escalation</Th>
              <Th>Created</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                className="border-t border-[var(--hairline)]"
                key={row.caseId}
              >
                <td className="font-mono p-4 text-[var(--foreground)]">
                  {row.referenceNumber}
                </td>
                <td className="p-4 capitalize">{row.status.toLowerCase()}</td>
                <td className="p-4">
                  {row.platforms.join(", ") || (
                    <span className="text-[var(--muted)]">Unclassified</span>
                  )}
                </td>
                <td className="p-4 tabular-nums">{row.reviewFlagCount}</td>
                <td className="p-4 capitalize">{row.escalationState}</td>
                <td className="font-mono p-4 text-xs text-[var(--muted)]">
                  {new Date(row.createdAt).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="muted p-6 text-center text-sm">
            No cases match these filters.
          </p>
        )}
      </div>
    </section>
  );
}

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function AdminPageHeader({
  label,
  title,
}: {
  label: string;
  title: string;
}) {
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
        {label}
      </p>
      <h1 className="font-display mt-3 text-[32px] font-normal leading-[1.1] tracking-tight md:text-[44px] md:leading-[1.08]">
        {title}
      </h1>
    </div>
  );
}

function FilterField({
  label,
  name,
  children,
}: {
  label: string;
  name: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5" htmlFor={name}>
      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="font-mono p-4 text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
      {children}
    </th>
  );
}
