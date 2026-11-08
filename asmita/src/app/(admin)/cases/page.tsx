import Link from "next/link";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import {
  CASE_STATUSES,
  listAdminCases,
  listPlatformOptions,
  NEXT_ACTIONS,
  SORTS,
  type AdminCaseListRow,
  type CaseSort,
} from "@/lib/admin-cases";
import { AutoSubmitForm } from "./AutoSubmitForm";
import { CaseTable, type CaseTableRow } from "./CaseTable";
import { SavedViews } from "./SavedViews";
import { listSavedViews, sanitiseViewQuery } from "@/lib/admin-saved-views";
import {
  LADDER_STEP_LABELS,
  NEXT_ACTION_FILTER_LABELS,
  STATUS_LABELS,
  dueText,
  formatIst,
  nextActionLabel,
  shortDuration,
} from "./case-format";

export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = ["OPEN", "PARTIALLY_RESOLVED", "ESCALATED"];

const SORT_LABELS: Record<CaseSort, string> = {
  due: "Due soonest",
  newest: "Newest",
  oldest: "Oldest",
  updated: "Recently updated",
};

const VIEWS: Array<{ label: string; params: Record<string, string> }> = [
  { label: "All open", params: {} },
  { label: "Needs review", params: { nextAction: "review_links" } },
  { label: "Ready to send", params: { nextAction: "send_notice" } },
  { label: "Awaiting reply", params: { nextAction: "awaiting_reply" } },
  { label: "Blocked", params: { nextAction: "blocked" } },
  { label: "Resolved", params: { status: "RESOLVED", sort: "updated" } },
];

type Params = {
  q: string;
  status: string;
  platform: string;
  nextAction: string;
  from: string;
  to: string;
  sort: CaseSort;
};

export default async function AdminCasesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await requireAdminPermission("cases:read");
  if (!auth.ok) {
    return (
      <section>
        <AdminPageHeader label="Console · Cases" title="Cases" />
        <p className="muted mt-6 text-sm">Your admin role cannot read cases.</p>
      </section>
    );
  }

  const raw = (await searchParams) || {};
  const sortParam = single(raw.sort);
  const params: Params = {
    q: single(raw.q) ?? "",
    status: single(raw.status) ?? "active",
    platform: single(raw.platform) ?? "",
    nextAction: [...NEXT_ACTIONS, "blocked"].includes(single(raw.nextAction) ?? "")
      ? single(raw.nextAction)!
      : "",
    from: single(raw.from) ?? "",
    to: single(raw.to) ?? "",
    sort: (SORTS as readonly string[]).includes(sortParam ?? "") ? (sortParam as CaseSort) : "due",
  };
  const now = new Date();
  const [page, platforms, savedViews] = await Promise.all([
    listAdminCases(
      {
        statuses:
          params.status === "all" ? [] : params.status === "active" ? ACTIVE_STATUSES : [params.status],
        platformId: params.platform || undefined,
        nextAction: params.nextAction || undefined,
        from: params.from || undefined,
        to: params.to || undefined,
        q: params.q || undefined,
      },
      { sort: params.sort, cursor: single(raw.cursor), now },
    ),
    listPlatformOptions(),
    listSavedViews(auth.session.emailHash),
  ]);
  // The current filters as a saved view would store them.
  const currentQuery = sanitiseViewQuery(
    new URLSearchParams(
      Object.entries({ ...params, sort: params.sort === "due" ? "" : params.sort, status: params.status === "active" ? "" : params.status })
        .filter((entry): entry is [string, string] => Boolean(entry[1])),
    ).toString(),
  );

  const activeFilters = [
    params.q && { key: "q", label: `Reference: ${params.q}` },
    params.status !== "active" && {
      key: "status",
      label: `Status: ${params.status === "all" ? "Any" : (STATUS_LABELS[params.status] ?? params.status)}`,
    },
    params.platform && {
      key: "platform",
      label: `Platform: ${platforms.find((platform) => platform.id === params.platform)?.name ?? "Unknown"}`,
    },
    params.nextAction && {
      key: "nextAction",
      label: `Next action: ${
        params.nextAction === "blocked"
          ? "Blocked (any)"
          : NEXT_ACTION_FILTER_LABELS[params.nextAction as keyof typeof NEXT_ACTION_FILTER_LABELS]
      }`,
    },
    params.from && { key: "from", label: `From ${params.from}` },
    params.to && { key: "to", label: `To ${params.to}` },
  ].filter((filter): filter is { key: keyof Params; label: string } => Boolean(filter));

  const end = page.start + page.rows.length - 1;

  return (
    <section>
      <AdminPageHeader label="Console · Cases" title="Cases" />

      <nav aria-label="Case views" className="mt-8 flex flex-wrap gap-2">
        {VIEWS.map((view) => {
          const current =
            Object.entries(view.params).every(([key, value]) => params[key as keyof Params] === value) &&
            (view.params.nextAction ?? "") === params.nextAction &&
            (view.params.status ?? "active") === params.status;
          return (
            <Link
              aria-current={current ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-sm ${
                current
                  ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--page)]"
                  : "border-[var(--line)] text-[var(--ink)]"
              }`}
              href={href(view.params)}
              key={view.label}
            >
              {view.label}
            </Link>
          );
        })}
      </nav>
      <SavedViews currentQuery={currentQuery} views={savedViews} />

      <AutoSubmitForm className="mt-6 grid gap-4 md:grid-cols-4 lg:grid-cols-7">
        <Field label="Reference" name="q">
          <input
            className="field font-mono"
            defaultValue={params.q}
            id="q"
            name="q"
            placeholder="e.g. SQWGCD"
          />
        </Field>
        <Field label="Status" name="status">
          <select className="field" defaultValue={params.status} id="status" name="status">
            <option value="active">Open (any)</option>
            <option value="all">Any</option>
            {CASE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Platform" name="platform">
          <select className="field" defaultValue={params.platform} id="platform" name="platform">
            <option value="">Any</option>
            {platforms.map((platform) => (
              <option key={platform.id} value={platform.id}>
                {platform.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Next action" name="nextAction">
          <select className="field" defaultValue={params.nextAction} id="nextAction" name="nextAction">
            <option value="">Any</option>
            <option value="blocked">Blocked (any)</option>
            {NEXT_ACTIONS.map((kind) => (
              <option key={kind} value={kind}>
                {NEXT_ACTION_FILTER_LABELS[kind]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Created from" name="from">
          <input className="field" defaultValue={params.from} id="from" name="from" type="date" />
        </Field>
        <Field label="Created to" name="to">
          <input className="field" defaultValue={params.to} id="to" name="to" type="date" />
        </Field>
        <Field label="Sort" name="sort">
          <select className="field" defaultValue={params.sort} id="sort" name="sort">
            {SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {SORT_LABELS[sort]}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex items-end gap-4 md:col-span-4 lg:col-span-7">
          <button className="btn btn-primary" type="submit">
            Apply
          </button>
          {activeFilters.length > 0 && (
            <Link className="link-underline text-sm" href="/admin/cases">
              Reset filters
            </Link>
          )}
        </div>
      </AutoSubmitForm>

      {activeFilters.length > 0 && (
        <ul aria-label="Active filters" className="mt-4 flex flex-wrap gap-2 text-sm">
          {activeFilters.map((filter) => (
            <li key={filter.key}>
              <Link
                aria-label={`Remove filter ${filter.label}`}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] px-3 py-1"
                href={href({ ...params, sort: params.sort === "due" ? "" : params.sort, [filter.key]: "" })}
              >
                {filter.label}
                <span aria-hidden="true">×</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="muted mt-8 text-sm tabular-nums" aria-live="polite">
        {page.total === 0
          ? "No cases"
          : `Showing ${page.start} to ${end} of ${page.total} case${page.total === 1 ? "" : "s"}`}
      </p>

      <div className="mt-3">
        {page.rows.length > 0 ? (
          <CaseTable
            caption={`Cases, sorted by ${SORT_LABELS[params.sort].toLowerCase()}`}
            initialPeek={single(raw.peek) ?? null}
            rows={page.rows.map((row) => toTableRow(row, now))}
            sortedBy={
              params.sort === "due"
                ? "due"
                : params.sort === "oldest"
                  ? "age-asc"
                  : params.sort === "newest"
                    ? "age-desc"
                    : null
            }
          />
        ) : (
          <div className="rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--page)] p-6 text-center text-sm">
            {activeFilters.length > 0 || params.nextAction ? (
              <>
                <p className="muted">No cases match these filters.</p>
                <Link className="link-underline mt-2 inline-block" href="/admin/cases">
                  Reset filters
                </Link>
              </>
            ) : (
              <p className="muted">No open cases. Nothing is waiting.</p>
            )}
          </div>
        )}
      </div>

      {(single(raw.cursor) || page.nextCursor) && (
        <nav aria-label="Case list pages" className="mt-6 flex gap-6 text-sm">
          {single(raw.cursor) && (
            <Link className="link-underline" href={href({ ...params, sort: params.sort === "due" ? "" : params.sort })}>
              First page
            </Link>
          )}
          {page.nextCursor && (
            <Link
              className="link-underline"
              href={href({ ...params, sort: params.sort === "due" ? "" : params.sort, cursor: page.nextCursor })}
            >
              Next page
            </Link>
          )}
        </nav>
      )}
    </section>
  );
}

function toTableRow(row: AdminCaseListRow, now: Date): CaseTableRow {
  const due = dueText(row.nextAction, row.dueAt, now);
  return {
    caseId: row.caseId,
    referenceNumber: row.referenceNumber,
    action: nextActionLabel(row.nextAction, row.actionCount),
    due: due.text,
    overdue: due.overdue,
    links: row.linkCount,
    step: stepText(row),
    platforms: platformText(row.platforms),
    age: shortDuration(now.getTime() - Date.parse(row.createdAt)),
    ageTitle: formatIst(row.createdAt),
  };
}

function stepText(row: AdminCaseListRow) {
  if (row.allRemoved) return "Removed";
  if (!row.ladderStep) return "-";
  return `${row.ladderStep}. ${LADDER_STEP_LABELS[row.ladderStep - 1]}`;
}

function platformText(platforms: string[]) {
  if (!platforms.length) return "-";
  return platforms.length > 2 ? `${platforms.slice(0, 2).join(", ")} +${platforms.length - 2}` : platforms.join(", ");
}

function href(values: Partial<Record<keyof Params | "cursor", string>>) {
  const search = new URLSearchParams(
    Object.entries(values).filter((entry): entry is [string, string] => Boolean(entry[1]) && !(entry[0] === "status" && entry[1] === "active")),
  ).toString();
  return search ? `/admin/cases?${search}` : "/admin/cases";
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
      <p className="eyebrow">
        {label}
      </p>
      <h1 className="page-title-sm mt-3">
        {title}
      </h1>
    </div>
  );
}

function Field({
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
      <span className="eyebrow">
        {label}
      </span>
      {children}
    </label>
  );
}
