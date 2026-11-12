import Link from "next/link";
import { listAuditLogPage, type AuditLogPage } from "@/lib/admin-dashboard";
import { validateAuditChainFromDb, type AuditChainValidation } from "@/lib/audit";
import { deniedFor } from "../page-permission";

export const dynamic = "force-dynamic";

export default async function AuditPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const denied = await deniedFor("audit:read");
  if (denied) return denied;
  const params = (await searchParams) || {};
  const filters = {
    eventType: single(params.eventType),
    actorId: single(params.actorId),
    entityId: single(params.entityId),
  };
  const beforeParam = Number(single(params.before));
  const before = Number.isInteger(beforeParam) && beforeParam > 0 ? beforeParam : undefined;
  const [result, validation] = await Promise.all([safeList(filters, before), safeValidate()]);
  const rows = "error" in result ? [] : result.rows;
  const olderHref =
    "error" in result || result.nextBefore === null
      ? null
      : `/admin/audit?${new URLSearchParams({
          ...definedOnly(filters),
          before: String(result.nextBefore),
        }).toString()}`;
  const newestHref = `/admin/audit?${new URLSearchParams(definedOnly(filters)).toString()}`;

  return (
    <section>
      <div>
        <p className="eyebrow">
          Console · Audit
        </p>
        <h1 className="mt-3">
          Audit log
        </h1>
      </div>

      <ChainStatusBanner validation={validation} />

      <form className="a-card mt-6 grid gap-3 p-4 md:grid-cols-4">
        <FilterField label="Event">
          <input
            className="field"
            defaultValue={filters.eventType || ""}
            name="eventType"
            placeholder="Any event, e.g. NOTICE_SENT"
          />
        </FilterField>
        <FilterField label="Actor">
          <input
            className="field"
            defaultValue={filters.actorId || ""}
            name="actorId"
            placeholder="Exact actor id"
          />
        </FilterField>
        <FilterField label="Entity">
          <input
            className="field"
            defaultValue={filters.entityId || ""}
            name="entityId"
            placeholder="Exact case, link or notice id"
          />
        </FilterField>
        <button className="btn btn-primary self-end justify-self-start" type="submit">
          Filter
        </button>
      </form>

      <div className="mt-6 overflow-x-auto a-card">
        <table className="w-full min-w-[860px] text-left text-sm">
          <caption className="sr-only">Audit events, newest first</caption>
          <thead>
            <tr className="border-b border-[var(--line)]">
              <Th>Seq</Th>
              <Th>Event</Th>
              <Th>Actor</Th>
              <Th>Entity</Th>
              <Th>Timestamp</Th>
              <Th>Hash prefix</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                className="border-t border-[var(--line)]"
                key={row.sequence}
              >
                <td className="font-mono p-4 tabular-nums text-[var(--text-muted)]">
                  {row.sequence}
                </td>
                <td className="p-4 font-medium">{row.eventType}</td>
                <td className="font-mono p-4 text-xs">{row.actorId}</td>
                <td className="font-mono p-4 text-xs text-[var(--text-muted)]">
                  {row.entityType}: {row.entityId}
                </td>
                <td className="font-mono p-4 text-xs text-[var(--text-muted)]">
                  {new Date(row.createdAt).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                  })}
                </td>
                <td className="font-mono p-4 text-xs">{row.eventHash}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {"error" in result ? (
          <p className="p-6 text-center text-sm text-[var(--danger)]" role="alert">
            Could not load the audit log. Check the event type, then try again.
          </p>
        ) : rows.length === 0 ? (
          <p className="muted p-6 text-center text-sm">
            {before ? "No older audit events." : "No audit events match these filters."}
          </p>
        ) : null}
      </div>

      {(before || olderHref) && (
        <nav aria-label="Audit log pages" className="mt-6 flex gap-4 text-sm">
          {before && (
            <Link className="link-underline" href={newestHref}>
              Newest events
            </Link>
          )}
          {olderHref && (
            <Link className="link-underline" href={olderHref}>
              Older events
            </Link>
          )}
        </nav>
      )}
    </section>
  );
}

async function safeList(
  filters: { eventType?: string; actorId?: string; entityId?: string },
  before: number | undefined,
): Promise<AuditLogPage | { error: string }> {
  try {
    return await listAuditLogPage(filters, { before });
  } catch (err) {
    console.error("Audit log read failed", err);
    return { error: "audit_read_failed" };
  }
}

function definedOnly(values: Record<string, string | undefined>) {
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
}

async function safeValidate(): Promise<AuditChainValidation | { unavailable: true; error: string }> {
  try {
    return await validateAuditChainFromDb();
  } catch (err) {
    return { unavailable: true, error: err instanceof Error ? err.message : String(err) };
  }
}

function ChainStatusBanner({
  validation,
}: {
  validation: AuditChainValidation | { unavailable: true; error: string };
}) {
  if ("unavailable" in validation) {
    return (
      <div className="mt-8 a-card p-4 text-sm">
        <p className="eyebrow">
          Chain integrity
        </p>
        <p className="mt-2">Could not verify chain: {validation.error}</p>
      </div>
    );
  }
  if (validation.valid) {
    return (
      <div className="mt-8 rounded-[var(--radius-box)] border border-[var(--brand)] bg-[var(--page)] p-4 text-sm">
        <p className="eyebrow text-[var(--brand)]">
          Chain integrity · OK
        </p>
        <p className="mt-2 tabular-nums">
          Verified {validation.total} sequential record(s). Every entry&apos;s previous-hash and event-hash recomputed cleanly.
        </p>
      </div>
    );
  }
  const broken = validation.brokenAt;
  return (
    <div className="mt-8 rounded-[var(--radius-box)] border border-[var(--danger)] bg-[var(--page)] p-4 text-sm">
      <p className="eyebrow text-[var(--danger)]">
        Chain integrity · BROKEN
      </p>
      <p className="mt-2 tabular-nums">
        Validation failed at sequence #{broken?.sequence ?? "?"} ({broken?.reason}). Checked {validation.total} record(s) before the break.
      </p>
      {broken?.expected && broken?.actual ? (
        <p className="font-mono mt-2 text-xs text-[var(--text-muted)]">
          expected={broken.expected.slice(0, 20)}… actual={broken.actual.slice(0, 20)}…
        </p>
      ) : null}
    </div>
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
    <label className="grid gap-1">
      <span className="eyebrow">
        {label}
      </span>
      {children}
    </label>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="eyebrow p-4" scope="col">
      {children}
    </th>
  );
}
