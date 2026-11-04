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
        <p className="eyebrow">
          Console · Response rates
        </p>
        <h1 className="page-title-sm mt-3">
          Platform response rates
        </h1>
      </div>

      <div className="mt-10 overflow-hidden rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--page)]">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--line)]">
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
                className="border-t border-[var(--line)]"
                key={row.platformId}
              >
                <td className="p-4 font-medium">{row.platformName}</td>
                <td className="font-mono p-4 tabular-nums">{row.noticesSent}</td>
                <td className="font-mono p-4 tabular-nums">{row.responded}</td>
                <td className="font-mono p-4 tabular-nums">{row.removals}</td>
                <td className="font-mono p-4 tabular-nums">
                  {row.nonResponses}
                </td>
                <td className="font-mono p-4 tabular-nums">
                  {row.medianResponseHours
                    ? `${row.medianResponseHours}h`
                    : "-"}
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

      <h2 className="section-title mt-14">
        NGO vouching
      </h2>
      <div className="mt-4 overflow-hidden rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--page)]">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--line)]">
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
                className="border-t border-[var(--line)]"
                key={`${row.partnerName}-${row.auditEventId}`}
              >
                <td className="p-4 font-medium">{row.partnerName}</td>
                <td className="font-mono p-4">{row.caseReference}</td>
                <td className="font-mono p-4 text-xs text-[var(--text-muted)]">
                  {new Date(row.vouchedAt).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                  })}
                </td>
                <td className="p-4">{row.rateLimitLift}</td>
                <td className="font-mono p-4 text-xs text-[var(--text-muted)]">
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
    <th className="eyebrow p-4">
      {children}
    </th>
  );
}
