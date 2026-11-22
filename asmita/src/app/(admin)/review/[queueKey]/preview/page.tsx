import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { canSeeReviewQueue, getReviewQueueByKey, maybeSyncReviewJobs } from "@/lib/review-jobs";
import { listQueuePreview } from "@/lib/review-views";
import { formatIst } from "@/app/(admin)/cases/case-format";
import { describeReviewSubject } from "../../subject-view";

export const dynamic = "force-dynamic";

// The queue's pending items at a glance (WP141): what waits, how old it is,
// who holds it — claiming nothing. The subject column repeats only the
// one-line summary each kind's own page would show.
export default async function ReviewQueuePreviewPage({ params }: { params: Promise<{ queueKey: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return null;
  const { queueKey } = await params;
  const queue = await getReviewQueueByKey(queueKey);
  if (!queue) notFound();

  if (!canSeeReviewQueue(auth.session.adminRole, queue)) {
    return (
      <section>
        <p className="eyebrow">Console · Review</p>
        <h1 className="mt-3">Not available</h1>
        <p className="muted mt-6 text-sm">Your admin role cannot review this queue.</p>
      </section>
    );
  }

  await maybeSyncReviewJobs();
  const now = new Date();
  const rows = await listQueuePreview(queue, { emailHash: auth.session.emailHash }, now);
  const subjects = await Promise.all(rows.map((row) => describeReviewSubject(row.subjectKind, row.subjectId, now).catch(() => null)));

  return (
    <section>
      <p className="eyebrow">
        Console · Review ·{" "}
        <Link className="link-underline" href="/admin/review">
          Queues
        </Link>
      </p>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
        <h1>{queue.name} · preview</h1>
        {rows.length > 0 && (
          <Link className="btn btn-primary" href={`/admin/review/${queue.key}`} prefetch={false}>
            Start reviewing
          </Link>
        )}
      </div>
      <p className="muted mt-3 max-w-2xl text-sm">
        The items waiting in this queue, oldest first. Nothing is claimed from this page.
      </p>

      {rows.length === 0 ? (
        <p className="a-card muted mt-6 p-6 text-sm">Nothing is waiting in this queue.</p>
      ) : (
        <div className="a-card mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="sr-only">{queue.name} pending items, oldest first</caption>
            <thead>
              <tr className="border-b border-[var(--line)]">
                {["Item", "Waiting since", "Age", "Priority", "Held by"].map((heading) => (
                  <th className="eyebrow p-4" key={heading} scope="col">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const subject = subjects[index];
                return (
                  <tr className="border-t border-[var(--line)]" key={row.jobId}>
                    <td className="p-4">{subject?.summary ?? "Item no longer resolves"}</td>
                    <td className="a-nowrap p-4 tabular-nums">{formatIst(row.createdAt)}</td>
                    <td className="a-nowrap p-4 tabular-nums">{row.ageMinutes}m</td>
                    <td className="a-nowrap p-4 tabular-nums">{row.priority}</td>
                    <td className="p-4">
                      {row.heldBy === null ? "-" : row.heldBy === "you" ? "You" : "Another reviewer"}
                    </td>
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
