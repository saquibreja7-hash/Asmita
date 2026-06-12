import { listHashReviewQueue } from "@/lib/hash-submission";
import HashReviewActions from "./HashReviewActions";

export default async function HashQueuePage() {
  if (process.env.ENABLE_HASH_UPLOAD !== "true") {
    return (
      <section>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
          Console · Hash queue
        </p>
        <h1 className="font-display mt-3 text-[32px] font-normal leading-[1.1] tracking-tight md:text-[44px] md:leading-[1.08]">
          Hash review queue
        </h1>
        <p className="muted mt-6 max-w-xl text-sm leading-[1.7]">
          Phase 2 hash intake is disabled (<code>ENABLE_HASH_UPLOAD=false</code>). The
          flag stays off until the rollout gates pass: PDQ reference-vector validation,
          legal review of the HASH_ADVISORY template, and human-verified platform
          contacts.
        </p>
      </section>
    );
  }

  const rows = await listHashReviewQueue();

  return (
    <section>
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
          Console · Hash queue
        </p>
        <h1 className="font-display mt-3 text-[32px] font-normal leading-[1.1] tracking-tight md:text-[44px] md:leading-[1.08]">
          Hash review queue
        </h1>
        <p className="muted mt-6 max-w-2xl text-sm leading-[1.7]">
          Every client-generated perceptual hash waits here for human review before any
          advisory is dispatched. You are reviewing metadata only — the image never
          existed on our systems. Check account reputation, submission volume, quality
          scores, and declaration integrity.
        </p>
      </div>

      <div className="mt-10 overflow-hidden rounded-[14px] border border-[var(--hairline)] bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--hairline)]">
              <Th>Case</Th>
              <Th>Hash digest</Th>
              <Th>Quality</Th>
              <Th>Flags</Th>
              <Th>Age</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t border-[var(--hairline)]" key={row.id}>
                <td className="font-mono p-4">{row.referenceNumber}</td>
                <td className="font-mono p-4 text-[var(--muted)]">
                  {row.hashDigest.slice(0, 16)}…
                </td>
                <td className="p-4 tabular-nums">{row.quality}/100</td>
                <td className="p-4">{row.flagReason ?? "—"}</td>
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
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="font-mono p-4 text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
      {children}
    </th>
  );
}
