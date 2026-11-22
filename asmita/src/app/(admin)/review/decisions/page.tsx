import Link from "next/link";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { formatIst } from "@/app/(admin)/cases/case-format";
import { REVIEW_DECISION_LABELS } from "@/lib/review-views";
import {
  DECISION_CSV_MAX_ROWS,
  decisionLogFilterOptions,
  listDecisionLogPage,
  parseDecisionLogFilters,
} from "@/lib/review-decisions-log";

export const dynamic = "force-dynamic";

// The decisions log (review-console-spec.md, WP145): every ReviewDecision,
// newest first, keyset paginated, filterable by queue, kind, decision,
// reviewer, reason, date range and case reference. Ids, labels and handles
// only: the reason note is never read, a reviewer is never an email, and no
// address exists on any row. The CSV export carries the same filters.
export default async function DecisionsLogPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await requireAdminPermission("audit:read");
  if (!auth.ok) {
    return (
      <section>
        <p className="eyebrow">Console · Review</p>
        <h1 className="mt-3">Not available</h1>
        <p className="muted mt-6 text-sm">Your admin role cannot read the audit log.</p>
      </section>
    );
  }

  const raw = (await searchParams) || {};
  const one = (key: string) => {
    const value = raw[key];
    return (Array.isArray(value) ? value[0] : value) ?? "";
  };
  const filters = parseDecisionLogFilters({
    queue: one("queue"),
    kind: one("kind"),
    decision: one("decision"),
    reviewer: one("reviewer"),
    reason: one("reason"),
    from: one("from"),
    to: one("to"),
    case: one("case"),
  });

  const [page, options] = await Promise.all([
    listDecisionLogPage({ emailHash: auth.session.emailHash }, filters, { before: one("before") || undefined }),
    decisionLogFilterOptions({ emailHash: auth.session.emailHash }),
  ]);

  const filterQuery = (extra: Record<string, string> = {}) =>
    new URLSearchParams({
      ...Object.fromEntries(
        Object.entries({
          queue: filters.queueKey ?? "",
          kind: filters.subjectKind ?? "",
          decision: filters.decision ?? "",
          reviewer: one("reviewer"),
          reason: filters.reasonCode ?? "",
          from: filters.fromIstDay ?? "",
          to: filters.toIstDay ?? "",
          case: filters.caseReference ?? "",
        }).filter(([, value]) => value !== ""),
      ),
      ...extra,
    }).toString();

  const hasFilters = Boolean(
    filters.queueKey ||
      filters.subjectKind ||
      filters.decision ||
      filters.reviewerEmailHash !== undefined ||
      filters.reasonCode ||
      filters.fromIstDay ||
      filters.toIstDay ||
      filters.caseReference,
  );

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="eyebrow">Console · Review</p>
          <h1 className="mt-3">Decisions log</h1>
        </div>
        <Link
          className="btn btn-secondary"
          href={`/api/admin/review/decisions/export?${filterQuery()}`}
          prefetch={false}
        >
          Export this view as CSV
        </Link>
      </div>
      <p className="muted mt-3 max-w-2xl text-sm">
        Every decision the console has recorded, newest first: who took it, the internal reason they picked, and
        the queue rule that put the item there. Reasons stay internal — they are never sent to a survivor or a
        platform — and the CSV carries no addresses and no notes.
      </p>

      <form className="a-card mt-6 grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
        <FilterField label="Queue">
          <select className="field" defaultValue={filters.queueKey ?? ""} name="queue">
            <option value="">All queues</option>
            {options.queues.map((queue) => (
              <option key={queue.key} value={queue.key}>
                {queue.name}
                {queue.archived ? " (archived)" : ""}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Kind">
          <select className="field" defaultValue={filters.subjectKind ?? ""} name="kind">
            <option value="">Every kind</option>
            {options.kinds.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Decision">
          <select className="field" defaultValue={filters.decision ?? ""} name="decision">
            <option value="">Every decision</option>
            {options.decisions.map((code) => (
              <option key={code} value={code}>
                {decisionLabel(code)}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Reviewer">
          <select className="field" defaultValue={one("reviewer")} name="reviewer">
            <option value="">Every reviewer</option>
            {options.reviewers.map((reviewer) => (
              <option key={reviewer.value} value={reviewer.value}>
                {reviewer.label}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Reason">
          <select className="field" defaultValue={filters.reasonCode ?? ""} name="reason">
            <option value="">Every reason</option>
            {options.reasons.map((reason) => (
              <option key={`${reason.value}-${reason.label}`} value={reason.value}>
                {reason.label}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="From (IST)">
          <input className="field" defaultValue={filters.fromIstDay ?? ""} name="from" placeholder="2026-11-15" type="date" />
        </FilterField>
        <FilterField label="To (IST)">
          <input className="field" defaultValue={filters.toIstDay ?? ""} name="to" placeholder="2026-11-22" type="date" />
        </FilterField>
        <FilterField label="Case reference">
          <input
            className="field"
            defaultValue={filters.caseReference ?? ""}
            name="case"
            placeholder="ASMITA-2026-…"
            type="text"
          />
        </FilterField>
        <div className="col-span-2 flex flex-wrap items-center gap-4 md:col-span-4">
          <button className="btn btn-primary" type="submit">
            Apply filters
          </button>
          {hasFilters && (
            <Link className="link-underline text-sm" href="/admin/review/decisions">
              Reset
            </Link>
          )}
          <span className="muted ml-auto text-xs">
            Dates are IST days, inclusive. CSV export is capped at the newest {DECISION_CSV_MAX_ROWS.toLocaleString("en-IN")} matching decisions.
          </span>
        </div>
      </form>

      <div className="mt-6 overflow-x-auto a-card">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <caption className="sr-only">Review decisions, newest first</caption>
          <thead>
            <tr className="border-b border-[var(--line)]">
              {["Decided at", "Queue", "Kind", "Decision", "Reviewer", "Case", "Routing", "Handle time"].map((heading) => (
                <th className="eyebrow p-4" key={heading} scope="col">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {page.rows.map((row) => (
              <tr className="border-t border-[var(--line)]" key={row.decisionId}>
                <td className="a-nowrap font-mono p-4 text-xs text-[var(--text-muted)]">{formatIst(row.decidedAt)}</td>
                <td className="p-4">{row.queueName}</td>
                <td className="p-4">{KIND_LABELS[row.subjectKind]}</td>
                <td className="p-4">
                  <span className="font-medium">{decisionLabel(row.decision)}</span>
                  {row.reasonLabel && <span className="muted block text-xs">{row.reasonLabel}</span>}
                </td>
                <td className="a-nowrap p-4">{row.reviewer}</td>
                <td className="a-nowrap p-4">
                  {row.caseReference ? (
                    <Link className="link-underline font-mono" href={`/admin/cases/${row.caseReference}`}>
                      {row.caseReference}
                    </Link>
                  ) : (
                    <span className="muted">-</span>
                  )}
                </td>
                <td className="p-4 text-xs text-[var(--text-muted)]">{row.routing ?? "-"}</td>
                <td className="a-nowrap p-4 tabular-nums">
                  {row.handleSeconds === null ? <span className="muted">-</span> : `${row.handleSeconds}s`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {page.rows.length === 0 && (
          <p className="muted p-6 text-center text-sm">
            {hasFilters ? "No decisions match these filters." : "No decisions recorded yet."}
          </p>
        )}
      </div>

      {(one("before") || page.nextBefore) && (
        <nav aria-label="Decisions log pages" className="mt-6 flex gap-4 text-sm">
          {one("before") && (
            <Link className="link-underline" href={`/admin/review/decisions?${filterQuery()}`}>
              Newest decisions
            </Link>
          )}
          {page.nextBefore && (
            <Link className="link-underline" href={`/admin/review/decisions?${filterQuery({ before: page.nextBefore })}`}>
              Older decisions
            </Link>
          )}
        </nav>
      )}
    </section>
  );
}

const KIND_LABELS: Record<string, string> = {
  FLAGGED_LINK: "Flagged link",
  FINGERPRINT: "Fingerprint",
  FINDING: "Crawler finding",
  PARTNER_APPLICATION: "Partner application",
  LAB_REPORT: "Lab report",
};

function decisionLabel(code: string) {
  return REVIEW_DECISION_LABELS[code] ?? code.replaceAll("_", " ");
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="eyebrow">{label}</span>
      {children}
    </label>
  );
}
