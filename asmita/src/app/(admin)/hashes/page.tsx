import {
  listDispatchableHashCases,
  listHashReviewQueue,
  listVerifiedDispatchPlatforms,
} from "@/lib/hash-submission";
import HashReviewActions from "./HashReviewActions";
import HashDispatchForm from "./HashDispatchForm";
import { deniedFor } from "../page-permission";

export default async function HashQueuePage() {
  const denied = await deniedFor("cases:read");
  if (denied) return denied;
  if (process.env.ENABLE_HASH_UPLOAD !== "true") {
    return (
      <section>
        <p className="eyebrow">
          Console · Fingerprints
        </p>
        <h1 className="page-title-sm mt-3">
          Fingerprint review queue
        </h1>
        <p className="muted mt-6 max-w-xl text-sm leading-[1.7]">
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
        <h1 className="page-title-sm mt-3">
          Fingerprint review queue
        </h1>
        <p className="muted mt-6 max-w-2xl text-sm leading-[1.7]">
          Every client-generated perceptual hash waits here for human review before any
          advisory is dispatched. You are reviewing metadata only - the image never
          existed on our systems. Check account reputation, submission volume, quality
          scores, and declaration integrity.
        </p>
      </div>

      <div className="mt-10 overflow-hidden rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--page)]">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--line)]">
              <Th>Case</Th>
              <Th>Hash digest</Th>
              <Th>Quality</Th>
              <Th>Platform</Th>
              <Th>Flags</Th>
              <Th>Age</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t border-[var(--line)]" key={row.id}>
                <td className="font-mono p-4">{row.referenceNumber}</td>
                <td className="font-mono p-4 text-[var(--text-muted)]">
                  {row.hashDigest.slice(0, 16)}…
                </td>
                <td className="p-4 tabular-nums">{row.quality}/100</td>
                <td className="p-4">{row.requestedPlatformName ?? <span className="text-[var(--text-muted)]">-</span>}</td>
                <td className="p-4">{row.flagReason ?? "-"}</td>
                <td className="font-mono p-4 tabular-nums">
                  {Math.floor(row.ageMinutes / 60)}h {row.ageMinutes % 60}m
                </td>
                <td className="p-4">
                  <HashReviewActions hashId={row.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="muted p-6 text-center text-sm">
            No hash submissions awaiting review.
          </p>
        )}
      </div>

      <div className="mt-14">
        <p className="eyebrow">
          Advisory dispatch
        </p>
        <h2 className="section-title mt-3">
          Send hash advisories to platforms
        </h2>
        <p className="muted mt-4 max-w-2xl text-sm leading-[1.7]">
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

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="eyebrow p-4">
      {children}
    </th>
  );
}
