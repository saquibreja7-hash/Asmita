import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { hasAdminPermission } from "@/lib/auth/admin-permissions";
import { summariseQueues, type NextActionKind, type QueueSummary } from "@/lib/admin-cases";
import { listNoticeTemplateRows, listPlatformEditorRowsFromDb } from "@/lib/admin-dashboard";
import { dueText, formatIst, nextActionLabel, shortDuration } from "@/app/(admin)/cases/case-format";

export const dynamic = "force-dynamic";

type Tile = {
  title: string;
  count: number;
  href: string;
  lines: string[];
  urgent: boolean;
};

// The console's home: every queue that waits on an operator, with its count,
// how many are past due and the oldest, then the most urgent cases. The
// layout has already required a signed-in admin with MFA.
export default async function NeedsActionPage() {
  const auth = await requireAdmin();
  if (!auth.ok) return null;
  const role = auth.session.adminRole;
  const can = (permission: Parameters<typeof hasAdminPermission>[1]) => hasAdminPermission(role, permission);
  const now = new Date();

  const [summary, platforms, templates] = await Promise.all([
    can("cases:read") ? summariseQueues(now) : null,
    can("platforms:edit") ? listPlatformEditorRowsFromDb(now) : null,
    can("templates:edit") ? listNoticeTemplateRows() : null,
  ]);

  const tiles: Tile[] = [];
  if (summary) {
    const queue = (kind: NextActionKind) => summary.queues.find((entry) => entry.kind === kind)!;
    const blocked = (["blocked_legal_review", "blocked_contact", "blocked_escalation"] as const).map(queue);
    tiles.push(
      caseTile("Links to review", queue("review_links"), "review_links", now),
      caseTile("Fingerprints to review", queue("review_fingerprints"), "review_fingerprints", now),
      caseTile("Ready to send", queue("send_notice"), "send_notice", now),
      {
        title: "Blocked",
        count: blocked.reduce((sum, entry) => sum + entry.count, 0),
        href: "/admin/cases?nextAction=blocked",
        lines: [
          blocked[0].count ? `${blocked[0].count} waiting on legal review` : "",
          blocked[1].count ? `${blocked[1].count} without a verified contact` : "",
          blocked[2].count ? `${blocked[2].count} with a refused escalation step` : "",
        ].filter(Boolean),
        urgent: false,
      },
      caseTile("Awaiting platform reply", queue("awaiting_reply"), "awaiting_reply", now),
    );
  }
  if (platforms) {
    const unverified = platforms.filter((platform) => !platform.lastContactVerifiedByHuman).length;
    const stale = platforms.filter((platform) => platform.lastContactVerifiedByHuman && platform.staleFlag).length;
    tiles.push({
      title: "Platform contacts",
      count: unverified + stale,
      href: "/admin/platforms",
      lines: [unverified ? `${unverified} not verified` : "", stale ? `${stale} due for re-check` : ""].filter(Boolean),
      urgent: false,
    });
  }
  if (templates) {
    const unreviewed = templates.filter((template) => template.isActive && !template.reviewedByLegal).length;
    tiles.push({
      title: "Templates to review",
      count: unreviewed,
      href: "/admin/templates",
      lines: unreviewed ? ["Active but not legally reviewed"] : [],
      urgent: false,
    });
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Console</p>
          <h1 className="page-title-sm mt-3">Needs action</h1>
        </div>
        <p className="muted text-sm">Updated {formatIst(now)}</p>
      </div>

      {tiles.length === 0 ? (
        <p className="muted mt-10 text-sm">Your admin role has no queues.</p>
      ) : (
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tiles.map((tile) => (
            <li key={tile.title}>
              <Link
                className={`block h-full rounded-[var(--radius-box)] border bg-[var(--page)] p-5 ${
                  tile.urgent ? "border-[var(--danger)]" : "border-[var(--line)]"
                }`}
                href={tile.href}
              >
                <p className="eyebrow">{tile.title}</p>
                <p className="font-display mt-3 text-[36px] leading-none tabular-nums text-[var(--ink)]">
                  {tile.count === 0 ? "Clear" : tile.count}
                </p>
                <ul className="mt-3 grid gap-1 text-sm">
                  {tile.lines.map((line) => (
                    <li className={line.startsWith("!") ? "text-[var(--danger)]" : "muted"} key={line}>
                      {line.startsWith("!") ? (
                        <>
                          <span aria-hidden="true">! </span>
                          {line.slice(2)}
                        </>
                      ) : (
                        line
                      )}
                    </li>
                  ))}
                </ul>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {summary && (
        <>
          <h2 className="section-title mt-14">Due next</h2>
          {summary.dueNext.length === 0 ? (
            <p className="muted mt-4 text-sm">Nothing is waiting on an operator.</p>
          ) : (
            <ol className="mt-4 divide-y divide-[var(--line)] rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--page)]">
              {summary.dueNext.map((row) => {
                const due = dueText(row.nextAction, row.dueAt, now);
                return (
                  <li className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[14rem_1fr_auto] sm:gap-4" key={row.caseId}>
                    <Link className="link-underline font-mono" href={`/admin/cases/${row.referenceNumber}`}>
                      {row.referenceNumber}
                    </Link>
                    <span>
                      {nextActionLabel(row.nextAction, row.actionCount)}
                      {row.platforms.length > 0 && <span className="muted"> · {row.platforms.join(", ")}</span>}
                    </span>
                    <span className={`tabular-nums ${due.overdue ? "text-[var(--danger)]" : "muted"}`}>
                      {due.overdue && <span aria-hidden="true">! </span>}
                      {due.text}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
          {summary.actionable > summary.dueNext.length && (
            <Link className="link-underline mt-4 inline-block text-sm" href="/admin/cases">
              All {summary.actionable} cases waiting on an operator
            </Link>
          )}
        </>
      )}
    </section>
  );
}

function caseTile(title: string, queue: QueueSummary, kind: NextActionKind, now: Date): Tile {
  const lines: string[] = [];
  if (queue.overdue) {
    lines.push(kind === "awaiting_reply" ? `! ${queue.overdue} past the platform deadline` : `! ${queue.overdue} overdue`);
  }
  if (queue.oldestDueAt && queue.count) {
    const diff = queue.oldestDueAt.getTime() - now.getTime();
    const word = kind === "awaiting_reply" ? "deadline" : "due";
    lines.push(
      diff < 0
        ? `Oldest ${word} passed ${shortDuration(-diff)} ago`
        : `Next ${word} in ${shortDuration(diff)}`,
    );
  }
  return {
    title,
    count: queue.count,
    href: `/admin/cases?nextAction=${kind}`,
    lines,
    urgent: queue.overdue > 0 && kind !== "awaiting_reply",
  };
}
