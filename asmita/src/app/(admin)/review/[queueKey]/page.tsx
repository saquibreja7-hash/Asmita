import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { claimNextJob, getReviewQueueByKey, maybeSyncReviewJobs, reviewQueueVisibleTo } from "@/lib/review-jobs";
import { CaughtUp } from "../CaughtUp";

export const dynamic = "force-dynamic";

// /admin/review/[queueKey] — "Start reviewing": claims the next job of the
// queue for this admin and redirects to its job screen. A refresh claims
// nothing new: the same reviewer gets the same job back while the lease
// holds (WP140's claim order), so refreshing keeps the claim.
//
// This page WRITES (the lease), so nothing may trigger it ahead of the
// click: it is force-dynamic (dynamic routes are not prefetched), every
// link to it disables prefetch, and a router prefetch request (which
// carries next-router-prefetch) is answered without claiming anything.
export default async function ClaimNextReviewJobPage({
  params,
  searchParams,
}: {
  params: Promise<{ queueKey: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await requireAdmin();
  if (!auth.ok) return null;
  const { queueKey } = await params;
  const queue = await getReviewQueueByKey(queueKey);
  if (!queue) redirect("/admin/review");

  const viewer = { role: auth.session.adminRole, emailHash: auth.session.emailHash };
  if (!(await reviewQueueVisibleTo(viewer, queue))) {
    return (
      <section>
        <p className="eyebrow">Console · Review</p>
        <h1 className="mt-3">Not available</h1>
        <p className="muted mt-6 text-sm">Your admin role cannot review this queue.</p>
      </section>
    );
  }

  // A prefetch would claim a job nobody asked for; answer it with nothing.
  const requestHeaders = await headers();
  if (requestHeaders.get("next-router-prefetch")) {
    redirect("/admin/review");
  }

  await maybeSyncReviewJobs();
  const { job } = await claimNextJob({ queueId: queue.id, role: viewer.role, reviewerEmailHash: viewer.emailHash });
  if (!job) return <CaughtUp queueKey={queue.key} />;

  const query = (await searchParams) || {};
  const noted = one(query.noted);
  redirect(`/admin/review/${queue.key}/${job.id}${noted ? `?noted=${encodeURIComponent(noted)}` : ""}`);
}

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
