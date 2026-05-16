import { listTemplateEditorRows } from "@/lib/admin-dashboard";

export default function TemplatesPage() {
  const rows = listTemplateEditorRows();

  return (
    <section>
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
          Console · Templates
        </p>
        <h1 className="font-display mt-3 text-[32px] font-normal leading-[1.1] tracking-tight md:text-[44px] md:leading-[1.08]">
          Notice templates
        </h1>
        <p className="muted mt-3 max-w-xl text-sm leading-[1.7]">
          Templates remain blocked from live dispatch until an authorised
          legal role records the review metadata.
        </p>
      </div>

      <div className="mt-10 overflow-hidden rounded-[14px] border border-[var(--hairline)] bg-white">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--hairline)]">
              <Th>Template</Th>
              <Th>Version</Th>
              <Th>Language</Th>
              <Th>Legal review</Th>
              <Th>Activation</Th>
              <Th>Rollback</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                className="border-t border-[var(--hairline)] align-top"
                key={row.id}
              >
                <td className="p-4">
                  <p className="font-semibold">{row.id}</p>
                  <p className="muted mt-2 text-xs leading-[1.55]">
                    {row.preview}
                  </p>
                </td>
                <td className="font-mono p-4 text-xs">{row.version}</td>
                <td className="p-4">{row.language}</td>
                <td className="p-4 text-[var(--rose)]">
                  {row.legalReviewStatus}
                </td>
                <td className="p-4">{row.active ? "Active" : "Blocked"}</td>
                <td className="font-mono p-4 text-xs text-[var(--muted)]">
                  {row.rollbackVersion}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
