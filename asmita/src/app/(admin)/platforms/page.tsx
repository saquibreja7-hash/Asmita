import { listGoChangeHistoryRows, listPlatformEditorRows } from "@/lib/admin-dashboard";

export default function PlatformsPage() {
  const rows = listPlatformEditorRows();
  const history = listGoChangeHistoryRows();

  return (
    <section>
      <h1 className="text-3xl font-black">Platform database</h1>
      <div className="panel mt-6 p-5">
        <p className="text-sm font-bold uppercase text-[var(--muted)]">Monthly re-verification queue</p>
        <p className="mt-2 text-3xl font-black">{rows.filter((row) => row.staleFlag).length}</p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Contacts stay blocked from live dispatch until a human verifies them.
        </p>
      </div>

      <div className="panel mt-6 overflow-hidden">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-[var(--surface)]">
            <tr>
              <th className="p-4">Platform</th>
              <th className="p-4">Tier</th>
              <th className="p-4">GO email</th>
              <th className="p-4">Form/API</th>
              <th className="p-4">Template</th>
              <th className="p-4">Verified</th>
              <th className="p-4">Stale</th>
              <th className="p-4">Dispatch</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((platform) => (
              <tr className="border-t border-[var(--border)] align-top" key={platform.id}>
                <td className="p-4 font-bold">{platform.name}</td>
                <td className="p-4">{platform.tier}</td>
                <td className="p-4">{platform.grievanceEmail}</td>
                <td className="p-4">{platform.formUrl || platform.apiEndpoint || "Not configured"}</td>
                <td className="p-4">{platform.templateType}</td>
                <td className="p-4">
                  <p>{platform.lastVerifiedDate}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">{platform.verifiedBy}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">{platform.verificationSource}</p>
                </td>
                <td className="p-4">{platform.staleFlag ? platform.staleReason : "current"}</td>
                <td className="p-4">{platform.canDispatch ? "Allowed" : "Blocked"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 text-2xl font-black">GO change history</h2>
      <div className="panel mt-4 overflow-hidden">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-[var(--surface)]">
            <tr>
              <th className="p-4">Platform</th>
              <th className="p-4">Changed by</th>
              <th className="p-4">Field</th>
              <th className="p-4">Previous</th>
              <th className="p-4">New</th>
              <th className="p-4">Source</th>
              <th className="p-4">Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {history.map((row) => (
              <tr className="border-t border-[var(--border)] align-top" key={row.id}>
                <td className="p-4 font-bold">{row.platformName}</td>
                <td className="p-4">{row.changedBy}</td>
                <td className="p-4">{row.field}</td>
                <td className="p-4">{row.previousValue}</td>
                <td className="p-4">{row.newValue}</td>
                <td className="p-4">{row.sourceUrl}</td>
                <td className="p-4">{new Date(row.changedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
