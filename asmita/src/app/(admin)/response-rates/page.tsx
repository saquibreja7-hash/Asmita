import { listNgoVouchingRows, listPlatformResponseDashboardRows } from "@/lib/admin-dashboard";

export default function ResponseRatesPage() {
  const rows = listPlatformResponseDashboardRows();
  const vouches = listNgoVouchingRows();

  return (
    <section>
      <h1 className="text-3xl font-black">Platform response rates</h1>
      <div className="panel mt-6 overflow-hidden">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-[var(--surface)]">
            <tr>
              <th className="p-4">Platform</th>
              <th className="p-4">Notices sent</th>
              <th className="p-4">Acknowledgments</th>
              <th className="p-4">Removals</th>
              <th className="p-4">Non-responses</th>
              <th className="p-4">Median response</th>
              <th className="p-4">Rate</th>
              <th className="p-4">Recommendation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t border-[var(--border)]" key={row.platformId}>
                <td className="p-4 font-bold">{row.platformName}</td>
                <td className="p-4">{row.noticesSent}</td>
                <td className="p-4">{row.responded}</td>
                <td className="p-4">{row.removals}</td>
                <td className="p-4">{row.nonResponses}</td>
                <td className="p-4">{row.medianResponseHours ? `${row.medianResponseHours}h` : "No response yet"}</td>
                <td className="p-4">{Math.round(row.responseRate * 100)}%</td>
                <td className="p-4">{row.recommendation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 text-2xl font-black">NGO vouching</h2>
      <div className="panel mt-4 overflow-hidden">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-[var(--surface)]">
            <tr>
              <th className="p-4">Partner</th>
              <th className="p-4">Case</th>
              <th className="p-4">Timestamp</th>
              <th className="p-4">Rate-limit effect</th>
              <th className="p-4">Audit event</th>
            </tr>
          </thead>
          <tbody>
            {vouches.map((row) => (
              <tr className="border-t border-[var(--border)]" key={`${row.partnerName}-${row.auditEventId}`}>
                <td className="p-4 font-bold">{row.partnerName}</td>
                <td className="p-4">{row.caseReference}</td>
                <td className="p-4">{new Date(row.vouchedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
                <td className="p-4">{row.rateLimitLift}</td>
                <td className="p-4">{row.auditEventId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
