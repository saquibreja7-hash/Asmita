import {
  listNgoVouchingRows,
  listPlatformResponseDashboardRows,
} from "@/lib/admin-dashboard";

export default function ResponseRatesPage() {
  const rows = listPlatformResponseDashboardRows();
  const vouches = listNgoVouchingRows();

  return (
    <section>
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
          Console · Response rates
        </p>
        <h1 className="font-display mt-3 text-[32px] font-normal leading-[1.1] tracking-tight md:text-[44px] md:leading-[1.08]">
          Platform response rates
        </h1>
      </div>

      <div className="mt-10 overflow-hidden rounded-[14px] border border-[var(--hairline)] bg-white">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--hairline)]">
              <Th>Platform</Th>
              <Th>Notices sent</Th>
              <Th>Acks</Th>
              <Th>Removals</Th>
              <Th>Non-responses</Th>
              <Th>Median response</Th>
              <Th>Rate</Th>
              <Th>Recommendation</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                className="border-t border-[var(--hairline)]"
                key={row.platformId}
              >
                <td className="p-4 font-semibold">{row.platformName}</td>
                <td className="font-mono p-4 tabular-nums">{row.noticesSent}</td>
                <td className="font-mono p-4 tabular-nums">{row.responded}</td>
                <td className="font-mono p-4 tabular-nums">{row.removals}</td>
                <td className="font-mono p-4 tabular-nums">
                  {row.nonResponses}
                </td>
                <td className="font-mono p-4 tabular-nums">
                  {row.medianResponseHours
                    ? `${row.medianResponseHours}h`
                    : "—"}
                </td>
                <td className="font-mono p-4 tabular-nums">
                  {Math.round(row.responseRate * 100)}%
                </td>
                <td className="p-4">{row.recommendation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="font-display mt-14 text-[22px] font-normal leading-[1.22] tracking-tight md:text-[28px]">
        NGO vouching
      </h2>
      <div className="mt-4 overflow-hidden rounded-[14px] border border-[var(--hairline)] bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--hairline)]">
              <Th>Partner</Th>
              <Th>Case</Th>
              <Th>Timestamp</Th>
              <Th>Rate-limit effect</Th>
              <Th>Audit event</Th>
            </tr>
          </thead>
          <tbody>
            {vouches.map((row) => (
              <tr
                className="border-t border-[var(--hairline)]"
                key={`${row.partnerName}-${row.auditEventId}`}
              >
                <td className="p-4 font-semibold">{row.partnerName}</td>
                <td className="font-mono p-4">{row.caseReference}</td>
                <td className="font-mono p-4 text-xs text-[var(--muted)]">
                  {new Date(row.vouchedAt).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                  })}
                </td>
                <td className="p-4">{row.rateLimitLift}</td>
                <td className="font-mono p-4 text-xs text-[var(--muted)]">
                  {row.auditEventId}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {vouches.length === 0 && (
          <p className="muted p-6 text-center text-sm">
            No NGO vouches recorded.
          </p>
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
