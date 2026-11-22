import Link from "next/link";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import {
  listDispatchableHashCases,
  listHashReviewQueue,
  listVerifiedDispatchPlatforms,
  videoFingerprintLabel,
} from "@/lib/hash-submission";
import HashDispatchForm from "./HashDispatchForm";
import { HashesTable, type HashesRowView } from "./HashesTable";
import { deniedFor } from "../page-permission";

export default async function HashQueuePage() {
  const denied = await deniedFor("cases:read");
  if (denied) return denied;
  const canReview = (await requireAdminPermission("cases:review")).ok;
  if (process.env.ENABLE_HASH_UPLOAD !== "true") {
    return (
      <section>
        <p className="eyebrow">
          Console · Fingerprints
        </p>
        <h1 className="mt-3">
          Fingerprint review queue
        </h1>
        <p className="muted mt-6 max-w-xl text-sm">
          Fingerprint submission is switched off (<code>ENABLE_HASH_UPLOAD</code> is not
          <code>true</code>), so there is nothing to review here.
        </p>
      </section>
    );
  }

  const [rows, dispatchableCases, verifiedPlatforms] = await Promise.all([
    listHashReviewQueue(),
    listDispatchableHashCases(),
    listVerifiedDispatchPlatforms(),
  ]);

  return (
    <section>
      <div>
        <p className="eyebrow">
          Console · Fingerprints
        </p>
        <h1 className="mt-3">
          Fingerprint review queue
        </h1>
        <p className="muted mt-6 max-w-2xl text-sm">
        Every client-generated perceptual hash waits here for human review before any
        advisory is dispatched. You are reviewing metadata only - the image never
        existed on our systems. Check account reputation, submission volume, quality
        scores, and declaration integrity.
      </p>
      {rows.length > 0 && (
        <Link className="btn btn-secondary mt-4" href="/admin/review/fingerprints" prefetch={false}>
          Review one by one
        </Link>
      )}
      </div>

      <HashesTable
        canReview={canReview}
        rows={rows.map((row): HashesRowView => ({
          id: row.id,
          referenceNumber: row.referenceNumber,
          digestText:
            row.algorithm === "VPDQ"
              ? `${videoFingerprintLabel(row.videoFrameCount, row.videoDurationSec)} · ${row.hashDigest.slice(0, 16)}…`
              : `${row.hashDigest.slice(0, 16)}…`,
          quality: row.quality,
          platformName: row.requestedPlatformName,
          flagReason: row.flagReason,
          ageText: `${Math.floor(row.ageMinutes / 60)}h ${row.ageMinutes % 60}m`,
        }))}
      />

      <div className="mt-8">
        <p className="eyebrow">
          Advisory dispatch
        </p>
        <h2 className="mt-3">
          Send hash advisories to platforms
        </h2>
        <p className="muted mt-4 max-w-2xl text-sm">
          One email per platform: the legally reviewed HASH_ADVISORY notice plus the
          hash annex for all approved hashes on the case. Dispatch refuses to run
          unless the template has legal sign-off and the contact is human-verified.
          Re-running never double-sends.
        </p>
        <div className="mt-6">
          <HashDispatchForm cases={dispatchableCases} platforms={verifiedPlatforms} />
        </div>
      </div>
    </section>
  );
}

