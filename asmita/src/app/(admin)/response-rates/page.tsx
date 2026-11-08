import {
  listNgoVouchingRows,
  listPlatformResponseRows,
} from "@/lib/admin-dashboard";
import { deniedFor } from "../page-permission";

export const dynamic = "force-dynamic";

export default async function ResponseRatesPage() {
  const denied = await deniedFor("metrics:read");
  if (denied) return denied;
  const [rows, vouches] = await Promise.all([
    listPlatformResponseRows(),
    listNgoVouchingRows(),
  ]);
  const anyReplyRecorded = rows.some((row) => row.repliesRecorded > 0);

  return (
    <section>
      <div>
        <p className="eyebrow">
          Console · Response rates
        </p>
        <h1 className="page-title-sm mt-3">
          Platform response rates
        </h1>
        <p className="muted mt-3 max-w-2xl text-sm leading-[1.7]">
          Notices sent in the last 7 days, follow-ups not counted. Removed
          counts links the survivor marked removed or the notice recorded as
          removed.
        </p>
        {!anyReplyRecorded && (
          <p className="mt-4 max-w-2xl text-sm leading-[1.7]">
            Asmita does not record platform replies yet, so replies read zero
            and response rates are not shown.
          </p>
        )}
      </div>

      <div className="mt-10 overflow-x-auto rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--page)]">
        <table className="w-full min-w-[760px] text-left text-sm">
          <caption className="sr-only">Notices and replies by platform, last 7 days</caption>
          <thead>
            <tr className="border-b border-[var(--line)]">
              <Th>Platform</Th>
              <Th>Notices sent</Th>
              <Th>Replies recorded</Th>
              <Th>Removed</Th>
              <Th>No reply recorded</Th>
              <Th>Median reply time</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                className="border-t border-[var(--line)]"
                key={row.platformId}
              >
                <td className="p-4 font-medium">{row.platformName}</td>
                <td className="font-mono p-4 tabular-nums">{row.noticesSent}</td>
                <td className="font-mono p-4 tabular-nums">{row.repliesRecorded}</td>
                <td className="font-mono p-4 tabular-nums">{row.removed}</td>
                <td className="font-mono p-4 tabular-nums">{row.noReplyRecorded}</td>
                <td className="font-mono p-4 tabular-nums">
                  {row.medianReplyHours === null ? "-" : `${row.medianReplyHours}h`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="muted p-6 text-center text-sm">
            No notices sent in the last 7 days.
          </p>
        )}
      </div>

      <h2 className="section-title mt-14">
        NGO vouching
      </h2>
      <p className="muted mt-3 max-w-2xl text-sm leading-[1.7]">
        A vouch from a partner NGO moves the case&apos;s pending links on known
        platforms straight to the notice queue, without manual review.
      </p>
      <div className="mt-4 overflow-x-auto rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--page)]">
        <table className="w-full min-w-[640px] text-left text-sm">
          <caption className="sr-only">NGO vouches, newest first</caption>
          <thead>
            <tr className="border-b border-[var(--line)]">
              <Th>Partner</Th>
              <Th>Case</Th>
              <Th>Vouched</Th>
              <Th>Audit event</Th>
            </tr>
          </thead>
          <tbody>
            {vouches.map((row) => (
              <tr
                className="border-t border-[var(--line)]"
                key={row.auditSequence}
              >
                <td className="p-4 font-medium">{row.partnerName}</td>
                <td className="font-mono p-4">{row.caseReference}</td>
                <td className="font-mono p-4 text-xs text-[var(--text-muted)]">
                  {new Date(row.vouchedAt).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                  })}
                </td>
                <td className="font-mono p-4 text-xs text-[var(--text-muted)]">
                  #{row.auditSequence}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {vouches.length === 0 && (
          <p className="muted p-6 text-center text-sm">
            No NGO vouches recorded.
          </p>
        )}
      </div>
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="eyebrow p-4" scope="col">
      {children}
    </th>
  );
}
