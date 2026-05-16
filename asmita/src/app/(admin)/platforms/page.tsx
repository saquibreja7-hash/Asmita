import {
  listGoChangeHistoryRows,
  listPlatformEditorRows,
} from "@/lib/admin-dashboard";

export default function PlatformsPage() {
  const rows = listPlatformEditorRows();
  const history = listGoChangeHistoryRows();
  const stale = rows.filter((row) => row.staleFlag).length;

  return (
    <section>
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
          Console · Platforms
        </p>
        <h1 className="font-display mt-3 text-[32px] font-normal leading-[1.1] tracking-tight md:text-[44px] md:leading-[1.08]">
          Platform database
        </h1>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <Metric label="Awaiting monthly re-verification" value={stale} />
        <Metric label="Total platforms" value={rows.length} />
      </div>
      <p className="muted mt-4 max-w-xl text-sm leading-[1.7]">
        Contacts stay blocked from live dispatch until a human verifies them.
      </p>

      <h2 className="font-display mt-12 text-[22px] font-normal leading-[1.22] tracking-tight md:text-[28px]">
        Verified contacts
      </h2>
      <div className="mt-4 overflow-hidden rounded-[14px] border border-[var(--hairline)] bg-white">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--hairline)]">
              <Th>Platform</Th>
              <Th>Tier</Th>
              <Th>GO email</Th>
              <Th>Form / API</Th>
              <Th>Template</Th>
              <Th>Verified</Th>
              <Th>Stale</Th>
              <Th>Dispatch</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((platform) => (
              <tr
                className="border-t border-[var(--hairline)] align-top"
                key={platform.id}
              >
                <td className="p-4 font-semibold">{platform.name}</td>
                <td className="p-4 capitalize">{platform.tier}</td>
                <td className="font-mono p-4 text-[var(--muted)]">
                  {platform.grievanceEmail}
                </td>
                <td className="font-mono p-4 text-xs text-[var(--muted)]">
                  {platform.formUrl ||
                    platform.apiEndpoint ||
                    "Not configured"}
                </td>
                <td className="p-4 capitalize">
                  {platform.templateType.toLowerCase()}
                </td>
                <td className="p-4">
                  <p className="font-mono text-xs tabular-nums">
                    {platform.lastVerifiedDate}
                  </p>
                  <p className="muted mt-1 text-xs">{platform.verifiedBy}</p>
                  <p className="muted mt-1 text-xs">
                    {platform.verificationSource}
                  </p>
                </td>
                <td className="p-4">
                  {platform.staleFlag ? (
                    <span className="text-[var(--rose)]">
                      {platform.staleReason}
                    </span>
                  ) : (
                    <span className="text-[var(--muted)]">current</span>
                  )}
                </td>
                <td className="p-4">
                  {platform.canDispatch ? "Allowed" : "Blocked"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="font-display mt-14 text-[22px] font-normal leading-[1.22] tracking-tight md:text-[28px]">
        Grievance Officer change history
      </h2>
      <div className="mt-4 overflow-hidden rounded-[14px] border border-[var(--hairline)] bg-white">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--hairline)]">
              <Th>Platform</Th>
              <Th>Changed by</Th>
              <Th>Field</Th>
              <Th>Previous</Th>
              <Th>New</Th>
              <Th>Source</Th>
              <Th>Timestamp</Th>
            </tr>
          </thead>
          <tbody>
            {history.map((row) => (
              <tr
                className="border-t border-[var(--hairline)] align-top"
                key={row.id}
              >
                <td className="p-4 font-semibold">{row.platformName}</td>
                <td className="p-4">{row.changedBy}</td>
                <td className="p-4">{row.field}</td>
                <td className="font-mono p-4 text-xs text-[var(--muted)]">
                  {row.previousValue}
                </td>
                <td className="font-mono p-4 text-xs">{row.newValue}</td>
                <td className="font-mono p-4 text-xs text-[var(--muted)]">
                  {row.sourceUrl}
                </td>
                <td className="font-mono p-4 text-xs text-[var(--muted)]">
                  {new Date(row.changedAt).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {history.length === 0 && (
          <p className="muted p-6 text-center text-sm">No changes recorded.</p>
        )}
      </div>
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="font-mono p-4 text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
      {children}
    </th>
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
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </p>
      <p className="font-display mt-2 text-[36px] leading-none tracking-tight text-[var(--foreground)] tabular-nums">
        {value}
      </p>
    </div>
  );
}
