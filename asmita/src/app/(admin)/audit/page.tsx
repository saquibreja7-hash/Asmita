import { listAuditLogRows } from "@/lib/admin-dashboard";
import { validateAuditChainFromDb, type AuditChainValidation } from "@/lib/audit";

export const dynamic = "force-dynamic";

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
  const validation = await safeValidate();

  return (
    <section>
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
          Console · Audit
        </p>
        <h1 className="font-display mt-3 text-[32px] font-normal leading-[1.1] tracking-tight md:text-[44px] md:leading-[1.08]">
          Audit log
        </h1>
      </div>

      <ChainStatusBanner validation={validation} />

      <form className="mt-10 grid gap-4 md:grid-cols-4">
        <FilterField label="Event">
          <input
            className="field"
            defaultValue={filters.eventType || ""}
            name="eventType"
            placeholder="Any event"
          />
        </FilterField>
        <FilterField label="Actor">
          <input
            className="field"
            defaultValue={filters.actorId || ""}
            name="actorId"
            placeholder="Actor id"
          />
        </FilterField>
        <FilterField label="Entity">
          <input
            className="field"
            defaultValue={filters.entityId || ""}
            name="entityId"
            placeholder="Entity id"
          />
        </FilterField>
        <button className="btn btn-primary self-end" type="submit">
          Filter
        </button>
      </form>

      <div className="mt-10 overflow-hidden rounded-[14px] border border-[var(--hairline)] bg-white">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--hairline)]">
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
                className="border-t border-[var(--hairline)]"
                key={row.sequence}
              >
                <td className="font-mono p-4 tabular-nums text-[var(--muted)]">
                  {row.sequence}
                </td>
                <td className="p-4 font-semibold">{row.eventType}</td>
                <td className="font-mono p-4 text-xs">{row.actorId}</td>
                <td className="font-mono p-4 text-xs text-[var(--muted)]">
                  {row.entityType}: {row.entityId}
                </td>
                <td className="font-mono p-4 text-xs text-[var(--muted)]">
                  {new Date(row.createdAt).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                  })}
                </td>
                <td className="font-mono p-4 text-xs">{row.eventHash}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="muted p-6 text-center text-sm">
            No audit events match these filters.
          </p>
        )}
      </div>
    </section>
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
      <div className="mt-8 rounded-[12px] border border-[var(--hairline)] bg-[var(--background)] p-4 text-sm">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
          Chain integrity
        </p>
        <p className="mt-2">Could not verify chain: {validation.error}</p>
      </div>
    );
  }
  if (validation.valid) {
    return (
      <div className="mt-8 rounded-[12px] border border-[var(--accent)] bg-white p-4 text-sm">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--accent)]">
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
    <div className="mt-8 rounded-[12px] border border-[var(--rose)] bg-white p-4 text-sm">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--rose)]">
        Chain integrity · BROKEN
      </p>
      <p className="mt-2 tabular-nums">
        Validation failed at sequence #{broken?.sequence ?? "?"} ({broken?.reason}). Checked {validation.total} record(s) before the break.
      </p>
      {broken?.expected && broken?.actual ? (
        <p className="font-mono mt-2 text-xs text-[var(--muted)]">
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
    <label className="grid gap-1.5">
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
