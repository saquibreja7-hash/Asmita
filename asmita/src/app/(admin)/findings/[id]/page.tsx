import Link from "next/link";
import { listCrawlFindings } from "@/lib/crawl-findings";
import { crawlerEnabled } from "@/lib/crawler-auth";
import { deniedFor } from "../../page-permission";
import { CrawlerOffBanner } from "../CrawlerOffBanner";
import { NoticeStep } from "../NoticeStep";
import { RevealAddress } from "../RevealAddress";
import { ReviewControls } from "../ReviewControls";
import { SafetyNote } from "../SafetyNote";
import { reviewLabel, shortDate } from "../finding-view";

export const dynamic = "force-dynamic";

export default async function FindingPage({ params }: { params: Promise<{ id: string }> }) {
  const denied = await deniedFor("findings:review");
  if (denied) return denied;
  const { id } = await params;

  // There is no single-finding read that leaves out the address, so the
  // address-free list is searched. Fine at review volumes.
  const finding = (await listCrawlFindings({ limit: 500 })).find((row) => row.id === id);
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

      {!crawlerEnabled() && <CrawlerOffBanner />}
      <SafetyNote />

      <h2 className="mt-8">Match</h2>
      <dl className="a-card mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 p-4 text-sm">
        <dt className="muted">Case</dt>
        <dd className="font-mono">{finding.caseReference ?? "Unknown"}</dd>
        <dt className="muted">Distance</dt>
        <dd className="tabular-nums">{finding.distance} (lower is closer)</dd>
        <dt className="muted">Quality</dt>
        <dd className="tabular-nums">{finding.quality}/100</dd>
        <dt className="muted">Source</dt>
        <dd>{finding.sourceDomain ?? "-"}</dd>
        <dt className="muted">First seen</dt>
        <dd className="tabular-nums">{shortDate(finding.firstSeenAt)} UTC</dd>
        <dt className="muted">Last seen</dt>
        <dd className="tabular-nums">{shortDate(finding.lastSeenAt)} UTC</dd>
        <dt className="muted">Review</dt>
        <dd>{reviewLabel(finding)}</dd>
      </dl>

      <h2 className="mt-8">Address</h2>
      <div className="mt-4">
        <RevealAddress findingId={finding.id} urlsPurged={finding.urlsPurged} />
      </div>

      <h2 className="mt-8">Review</h2>
      <div className="mt-4">
        <ReviewControls
          awaitingSecondReview={finding.awaitingSecondReview}
          distance={finding.distance}
          findingId={finding.id}
          needsSecondReview={finding.needsSecondReview}
          reviewStatus={finding.reviewStatus}
        />
      </div>

      {finding.reviewStatus === "APPROVED" && (
        <>
          <h2 className="mt-8">Notice</h2>
          <p className="muted mt-2 max-w-2xl text-sm">
            Preview shows exactly what would be sent. Send is only possible after a preview and sends that same text.
          </p>
          <div className="mt-4">
            <NoticeStep findingId={finding.id} />
          </div>
        </>
      )}
    </section>
  );
}
