import { listFlaggedLinks } from "@/lib/admin-cases";
import { FlaggedTable } from "./FlaggedTable";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { deniedFor } from "../page-permission";

export default async function FlaggedPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const denied = await deniedFor("cases:read");
  if (denied) return denied;
  const canReview = (await requireAdminPermission("cases:review")).ok;
  const params = (await searchParams) || {};
  const filters = {
    platform: single(params.platform),
    reason: single(params.reason),
    age: single(params.age),
    status: single(params.status),
    accountAge: single(params.accountAge),
  };
  const rows = (await listFlaggedLinks()).filter((row) => {
    const platformMatch =
      !filters.platform ||
      row.platformName.toLowerCase().includes(filters.platform.toLowerCase());
    const reasonMatch =
      !filters.reason ||
      row.reason.toLowerCase().includes(filters.reason.toLowerCase());
    const statusMatch =
      !filters.status || filters.status === "all" || row.status === filters.status;
    const ageMatch =
      !filters.age ||
      filters.age === "all" ||
      (filters.age === "breached"
        ? row.slaState === "breached"
        : row.slaState !== "breached");
    const accountAgeMatch =
      !filters.accountAge ||
      filters.accountAge === "all" ||
      (filters.accountAge === "new"
        ? row.ageMinutes < 60
        : row.ageMinutes >= 60);
    return (
      platformMatch && reasonMatch && statusMatch && ageMatch && accountAgeMatch
    );
  });

  return (
    <section>
      <div>
        <p className="eyebrow">
          Console · Flagged
        </p>
        <h1 className="page-title-sm mt-3">
          Flagged review queue
        </h1>
      </div>

      <form className="mt-10 grid gap-4 md:grid-cols-5">
        <FilterField label="Platform">
          <input
            className="field"
            defaultValue={filters.platform || ""}
            name="platform"
            placeholder="Any platform"
          />
        </FilterField>
        <FilterField label="Reason">
          <input
            className="field"
            defaultValue={filters.reason || ""}
            name="reason"
            placeholder="Any reason"
          />
        </FilterField>
        <FilterField label="Queue age">
          <select
            className="field"
            defaultValue={filters.age || "all"}
            name="age"
          >
            <option value="all">All</option>
            <option value="within">Within SLA</option>
            <option value="breached">SLA breached</option>
          </select>
        </FilterField>
        <FilterField label="Review status">
          <select
            className="field"
            defaultValue={filters.status || "all"}
            name="status"
          >
            <option value="all">All</option>
            <option value="PENDING_REVIEW">Pending</option>
            <option value="NOTICE_QUEUED">Queued</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </FilterField>
        <FilterField label="Account age">
          <select
            className="field"
            defaultValue={filters.accountAge || "all"}
            name="accountAge"
          >
            <option value="all">All</option>
            <option value="new">Under 1 hour</option>
            <option value="older">1 hour or more</option>
          </select>
        </FilterField>
        <button className="btn btn-primary md:col-span-5" type="submit">
          Apply filters
        </button>
      </form>

      <div className="mt-10 grid gap-6 md:grid-cols-4">
        <Metric label="Open review items" value={rows.length} />
        <Metric label="SLA target" value="4h" />
        <Metric
          label="Breached"
          value={rows.filter((row) => row.slaState === "breached").length}
        />
        <Metric
          label="Due soon"
          value={rows.filter((row) => row.slaState === "due_soon").length}
        />
      </div>

      <FlaggedTable canReview={canReview} rows={rows} />
    </section>
  );
}

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="eyebrow">
        {label}
      </span>
      {children}
    </label>
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
