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
      // The review kinds link to the review console (WP141); their case-list
      // views stay reachable from the Cases page.
      caseTile("Links to review", queue("review_links"), "review_links", now, "/admin/review"),
      caseTile("Found copies to review", queue("review_findings"), "review_findings", now, "/admin/review"),
      caseTile("Fingerprints to review", queue("review_fingerprints"), "review_fingerprints", now, "/admin/review"),
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

  // Case queues lead; directory upkeep sits beside the work, not above it.
  // Within the work, what is overdue comes first, then anything waiting;
  // queues that are clear fold into one quiet line instead of a wall of
  // "Clear" tiles.
  const isCaseTile = (tile: Tile) => tile.href.startsWith("/admin/cases") || tile.href.startsWith("/admin/review");
  const caseTiles = tiles.filter(isCaseTile);
  const upkeep = tiles.filter((tile) => !isCaseTile(tile));
  const waiting = caseTiles
    .filter((tile) => tile.count > 0)
    .sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.count - a.count);
  const clear = caseTiles.filter((tile) => tile.count === 0);
  const upkeepWaiting = upkeep.filter((tile) => tile.count > 0);
  const total = waiting.reduce((sum, tile) => sum + tile.count, 0) + upkeepWaiting.reduce((sum, tile) => sum + tile.count, 0);
  const overdue = waiting.some((tile) => tile.urgent);

  return (
    <section>
      <div className="a-home-head">
        <div>
          <p className="eyebrow">Needs action</p>
          <h1 className="mt-2">
            {tiles.length === 0
              ? "Nothing here for your role"
              : total === 0
                ? "All clear"
                : `${total} ${total === 1 ? "thing needs" : "things need"} you`}
          </h1>
          <p className="muted mt-2 text-sm">
            {overdue
              ? "Some work is overdue. It is listed first."
              : total === 0
                ? "No case, fingerprint, finding or directory item is waiting on a person."
                : "Nothing is overdue."}{" "}
            <span className="tabular-nums">Updated {formatIst(now)}.</span>
          </p>
        </div>
        <Link className="btn btn-primary !m-0" href="/admin/review">
          Open the Inbox
        </Link>
      </div>

      {waiting.length > 0 && (
        <ul aria-label="Work waiting" className="a-home-grid mt-6">
          {waiting.map((tile) => (
            <li key={tile.title}>
              <Link className="a-stat" data-urgent={tile.urgent} href={tile.href}>
                <p className="muted">{tile.title}</p>
                <p className="a-stat-value mt-2">{tile.count}</p>
                <TileLines lines={tile.lines} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {clear.length > 0 && (
        <p className="muted mt-4 text-sm">
          Clear: {clear.map((tile) => tile.title.toLowerCase()).join(", ")}.
        </p>
      )}

      <div className="mt-8 grid gap-8 xl:grid-cols-3">
        {summary && (
          <div className="xl:col-span-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2>Due next</h2>
              {summary.actionable > summary.dueNext.length && (
                <Link className="link-underline" href="/admin/cases">
                  All {summary.actionable} cases waiting on an operator
                </Link>
              )}
            </div>
            {summary.dueNext.length === 0 ? (
              <p className="a-card muted mt-3 p-6 text-center">Nothing is waiting on an operator.</p>
            ) : (
              <ol className="a-card mt-3 divide-y divide-[var(--line)]">
                {summary.dueNext.map((row) => {
                  const due = dueText(row.nextAction, row.dueAt, now);
                  return (
                    <li
                      className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 px-4 py-3 md:grid-cols-[12rem_1fr_auto]"
                      key={row.caseId}
                    >
                      <Link className="link-underline font-mono" href={`/admin/cases/${row.referenceNumber}`}>
                        {row.referenceNumber}
                      </Link>
                      <span className="col-span-2 row-start-2 md:col-span-1 md:row-start-auto">
                        {nextActionLabel(row.nextAction, row.actionCount)}
                        {row.platforms.length > 0 && <span className="muted"> · {row.platforms.join(", ")}</span>}
                      </span>
                      <span className={`a-nowrap tabular-nums ${due.overdue ? "font-semibold text-[var(--danger)]" : "muted"}`}>
                        {due.overdue && <span aria-hidden="true">! </span>}
                        {due.text}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )}

        {upkeep.length > 0 && (
          <div>
            <h2>Directory upkeep</h2>
            <ul className="a-card mt-3 divide-y divide-[var(--line)]">
              {upkeep.map((tile) => (
                <li key={tile.title}>
                  <Link className="flex items-baseline justify-between gap-4 px-4 py-3" href={tile.href}>
                    <span>
                      <span className="font-medium">{tile.title}</span>
                      <TileLines lines={tile.lines} />
                    </span>
                    <span className={`tabular-nums ${tile.count === 0 ? "muted" : "text-base font-semibold"}`}>
                      {tile.count === 0 ? "Clear" : tile.count}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function TileLines({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <span className="mt-1 grid gap-1 text-xs">
      {lines.map((line) =>
        line.startsWith("!") ? (
          <span className="font-semibold text-[var(--danger)]" key={line}>
            <span aria-hidden="true">! </span>
            {line.slice(2)}
          </span>
        ) : (
          <span className="muted" key={line}>
            {line}
          </span>
        ),
      )}
    </span>
  );
}

function caseTile(title: string, queue: QueueSummary, kind: NextActionKind, now: Date, href?: string): Tile {
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
    href: href ?? `/admin/cases?nextAction=${kind}`,
    lines,
    urgent: queue.overdue > 0 && kind !== "awaiting_reply",
  };
}
