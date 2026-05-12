import { listTemplateEditorRows } from "@/lib/admin-dashboard";

export default function TemplatesPage() {
  const rows = listTemplateEditorRows();

  return (
    <section>
      <h1 className="text-3xl font-black">Notice templates</h1>
      <div className="panel mt-6 overflow-hidden">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-[var(--surface)]">
            <tr>
              <th className="p-4">Template</th>
              <th className="p-4">Version</th>
              <th className="p-4">Language</th>
              <th className="p-4">Legal review</th>
              <th className="p-4">Activation</th>
              <th className="p-4">Rollback</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t border-[var(--border)] align-top" key={row.id}>
                <td className="p-4">
                  <p className="font-bold">{row.id}</p>
                  <p className="mt-2 text-xs text-[var(--muted)]">{row.preview}</p>
                </td>
                <td className="p-4">{row.version}</td>
                <td className="p-4">{row.language}</td>
                <td className="p-4 text-[var(--rose)]">{row.legalReviewStatus}</td>
                <td className="p-4">{row.active ? "Active" : "Blocked"}</td>
                <td className="p-4">{row.rollbackVersion}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel mt-6 p-5">
        <p className="font-bold text-[var(--rose)]">Activation controls locked</p>
        <p className="muted mt-2 text-sm">
          Draft templates stay blocked from real dispatch until an authorized legal role records review metadata.
        </p>
      </div>
    </section>
  );
}
