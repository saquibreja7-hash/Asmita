import Link from "next/link";
import { cookies } from "next/headers";
import { deniedFor } from "../page-permission";
import {
  countUnseen,
  listAddedLinks,
  NEW_LINKS_SEEN_COOKIE,
  NEW_LINKS_WINDOW_DAYS,
  parseSeenCookie,
} from "@/lib/admin-new-links";
import { MarkSeen } from "./MarkSeen";
import { InboxTabs } from "../InboxTabs";

const STATUS_LABEL: Record<string, string> = {
  PENDING_REVIEW: "Needs review",
  NOTICE_QUEUED: "Waiting for her signature or dispatch",
  NOTICE_SENT: "Notice sent",
  REMOVED: "Removed",
  REJECTED: "Rejected",
};

const when = (date: Date) =>
  new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(date);

// Links survivors added to cases they had already filed. Opening this page
// marks them seen (MarkSeen), which clears the sidebar badge.
export default async function NewLinksPage() {
  const denied = await deniedFor("cases:read");
  if (denied) return denied;
  const seenAt = parseSeenCookie((await cookies()).get(NEW_LINKS_SEEN_COOKIE)?.value);
  const rows = await listAddedLinks();
  const unseen = countUnseen(rows, seenAt);

  return (
    <section>
      <InboxTabs current="new-links" />
      <MarkSeen unseen={unseen} />
      <p className="eyebrow">Console · New links</p>
      <h1 className="mt-3">Links added to existing cases</h1>
      <p className="muted mt-3 text-sm">
        Survivors can add links from their dashboard after filing. Each one appears here for{" "}
        {NEW_LINKS_WINDOW_DAYS} days{unseen > 0 ? `; ${unseen} new since you last looked` : ""}. Open the case to act on it.
      </p>

      {rows.length === 0 ? (
        <p className="a-card mt-6 p-6 text-sm">No links have been added to existing cases in the last {NEW_LINKS_WINDOW_DAYS} days.</p>
      ) : (
        <div className="mt-6 overflow-x-auto a-card">
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="sr-only">Links added to existing cases, newest first</caption>
            <thead>
              <tr className="border-b border-[var(--line)]">
                {["Added", "Case", "Platform", "Domain", "Status"].map((heading) => (
                  <th className="eyebrow p-4" key={heading} scope="col">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isNew = !seenAt || row.addedAt > seenAt;
                return (
                  <tr className="border-t border-[var(--line)]" key={row.urlId}>
                    <td className="p-4 whitespace-nowrap">
                      {when(row.addedAt)}
                      {isNew && <span className="a-count ml-2">New</span>}
                    </td>
                    <td className="p-4 font-mono">
                      <Link className="link-underline" href={`/admin/cases/${encodeURIComponent(row.referenceNumber)}`}>
                        {row.referenceNumber}
                      </Link>
                    </td>
                    <td className="p-4">{row.platformName}</td>
                    <td className="p-4 font-mono">{row.domain}</td>
                    <td className="p-4">{STATUS_LABEL[row.status] ?? row.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
