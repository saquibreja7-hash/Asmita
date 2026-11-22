import { requireAdminPermission } from "@/lib/auth/require-admin";
import { listReviewQueues } from "@/lib/review-jobs";
import { getReviewAdapter } from "@/lib/review-adapters";
import { listReviewReasons } from "@/lib/review-reasons";
import { guidanceMarkdownForQueue, GUIDED_QUEUE_KEYS } from "@/lib/review-guidance";
import { ReasonsEditor } from "./ReasonsEditor";

export const dynamic = "force-dynamic";

// Review settings (review-console-spec.md WP142): the internal reasons a
// reviewer can pick, per queue and decision. review:manage (WP144: the
// owner's permission) gates the page; the library re-checks it. Nothing on
// this page decides anything: a reason is a label a decision may carry,
// never a new outcome.

export default async function ReviewSettingsPage() {
  const auth = await requireAdminPermission("review:manage");
  if (!auth.ok) {
    return (
      <section>
        <p className="eyebrow">Console · Review</p>
        <h1 className="mt-3">Not available</h1>
        <p className="muted mt-6 text-sm">Your admin role cannot change review settings.</p>
      </section>
    );
  }

  const queues = await listReviewQueues();
  const groups = await Promise.all(
    queues.map(async (queue) => {
      const adapter = queue.protected || queue.subjectKind === null ? null : await getReviewAdapter(queue.subjectKind);
      const decisions = (adapter?.decisions ?? []).map((decision) => ({
        code: decision.code,
        label: decision.label,
        reasons: [] as Array<{ id: string; code: string; label: string; active: boolean; sortOrder: number }>,
      }));
      for (const decision of decisions) {
        decision.reasons = (await listReviewReasons(queue.key, decision.code)).map((reason) => ({
          id: reason.id,
          code: reason.code,
          label: reason.label,
          active: reason.active,
          sortOrder: reason.sortOrder,
        }));
      }
      return {
        key: queue.key,
        name: queue.name,
        description: queue.description,
        protected: queue.protected,
        guided: GUIDED_QUEUE_KEYS.includes(queue.key) && guidanceMarkdownForQueue(queue.key) !== null,
        decisions,
      };
    }),
  );

  return (
    <section>
      <p className="eyebrow">Console · Review · Settings</p>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="mt-3">Review settings</h1>
      </div>
      <p className="muted mt-3 max-w-2xl text-sm">
        The internal reasons a reviewer can pick with a decision. A reason is a plain, factual label;
        it is never sent to a survivor or a platform, and it never appears in a notice. Reasons are
        never deleted — deactivate one and reviewers stop picking it, while decisions that used it
        keep their label.
      </p>

      <div className="mt-6 grid gap-6">
        {groups.map((group) => (
          <div className="a-card p-4" key={group.key}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2>{group.name}</h2>
              <p className="muted text-xs">
                {group.guided ? "Guidance draft in place" : "No guidance file"}
              </p>
            </div>
            {group.description && <p className="muted mt-1 text-xs">{group.description}</p>}
            {group.protected ? (
              <p className="muted mt-3 text-sm">
                The protected queue offers no decisions, so it has no reasons. Nothing here continues
                the adult flow.
              </p>
            ) : (
              <ReasonsEditor decisions={group.decisions} queueKey={group.key} />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
