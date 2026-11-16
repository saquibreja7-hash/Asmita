import Link from "next/link";
import { getCrawlFindingSummary } from "@/lib/crawl-findings";
import { crawlerEnabled } from "@/lib/crawler-auth";
import { adminFor } from "../../page-permission";
import { CrawlerOffBanner } from "../CrawlerOffBanner";
import { NoticeStep } from "../NoticeStep";
import { RevealAddress } from "../RevealAddress";
import { ReviewControls } from "../ReviewControls";
import { SafetyNote } from "../SafetyNote";
import { noticeLabel, platformLabel, reviewLabel, shortDate } from "../finding-view";

export const dynamic = "force-dynamic";

export default async function FindingPage({ params }: { params: Promise<{ id: string }> }) {
  const { denied, adminId } = await adminFor("findings:review");
  if (denied || !adminId) return denied;
  const { id } = await params;

  // Address-free: the addresses come only from the reasoned, audited reveal.
  const finding = await getCrawlFindingSummary(id, adminId);
  const enabled = crawlerEnabled();
  if (!finding) {
    return (
      <section>
        <p className="eyebrow">Console · Crawler</p>
        <h1 className="mt-3">Finding not found</h1>
        <p className="mt-6 text-sm">
          <Link className="link-underline" href="/admin/findings">
            Back to findings
          </Link>
        </p>
      </section>
    );
  }

  return (
    <section>
      <p className="eyebrow">
        Console · <Link className="link-underline" href="/admin/findings">Findings</Link>
      </p>
      <h1 className="mt-3">Finding for {finding.caseReference ?? "an unknown case"}</h1>

      {!enabled && <CrawlerOffBanner />}
      <SafetyNote />

      <h2 className="mt-8">Match</h2>
      <dl className="a-card mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 p-4 text-sm">
        <dt className="muted">Case</dt>
        <dd className="font-mono">{finding.caseReference ?? "Unknown"}</dd>
        <dt className="muted">Fingerprint</dt>
        <dd className="font-mono">{finding.fingerprintRef ? `${finding.fingerprintRef}…` : "-"}</dd>
        <dt className="muted">Distance</dt>
        <dd className="tabular-nums">{finding.distance} (lower is closer)</dd>
        <dt className="muted">Quality</dt>
        <dd className="tabular-nums">{finding.quality}/100</dd>
        <dt className="muted">Source</dt>
        <dd>{finding.sourceDomain ?? "-"}</dd>
        <dt className="muted">Platform</dt>
        <dd>{platformLabel(finding.platform)}</dd>
        <dt className="muted">First seen</dt>
        <dd className="tabular-nums">{shortDate(finding.firstSeenAt)} UTC</dd>
        <dt className="muted">Last seen</dt>
        <dd className="tabular-nums">{shortDate(finding.lastSeenAt)} UTC</dd>
        <dt className="muted">Review</dt>
        <dd>
          {reviewLabel(finding)}
          {finding.firstReviewedAt ? ` · first review ${shortDate(finding.firstReviewedAt)} UTC` : ""}
        </dd>
        <dt className="muted">Notice</dt>
        <dd>{noticeLabel(finding)}</dd>
      </dl>

      <h2 className="mt-8">Address</h2>
      <div className="mt-4">
        <RevealAddress findingId={finding.id} urlsPurged={finding.urlsPurged} />
      </div>

      <h2 className="mt-8">Review</h2>
      <div className="mt-4">
        <ReviewControls
          awaitingSecondReview={finding.awaitingSecondReview}
          crawlerEnabled={enabled}
          currentAdminGaveFirstReview={finding.currentAdminGaveFirstReview}
          distance={finding.distance}
          findingId={finding.id}
          needsSecondReview={finding.needsSecondReview}
          reviewStatus={finding.reviewStatus}
        />
      </div>

      {(finding.reviewStatus === "APPROVED" || finding.crawlConsentWithdrawn) && (
        <>
          <h2 className="mt-8">Notice</h2>
          <p className="muted mt-2 max-w-2xl text-sm">
            Asmita sends this notice as the survivor&apos;s authorised representative under her signed authorisation; she does
            not sign it. Preview shows exactly what would be sent. Send is only possible after a preview and sends that same
            text.
          </p>
          <div className="mt-4">
            <NoticeStep caseId={finding.caseId} findingId={finding.id} state={{ ...finding, crawlerEnabled: enabled }} />
          </div>
        </>
      )}
    </section>
  );
}
