import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { hasAdminPermission } from "@/lib/auth/admin-permissions";
import { getAdminCaseDetail, type AdminCaseLink } from "@/lib/admin-cases";
import { recordAdminAccess } from "@/lib/admin-access-log";
import { ReviewActions } from "../../flagged/ReviewActions";
import HashReviewActions from "../../hashes/HashReviewActions";
import HashDispatchForm from "../../hashes/HashDispatchForm";
import { listDispatchableHashCases, listVerifiedDispatchPlatforms } from "@/lib/hash-submission";
import { AdminPageHeader } from "../page";
import {
  LADDER_BLOCK_LABELS,
  LADDER_STEP_LABELS,
  LINK_STATUS_LABELS,
  REPLY_LABELS,
  STATUS_LABELS,
  dueText,
  formatIst,
  nextActionLabel,
} from "../case-format";
import { RecordReplyButton } from "./RecordReplyButton";
import { RevealLink } from "./RevealLink";
import { SendNoticeButton } from "./SendNoticeButton";

export const dynamic = "force-dynamic";

export default async function AdminCasePage({ params }: { params: Promise<{ reference: string }> }) {
  const auth = await requireAdminPermission("cases:read");
  if (!auth.ok) {
    return (
      <section>
        <AdminPageHeader label="Console · Cases" title="Case" />
        <p className="muted mt-6 text-sm">Your admin role cannot read cases.</p>
      </section>
    );
  }
  const { reference } = await params;
  const now = new Date();
  const detail = await getAdminCaseDetail(reference, now);
  if (!detail) notFound();

  await recordAdminAccess(
    { adminId: auth.session.sub, action: "case_viewed", entityType: "Case", entityId: detail.caseId },
    await headers(),
  );

  const canReview = hasAdminPermission(auth.session.adminRole ?? "SUPER_ADMIN", "cases:review");
  const hashesEnabled = process.env.ENABLE_HASH_UPLOAD === "true";
  const due = dueText(detail.work.nextAction, detail.work.dueAt, now);
  const [advisoryCases, advisoryPlatforms] =
    canReview && hashesEnabled && detail.fingerprints.some((hash) => hash.status === "APPROVED")
      ? await Promise.all([listDispatchableHashCases(), listVerifiedDispatchPlatforms()])
      : [[], []];
  const advisoryCase = advisoryCases.filter((entry) => entry.caseId === detail.caseId);

  return (
    <section>
      <Link className="link-underline text-sm" href="/admin/cases">
        Back to cases
      </Link>

      <div className="mt-6">
        <p className="eyebrow">Console · Case</p>
        <h1 className="mt-3 font-mono">{detail.referenceNumber}</h1>
      </div>

      <dl className="mt-6 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Status">{STATUS_LABELS[detail.status] ?? detail.status}</Fact>
        <Fact label="Next action">{nextActionLabel(detail.work.nextAction, detail.work.actionCount)}</Fact>
        <Fact label="Due">
          <span className={due.overdue ? "text-[var(--danger)]" : undefined}>
            {due.overdue && <span aria-hidden="true">! </span>}
            {due.text}
          </span>
        </Fact>
        <Fact label="Created">{formatIst(detail.createdAt)}</Fact>
        <Fact label="First signature">
          {detail.declarationSignedAt ? formatIst(detail.declarationSignedAt) : "Not signed"}
        </Fact>
        <Fact label="NGO vouched">{detail.ngoVerified ? "Yes" : "No"}</Fact>
      </dl>

      <h2 className="mt-8">Links</h2>
      <p className="muted mt-2 max-w-2xl text-sm">
        Links are hidden. Revealing one asks for a reason and is recorded.
      </p>
      <ul className="mt-4 grid gap-4">
        {detail.links.map((link, index) => (
          <LinkCard
            canReview={canReview}
            caseId={detail.caseId}
            index={index + 1}
            key={link.id}
            link={link}
          />
        ))}
        {detail.links.length === 0 && <li className="muted text-sm">No links on this case.</li>}
      </ul>

      <h2 className="mt-8">Fingerprints</h2>
      {detail.fingerprints.length === 0 ? (
        <p className="muted mt-3 text-sm">No fingerprints on this case.</p>
      ) : (
        <div className="mt-4 overflow-x-auto a-card">
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">Fingerprints on this case</caption>
            <thead>
              <tr className="border-b border-[var(--line)]">
                <Th>Digest</Th>
                <Th>Status</Th>
                <Th>Quality</Th>
                <Th>Platform</Th>
                <Th>In signed notice</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {detail.fingerprints.map((hash) => (
                <tr className="border-t border-[var(--line)]" key={hash.id}>
                  <td className="px-4 py-3 font-mono text-xs">{hash.digestPrefix}…</td>
                  <td className="px-4 py-3">
                    {hash.status.replace("_", " ").toLowerCase()}
                    {hash.flagReason && <span className="muted block text-xs">{hash.flagReason}</span>}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{hash.quality}/100</td>
                  <td className="px-4 py-3">{hash.requestedPlatformName ?? "-"}</td>
                  <td className="px-4 py-3">{hash.inSignedNotice ? "Yes" : "No"}</td>
                  <td className="px-4 py-3">
                    {hash.status === "PENDING_REVIEW" && canReview && hashesEnabled ? (
                      <>
                        {hash.inSignedNotice && (
                          <p className="muted mb-2 text-xs">Rejecting voids the survivor&apos;s signature.</p>
                        )}
                        <HashReviewActions hashId={hash.id} />
                      </>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {advisoryCase.length > 0 && (
        <>
          <h3 className="mt-8">Send hash advisory</h3>
          <p className="muted mt-2 max-w-2xl text-sm">
            One email per platform with the reviewed advisory and the approved fingerprints. It
            refuses to send without legal review and a human-verified contact, and never sends twice.
          </p>
          <div className="mt-4">
            <HashDispatchForm cases={advisoryCase} platforms={advisoryPlatforms} />
          </div>
        </>
      )}

      <h2 className="mt-8">Timeline</h2>
      {detail.timeline.length === 0 ? (
        <p className="muted mt-3 text-sm">No recorded events.</p>
      ) : (
        <ol className="mt-4 grid gap-2 text-sm">
          {detail.timeline.map((event) => (
            <li className="grid gap-x-4 sm:grid-cols-[12rem_1fr_auto]" key={event.sequence}>
              <span className="muted tabular-nums">{formatIst(event.createdAt)}</span>
              <span>{event.eventType.replaceAll("_", " ").toLowerCase()}</span>
              <span className="muted font-mono text-xs">{event.actorId}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function LinkCard({
  link,
  index,
  caseId,
  canReview,
}: {
  link: AdminCaseLink;
  index: number;
  caseId: string;
  canReview: boolean;
}) {
  const needsReview = link.status === "PENDING_REVIEW" || (link.flaggedForReview && link.status !== "REJECTED");
  return (
    <li className="a-card p-4 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p>
          <span className="muted">Link {index}</span>{" "}
          <span className="font-mono">{link.domain}</span> · {link.platformName}
        </p>
        <p className="font-medium">
          {link.noticeSent && link.status === "NOTICE_QUEUED"
            ? LINK_STATUS_LABELS.NOTICE_SENT
            : (LINK_STATUS_LABELS[link.status] ?? link.status)}
        </p>
      </div>
      <dl className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Submitted">{formatIst(link.submittedAt)}</Fact>
        <Fact label="Signed notice">
          {link.signed
            ? `Yes${link.signedFingerprintIds.length ? `, ${link.signedFingerprintIds.length} fingerprints` : ""}`
            : "No"}
        </Fact>
        <Fact label="Platform contact">
          {link.emailReady && link.contactVerifiedAt
            ? `Verified ${formatIst(link.contactVerifiedAt)}`
            : link.noticeBasis === "FORM_ONLY"
              ? "Platform form only"
              : "Not verified"}
        </Fact>
        <Fact label="Ladder step">
          {link.status === "REMOVED"
            ? "Removed"
            : link.ladderStep
              ? `${link.ladderStep}. ${LADDER_STEP_LABELS[link.ladderStep - 1]}`
              : "Not started"}
        </Fact>
      </dl>
      {link.flagReason && <p className="muted mt-2 text-xs">Flag: {link.flagReason}</p>}
      {link.notices.length > 0 && (
        <ul className="mt-3 grid gap-1 text-xs">
          {link.notices.map((notice) => (
            <li key={notice.id}>
              {notice.followUp ? `Follow-up (level ${notice.escalationLevel})` : "Notice"}{" "}
              {notice.sentAt ? `sent ${formatIst(notice.sentAt)}` : "not sent"}
            </li>
          ))}
        </ul>
      )}
      {link.platformFiledAt && (
        <p className="mt-2 text-xs">Survivor filed the platform form {formatIst(link.platformFiledAt)}.</p>
      )}
      {link.reply?.responseType && link.reply.responseReceivedAt && (
        <p className="mt-2 text-xs">
          Platform reply: {REPLY_LABELS[link.reply.responseType] ?? link.reply.responseType},{" "}
          {formatIst(link.reply.responseReceivedAt)}.
        </p>
      )}
      {link.ladderBlock && (
        <p className="mt-2 text-xs text-[var(--danger)]">
          <span aria-hidden="true">! </span>
          The next escalation step is blocked: {LADDER_BLOCK_LABELS[link.ladderBlock] ?? link.ladderBlock}
        </p>
      )}

      {canReview && (
        <div className="mt-4 flex flex-wrap items-start gap-6 border-t border-[var(--line)] pt-4">
          {needsReview && <ReviewActions caseId={caseId} status={link.status} urlId={link.id} />}
          {link.dispatch && (
            <SendNoticeButton
              caseId={caseId}
              fingerprintCount={link.signedFingerprintIds.length}
              platformName={link.platformName}
              recipient={link.dispatch.recipient}
              reviewLabel={
                link.dispatch.reviewedAt
                  ? `Reviewed ${formatIst(link.dispatch.reviewedAt)}${link.dispatch.reviewedByName ? ` by ${link.dispatch.reviewedByName}` : ""}`
                  : "Not reviewed (development bypass)"
              }
              templateLabel={`${link.dispatch.templateType} v${link.dispatch.templateVersion}`}
              urlId={link.id}
            />
          )}
          {link.reply && !link.reply.removed && (
            <RecordReplyButton noticeId={link.reply.noticeId} platformName={link.platformName} />
          )}
          {link.retained ? <RevealLink urlId={link.id} /> : <p className="muted text-xs">Link deleted after 30 days.</p>}
        </div>
      )}
    </li>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="eyebrow px-4 py-3" scope="col">
      {children}
    </th>
  );
}
