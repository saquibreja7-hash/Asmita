import type { CrawlerStats } from "@/lib/crawl-stats";
import { CrawlerOffBanner } from "../findings/CrawlerOffBanner";
import { shortDate } from "../findings/finding-view";

// The whole body of the "Crawler overview" page (crawler v2 WP8): a
// read-only rendering of the address-free aggregates from
// GET /api/admin/crawler/stats (src/lib/crawl-stats.ts). Counts,
// timestamps and one run id only — never a host, address, fingerprint or
// case reference; nothing here reveals or fetches an address, and no action
// can be taken from this page (the findings and sites pages hold those).

const ORIGIN_ROWS: Array<{ key: keyof CrawlerStats["sites"]["byOrigin"]; label: string }> = [
  { key: "admin", label: "Admin" },
  { key: "reported", label: "Reported" },
  { key: "discovered", label: "Discovered" },
];

const QUEUE_ROWS: Array<{ key: keyof CrawlerStats["queue"]; label: string; note: string }> = [
  { key: "live", label: "Live rows", note: "everything still to be crawled" },
  { key: "pending", label: "Pending", note: "never visited yet" },
  { key: "due", label: "Due now", note: "a claim would take these" },
  { key: "claimed", label: "Claimed", note: "out with a run, 30-minute window" },
  { key: "scheduled", label: "Scheduled", note: "waiting for their next visit" },
  { key: "dead", label: "Dead", note: "gone, or five failures" },
];

// The failure codes first (the "errors by code" view), then the healthy
// outcomes for context. The code is the page outcome the crawler reported;
// the app never sees the crawler's finer error codes.
const OUTCOME_ROWS: Array<{ key: keyof CrawlerStats["pagesByStatus"]; code: string; label: string }> = [
  { key: "error", code: "error", label: "Fetch or decode failed (backs off, dead after five)" },
  { key: "blocked", code: "blocked", label: "Robots.txt or a 401/403 answer (rechecked daily)" },
  { key: "gone", code: "gone", label: "Page gone for good (404/410)" },
  { key: "dead", code: "dead", label: "Marked dead after five failures" },
  { key: "fetched", code: "fetched", label: "Fetched (revisited daily)" },
  { key: "notModified", code: "not_modified", label: "Unchanged since the last visit" },
  { key: "pending", code: "pending", label: "Waiting for the first visit" },
];

function formatStamp(iso: string | null): string {
  return iso === null ? "Never" : `${shortDate(iso)} UTC`;
}

function Stat({ label, value, detail }: { label: string; value: number; detail?: string }) {
  return (
    <div className="a-card p-4">
      <p className="eyebrow">{label}</p>
      <p className="a-stat-value mt-2" data-empty={value === 0}>
        {value}
      </p>
      {detail && <p className="muted mt-1 text-sm">{detail}</p>}
    </div>
  );
}

function Panel({ title, caption, children }: { title: string; caption: string; children: React.ReactNode }) {
  return (
    <div className="a-card overflow-hidden">
      <div className="p-4 pb-0">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="muted mt-1 text-sm">{caption}</p>
      </div>
      <table className="a-table w-full text-left text-sm">
        <caption className="sr-only">{title}</caption>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Row({ cells }: { cells: Array<{ text: string | number; muted?: boolean }> }) {
  return (
    <tr>
      {cells.map((cell, index) => (
        <td className={index === 0 ? "font-medium" : cell.muted ? "muted" : "tabular-nums"} key={index}>
          {cell.text}
        </td>
      ))}
    </tr>
  );
}

export function CrawlerOverview({ stats, crawlerEnabled = true }: { stats: CrawlerStats; crawlerEnabled?: boolean }) {
  const { sites, queue, findings, pagesByStatus, lastRun } = stats;
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="eyebrow">Console · Crawler</p>
          <h1 className="mt-3">Crawler overview</h1>
        </div>
        <p className="muted tabular-nums">{`Generated ${formatStamp(stats.generatedAt)}`}</p>
      </div>
      <p className="muted mt-4 max-w-2xl text-sm">
        Read-only: how the crawler&apos;s work stands. Every number is an aggregate — counts, times and codes only,
        never a host, an address, a fingerprint or a case. A match is a lead, not proof. The day rolls over at 00:00
        UTC, like each site&apos;s daily page budget.
      </p>

      {!crawlerEnabled && <CrawlerOffBanner />}

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <Stat detail={`${sites.enabled} switched on`} label="Sites" value={sites.total} />
        <Stat detail="since 00:00 UTC" label="Pages crawled today" value={stats.pagesCrawledToday} />
        <Stat detail={`${queue.due} due · ${queue.claimed} claimed`} label="Queue" value={queue.live} />
        <Stat detail="since 00:00 UTC" label="Discovered today" value={stats.discoveredSitesToday} />
        <Stat detail={`${findings.approved} approved · ${findings.dismissed} dismissed`} label="Matches awaiting review" value={findings.awaitingReview} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel caption="Sources by how they entered the list and whether the crawler may visit them." title="Sites by origin and state">
          <Row cells={[{ text: "Origin" }, { text: "Total", muted: true }, { text: "On", muted: true }, { text: "Off", muted: true }]} />
          {ORIGIN_ROWS.map(({ key, label }) => (
            <Row cells={[{ text: label }, { text: sites.byOrigin[key].total }, { text: sites.byOrigin[key].enabled }, { text: sites.byOrigin[key].disabled }]} key={key} />
          ))}
        </Panel>

        <Panel caption="The app-owned frontier: every page URL waiting to be visited (CrawlPage rows)." title="Queue">
          {QUEUE_ROWS.map(({ key, label, note }) => (
            <Row cells={[{ text: label }, { text: queue[key] }, { text: note, muted: true }]} key={key} />
          ))}
        </Panel>

        <Panel caption="Page outcomes the app holds, by the code the crawler reported. The crawler&apos;s own logs hold the finer error codes." title="Errors by code">
          {OUTCOME_ROWS.map(({ key, code, label }) => (
            <Row cells={[{ text: code }, { text: pagesByStatus[key] }, { text: label, muted: true }]} key={key} />
          ))}
        </Panel>

        <div className="a-card p-4">
          <h2 className="text-base font-semibold">Last run</h2>
          {lastRun.activityAt === null ? (
            <p className="muted mt-2 text-sm">No crawl activity recorded yet.</p>
          ) : (
            <div className="mt-2 grid gap-1 text-sm">
              <p className="tabular-nums">{`Last activity ${formatStamp(lastRun.activityAt)}`}</p>
              {lastRun.findingRun && (
                <p className="font-mono">{`Newest run with matches: ${lastRun.findingRun.runId}`}</p>
              )}
              {lastRun.findingRun && (
                <p className="tabular-nums">
                  {`${lastRun.findingRun.findings} findings, first seen ${formatStamp(lastRun.findingRun.firstSeenAt)}, last seen ${formatStamp(lastRun.findingRun.lastSeenAt)}`}
                </p>
              )}
            </div>
          )}
          <p className="muted mt-3 text-sm">
            The app sees a run only through what the crawler reports to it: page updates and matches. A run that found
            nothing leaves no run id behind; the crawler&apos;s own run summary in its logs is the full record.
          </p>
        </div>
      </div>
    </section>
  );
}
