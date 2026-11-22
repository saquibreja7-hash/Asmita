import Link from "next/link";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { listReviewQueues, queueSummaries } from "@/lib/review-jobs";
import { listRoutingRules, listRoutingRuleVersions, routingFieldsForKind, routingLeafText } from "@/lib/review-routing";
import { REVIEW_SUBJECT_KINDS } from "@/lib/review-adapters";
import { reviewerHandle } from "@/lib/review-views";
import { formatIst } from "../../cases/case-format";
import { RulesAdmin, type KindRulesView, type RuleView } from "./RulesAdmin";
import { QueuesAdmin, type QueueAdminView } from "./QueuesAdmin";

export const dynamic = "force-dynamic";

// Routing rules and queues admin (review-console-spec.md WP143), for the
// owner only: review:manage is SUPER_ADMIN. A rule picks a queue and a
// priority for an item that already needs a human — nothing on this page
// decides, dispatches, labels or changes any gate, and the protected
// minor-hold queue is never offered as a destination. Everything rendered
// here is console configuration: field labels, queue names, counts.

const KIND_LABELS: Record<string, string> = {
  FLAGGED_LINK: "Flagged links",
  FINGERPRINT: "Fingerprints",
  FINDING: "Crawler findings",
  PARTNER_APPLICATION: "Partner applications",
  LAB_REPORT: "Lab reports",
};

export default async function RoutingRulesPage() {
  const auth = await requireAdminPermission("review:manage");
  if (!auth.ok) {
    return (
      <section>
        <h1 className="mt-3">Not available</h1>
        <p className="muted mt-6 text-sm">Your admin role cannot manage review routing.</p>
      </section>
    );
  }
  const viewerEmailHash = auth.session.emailHash;
  const handle = (emailHash: string) => reviewerHandle(emailHash, viewerEmailHash);

  const [queues, allRules, summaries] = await Promise.all([
    listReviewQueues(),
    listRoutingRules(),
    queueSummaries({ role: auth.session.adminRole, emailHash: viewerEmailHash }),
  ]);
  const pendingByKey = new Map(summaries.map((summary) => [summary.key, summary.pending]));

  const kinds: KindRulesView[] = [];
  for (const kind of REVIEW_SUBJECT_KINDS) {
    const fields = await routingFieldsForKind(kind);
    const kindQueues = queues.filter((queue) => queue.subjectKind === kind && queue.archivedAt === null);
    const defaultQueue = kindQueues.find((queue) => queue.isDefault) ?? null;
    const rules: RuleView[] = [];
    for (const rule of allRules.filter((entry) => entry.subjectKind === kind)) {
      const versions = await listRoutingRuleVersions(rule.id);
      const leaves = "all" in rule.condition ? rule.condition.all : rule.condition.any;
      rules.push({
        id: rule.id,
        name: rule.name,
        description: rule.description,
        status: rule.status,
        sequence: rule.sequence,
        version: rule.version,
        priority: rule.priority,
        destinationQueueId: rule.destinationQueueId,
        leaves,
        conditionTexts: leaves.map((leaf) => routingLeafText(leaf, fields)),
        conditionJoin: "all" in rule.condition ? "all" : "any",
        updatedBy: handle(rule.createdBy),
        updatedAt: new Date(rule.updatedAt).toISOString(),
        versions: versions.map((version) => ({
          version: version.version,
          status: version.status,
          savedBy: handle(version.createdBy),
          savedAt: new Date(version.savedAt).toISOString(),
        })),
      });
    }
    kinds.push({
      kind,
      label: KIND_LABELS[kind] ?? kind,
      fields,
      rules,
      queues: kindQueues
        .filter((queue) => !queue.protected)
        .map((queue) => ({ id: queue.id, name: queue.name, key: queue.key })),
      defaultQueueId: defaultQueue?.id ?? kindQueues[0]?.id ?? "",
      defaultQueueName: defaultQueue?.name ?? "the default queue",
    });
  }

  const referencedQueueIds = new Set(allRules.map((rule) => rule.destinationQueueId));
  const queueViews: QueueAdminView[] = queues
    .slice()
    .sort((left, right) => (left.subjectKind ?? "").localeCompare(right.subjectKind ?? "") || left.sortOrder - right.sortOrder)
    .map((queue) => ({
      id: queue.id,
      key: queue.key,
      name: queue.name,
      description: queue.description,
      kindLabel: queue.subjectKind ? (KIND_LABELS[queue.subjectKind] ?? queue.subjectKind) : "Any kind",
      isDefault: queue.isDefault,
      protected: queue.protected,
      pending: pendingByKey.get(queue.key) ?? 0,
      archived: queue.archivedAt !== null,
      sortOrder: queue.sortOrder,
      requireReasonOnReject: queue.requireReasonOnReject,
      requireReasonOnApprove: queue.requireReasonOnApprove,
      canArchive:
        !queue.isDefault &&
        !queue.protected &&
        queue.archivedAt === null &&
        (pendingByKey.get(queue.key) ?? 0) === 0 &&
        !referencedQueueIds.has(queue.id),
      editable: !queue.isDefault && !queue.protected,
    }));

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="mt-3">Routing rules</h1>
        <Link className="link-underline text-sm" href="/admin/review" prefetch={false}>
          Review queues
        </Link>
      </div>
      <p className="muted mt-3 max-w-2xl text-sm">
        A rule picks the queue and the priority for an item that already needs a human. Rules run in order and the first
        live match wins; no match uses the kind&apos;s default queue. A rule never decides, approves, rejects, sends
        email or changes any gate, and nothing can route into or out of the protected Possible minor queue.
      </p>
      <RulesAdmin kinds={kinds} />

      <div className="mt-12 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="queues">Queues</h2>
        <p className="muted text-xs">Last counted {formatIst(new Date().toISOString())} IST</p>
      </div>
      <p className="muted mt-2 max-w-2xl text-sm">
        Custom queues are routing destinations. System queues cannot be archived, the protected queue cannot be edited,
        and only an empty queue no rule points at can be archived.
      </p>
      <section aria-labelledby="queues" className="mt-4">
        <QueuesAdmin queues={queueViews} />
      </section>
    </section>
  );
}

