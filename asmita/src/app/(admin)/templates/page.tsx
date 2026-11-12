import { listNoticeTemplateRows } from "@/lib/admin-dashboard";
import { deniedFor } from "../page-permission";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const denied = await deniedFor("templates:edit");
  if (denied) return denied;
  const rows = await listNoticeTemplateRows();
  const unreviewed = rows.filter((row) => row.isActive && !row.reviewedByLegal).length;

  return (
    <section>
      <div>
        <p className="eyebrow">
          Console · Templates
        </p>
        <h1 className="mt-3">
          Notice templates
        </h1>
        <p className="muted mt-3 max-w-xl text-sm">
          A template is sent only when it is active and a legal reviewer has
          recorded a review. Only a human legal reviewer marks a template
          reviewed; seeding and code never do.
        </p>
        {rows.length > 0 && (
          <p className="mt-4 text-sm">
            {unreviewed === 0
              ? "Every active template has a recorded legal review."
              : `${unreviewed} active template${unreviewed === 1 ? "" : "s"} still need${unreviewed === 1 ? "s" : ""} legal review.`}
          </p>
        )}
      </div>

      <div className="mt-6 overflow-x-auto a-card">
        <table className="w-full min-w-[860px] text-left text-sm">
          <caption className="sr-only">Notice templates and their legal review status</caption>
          <thead>
            <tr className="border-b border-[var(--line)]">
              <Th>Template</Th>
              <Th>Platform</Th>
              <Th>Version</Th>
              <Th>Legal review</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                className="border-t border-[var(--line)] align-top"
                key={row.id}
              >
                <td className="p-4">
                  <p className="font-mono text-xs font-medium">{row.templateType}</p>
                  <p className="muted mt-2 text-xs">
                    {row.subject}
                  </p>
                </td>
                <td className="p-4">
                  {row.platformName ?? (
                    <span className="text-[var(--text-muted)]">All platforms</span>
                  )}
                </td>
                <td className="font-mono p-4 text-xs tabular-nums">v{row.version}</td>
                <td className="p-4">
                  {row.reviewedByLegal ? (
                    <>
                      <p className="text-[var(--brand)]">Reviewed</p>
                      <p className="muted mt-1 text-xs">
                        {[row.reviewedByName, row.reviewedAt && formatDate(row.reviewedAt)]
                          .filter(Boolean)
                          .join(", ") || "No reviewer details recorded"}
                      </p>
                    </>
                  ) : (
                    <p className="text-[var(--danger)]">Not reviewed</p>
                  )}
                </td>
                <td className="p-4">
                  {!row.isActive
                    ? "Inactive"
                    : row.reviewedByLegal
                      ? "Active, can be sent"
                      : "Active, blocked until reviewed"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="muted p-6 text-center text-sm">
            No templates in the database. Run the seed to create them.
          </p>
        )}
      </div>
    </section>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="eyebrow p-4" scope="col">
      {children}
    </th>
  );
}
