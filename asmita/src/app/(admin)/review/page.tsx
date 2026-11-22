import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { maybeSyncReviewJobs, queueSummaries } from "@/lib/review-jobs";
import { QueueList, type ReviewQueueRowView } from "./QueueList";

export const dynamic = "force-dynamic";

// The review console's front door (review-console-spec.md, WP141): one row
// per queue the viewer may see, refreshed while the tab is open. Counts,
// ages and lease state only — no subject data. "Start reviewing" hands the
// next job to this admin with a ten-minute lease.
export default async function ReviewQueueListPage() {
  const auth = await requireAdmin();
  if (!auth.ok) return null;

  // The lazy sync tops the jobs up first (throttled to once per 30 s per
  // isolate), so the rows agree with the source tables.
  await maybeSyncReviewJobs();
  const summaries = await queueSummaries({ role: auth.session.adminRole, emailHash: auth.session.emailHash });
  const rows: ReviewQueueRowView[] = summaries.map((queue) => ({
    key: queue.key,
    name: queue.name,
    description: queue.description,
    pending: queue.pending,
    oldestCreatedAt: queue.oldestCreatedAt ? new Date(queue.oldestCreatedAt).toISOString() : null,
    heldByMe: queue.heldByMe,
  }));

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="eyebrow">Console · Review</p>
          <h1 className="mt-3">Review</h1>
        </div>
        {/* Hidden from the nav model for now: the page refuses every role
            but SUPER_ADMIN, and a nav item must never 403 for its viewer.
            WP144's review:manage permission gives it a proper home. */}
        {auth.session.adminRole === "SUPER_ADMIN" && (
          <Link className="link-underline text-sm" href="/admin/review/settings" prefetch={false}>
            Review settings
          </Link>
        )}
      </div>
      <p className="muted mt-3 max-w-2xl text-sm">
        Each queue below waits on a human decision. Start reviewing hands you one item at a time with a
        ten-minute hold; a refresh keeps it, and an expired hold hands it to a colleague. Counts refresh
        while this page is open.
      </p>
      <QueueList initial={rows} />
    </section>
  );
}
