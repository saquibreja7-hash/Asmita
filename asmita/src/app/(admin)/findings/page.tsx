import Link from "next/link";
import { FINDING_STATUSES, findingLabelForQuery, LABEL_QUERY_KEYS, listCrawlFindings, type FindingLabel, type FindingStatus } from "@/lib/crawl-findings";
import { crawlerEnabled } from "@/lib/crawler-auth";
import { adminFor } from "../page-permission";
import { CrawlerOffBanner } from "./CrawlerOffBanner";
import { LABEL_TEXT, labelList, noticeLabel, platformLabel, reviewLabel, shortDate, sortFindings, sscdMatchLine, STATUS_LABELS } from "./finding-view";
import { InboxTabs } from "../InboxTabs";

export const dynamic = "force-dynamic";

export default async function FindingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { denied, adminId } = await adminFor("findings:review");
  if (denied || !adminId) return denied;

  const raw = (await searchParams) || {};
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
  const status = FINDING_STATUSES.find((value) => value === one(raw.status));
  const label = findingLabelForQuery(one(raw.label));
  const caseId = one(raw.caseId).trim().slice(0, 64);

  const rows = sortFindings(await listCrawlFindings({ status, caseId: caseId || undefined, ...(label ? { label } : {}), limit: 500 }, adminId));
  const href = (next: { status?: FindingStatus | ""; label?: FindingLabel | ""; caseId?: string }) => {
    const query = new URLSearchParams();
    const s = next.status ?? "";
    if (s) query.set("status", s);
    const l = next.label ?? "";
    if (l) query.set("label", LABEL_QUERY_KEYS[l]);
    if (next.caseId) query.set("caseId", next.caseId);
    const text = query.toString();
    return `/admin/findings${text ? `?${text}` : ""}`;
  };

  return (
    <section>
      <InboxTabs current="findings" />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="eyebrow">Console · Crawler</p>
          <h1 className="mt-3">Findings</h1>
        </div>
        <p className="muted tabular-nums" aria-live="polite">
          {rows.length === 0 ? "No findings" : `${rows.length} finding${rows.length === 1 ? "" : "s"}`}
        </p>
      </div>
      <p className="muted mt-4 max-w-2xl text-sm">
        Pages where the crawler found an image close to a survivor&apos;s fingerprint. A match is a lead, not proof.
        No address is shown here: open a finding and reveal it with a reason.
      </p>
      <Link className="btn btn-secondary mt-4" href="/admin/review/findings" prefetch={false}>
        Review one by one
      </Link>

      {!crawlerEnabled() && <CrawlerOffBanner />}

      <nav aria-label="Finding status" className="mt-6 flex flex-wrap gap-2">
        <Link aria-current={!status ? "page" : undefined} className="a-chip" href={href({ label: label ?? "", caseId })}>
          All
        </Link>
        {FINDING_STATUSES.map((value) => (
          <Link aria-current={status === value ? "page" : undefined} className="a-chip" href={href({ status: value, label: label ?? "", caseId })} key={value}>
            {STATUS_LABELS[value]}
          </Link>
        ))}
      </nav>

      <nav aria-label="Finding label" className="mt-3 flex flex-wrap gap-2">
        <Link aria-current={!label ? "page" : undefined} className="a-chip" href={href({ status, caseId })}>
          Any label
        </Link>
        {(Object.keys(LABEL_QUERY_KEYS) as FindingLabel[]).map((value) => (
          <Link aria-current={label === value ? "page" : undefined} className="a-chip" href={href({ status, label: value, caseId })} key={value}>
            {LABEL_TEXT[value]}
          </Link>
        ))}
      </nav>

      <form action="/admin/findings" className="mt-4 flex flex-wrap items-end gap-3" method="get">
        {status && <input name="status" type="hidden" value={status} />}
        {label && <input name="label" type="hidden" value={LABEL_QUERY_KEYS[label]} />}
        <label className="grid gap-1 text-sm" htmlFor="finding-case">
          <span>Case id</span>
          <input className="field" defaultValue={caseId} id="finding-case" maxLength={64} name="caseId" />
        </label>
        <button className="btn btn-secondary" type="submit">
          Filter
        </button>
        {caseId && (
          <Link className="link-underline text-sm" href={href({ status: status ?? "", label: label ?? "" })}>
            Clear case filter
          </Link>
        )}
      </form>

      <div className="mt-6 overflow-hidden a-card">
        <table className="a-table w-full min-w-[1100px] text-left text-sm">
          <caption className="sr-only">Crawler findings, unreviewed first</caption>
          <thead>
            <tr>
              <th className="eyebrow" scope="col">Case</th>
              <th className="eyebrow" scope="col">Fingerprint</th>
              <th className="eyebrow" scope="col">Distance</th>
              <th className="eyebrow" scope="col">Quality</th>
              <th className="eyebrow" scope="col">Source</th>
              <th className="eyebrow" scope="col">Platform</th>
              <th className="eyebrow" scope="col">Labels</th>
              <th className="eyebrow" scope="col">First seen</th>
              <th className="eyebrow" scope="col">Last seen</th>
              <th className="eyebrow" scope="col">Review</th>
              <th className="eyebrow" scope="col">Notice</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="font-mono">
                  <Link className="link-underline" href={`/admin/findings/${row.id}`}>
                    {row.caseReference ?? "Unknown case"}
                    <span className="sr-only"> open finding</span>
                  </Link>
                </td>
                <td className="font-mono">{row.fingerprintRef ? `${row.fingerprintRef}…` : "-"}</td>
                {/* PDQ and VPDQ keep today's bare distance; an SSCD finding has none, so the cell shows the SSCD line. */}
                <td className="tabular-nums">{row.method === "SSCD" ? sscdMatchLine(row) : row.distance}</td>
                <td className="tabular-nums">{row.quality}/100</td>
                <td>{row.sourceDomain ?? "-"}</td>
                <td>{platformLabel(row.platform)}</td>
                <td>
                  {labelList(row).length === 0 ? (
                    "-"
                  ) : (
                    <ul className="grid gap-1">
                      {labelList(row).map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="a-nowrap tabular-nums">{shortDate(row.firstSeenAt)}</td>
                <td className="a-nowrap tabular-nums">{shortDate(row.lastSeenAt)}</td>
                <td>{reviewLabel(row)}</td>
                <td>{noticeLabel(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="muted p-6 text-center text-sm">No findings match.</p>}
      </div>
    </section>
  );
}
