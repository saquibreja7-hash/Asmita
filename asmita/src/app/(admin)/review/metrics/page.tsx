import Link from "next/link";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { shortAge } from "@/lib/review-views";
import {
  METRIC_BUCKETS,
  METRIC_WINDOWS,
  MIN_METRIC_SAMPLES,
  parseMetricBucket,
  parseMetricWindow,
  reviewMetrics,
} from "@/lib/review-metrics";

export const dynamic = "force-dynamic";

// Review metrics (review-console-spec.md, WP145): jobs created per day or
// week bucket, what is open now per queue with the oldest item, time from a
// job's creation to its decision (median and p90), median handle time
// (claim to decision), decisions by queue and by reviewer, skips by queue,
// and jobs closed as resolved elsewhere. Counts and ages only; a reviewer
// is a handle, never an email. Under five samples a median or percentile
// would say more than the data does, so the page says "Not enough data".
const DAY_MS = 86_400_000;
const FOUR_HOURS_MS = 4 * 3_600_000;

/** The oldest open item's age, in the queue list's own words (WP141). */
function oldestOpen(oldestCreatedAt: string | null, now: Date) {
  if (!oldestCreatedAt) return { text: "-", tone: "fresh" as const };
  const age = now.getTime() - new Date(oldestCreatedAt).getTime();
  if (age > DAY_MS) return { text: `over a day (${shortAge(age)})`, tone: "over-day" as const };
  if (age >= FOUR_HOURS_MS) return { text: shortAge(age), tone: "aging" as const };
  return { text: shortAge(age), tone: "fresh" as const };
}

function bucketLabel(bucketStart: string, bucket: "day" | "week") {
  const date = new Date(bucketStart);
  return date.toLocaleDateString("en-IN", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    ...(bucket === "week" ? { weekday: undefined } : {}),
  });
}

function secondsText(value: number | null) {
  if (value === null) return "Not enough data";
  return shortAge(value * 1000);
}

export default async function ReviewMetricsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await requireAdminPermission("metrics:read");
  if (!auth.ok) {
    return (
      <section>
        <p className="eyebrow">Console · Review</p>
        <h1 className="mt-3">Not available</h1>
        <p className="muted mt-6 text-sm">Your admin role cannot read metrics.</p>
      </section>
    );
  }

  const raw = (await searchParams) || {};
  const one = (key: string) => {
    const value = raw[key];
    return (Array.isArray(value) ? value[0] : value) ?? "";
  };
  const days = parseMetricWindow(one("days"));
  const bucket = parseMetricBucket(one("bucket"));
  const now = new Date();
  const metrics = await reviewMetrics({ days, bucket, now });

  const windowHref = (nextDays: number, nextBucket: string) =>
    `/admin/review/metrics?${new URLSearchParams({ days: String(nextDays), bucket: nextBucket }).toString()}`;
  const maxCreated = Math.max(...metrics.jobsCreatedPerBucket.map((entry) => entry.count), 1);
  const decisionsInWindow = metrics.decisionsByQueue.reduce((total, row) => total + row.count, 0);

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="eyebrow">Console · Review</p>
          <h1 className="mt-3">Review metrics</h1>
        </div>
        <Link className="link-underline text-sm" href="/admin/review/decisions" prefetch={false}>
          Decisions log
        </Link>
      </div>
      <p className="muted mt-3 max-w-2xl text-sm">
        How the review queues are moving: jobs created, what waits now and how long decisions took. Counts and
        durations only — no addresses, no notes, no survivor text. A median needs at least{" "}
        {MIN_METRIC_SAMPLES} decisions; with fewer the page says so rather than showing a figure that says
        more than the data does.
      </p>

      <nav aria-label="Window and bucket" className="mt-6 flex flex-wrap items-center gap-2">
        {METRIC_WINDOWS.map((window) => (
          <Link
            aria-current={window === days ? "page" : undefined}
            className={`a-chip ${window === days ? "font-semibold" : ""}`}
            href={windowHref(window, bucket)}
            key={window}
          >
            Last {window} days
          </Link>
        ))}
        <span className="mx-2 text-[var(--line)]" aria-hidden="true">
          |
        </span>
        {METRIC_BUCKETS.map((entry) => (
          <Link
            aria-current={entry === bucket ? "page" : undefined}
            className={`a-chip ${entry === bucket ? "font-semibold" : ""}`}
            href={windowHref(days, entry)}
            key={entry}
          >
            By {entry}
          </Link>
        ))}
      </nav>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        <Metric label="Open now" value={String(metrics.openNow)} hint="across every queue" />
        <Metric label={`Decisions, last ${days} days`} value={String(decisionsInWindow)} hint="all queues" />
        <Metric label="Closed as resolved elsewhere" value={String(metrics.resolvedElsewhere)} hint={`last ${days} days`} />
        <Metric
          label="Time to first review (median)"
          value={secondsText(metrics.timeToDecision.medianSeconds)}
          hint={`${metrics.timeToDecision.samples} decided job${metrics.timeToDecision.samples === 1 ? "" : "s"}`}
          alert={metrics.timeToDecision.medianSeconds === null}
        />
        <Metric
          label="Handle time (median)"
          value={secondsText(metrics.handleTime.medianSeconds)}
          hint={`${metrics.handleTime.samples} held decision${metrics.handleTime.samples === 1 ? "" : "s"}`}
          alert={metrics.handleTime.medianSeconds === null}
        />
      </div>

      <div className="mt-8 overflow-hidden a-card">
        <h2 className="border-b border-[var(--line)] p-4">Jobs created, by {bucket}</h2>
        <ul aria-label={`Jobs created per ${bucket}`} className="grid gap-1 p-4">
          {metrics.jobsCreatedPerBucket.map((entry) => (
            <li className="grid grid-cols-[9rem_1fr_2.5rem] items-center gap-2 text-sm" key={entry.bucketStart}>
              <span className="a-nowrap muted text-xs">{bucketLabel(entry.bucketStart, bucket)}</span>
              <span className="h-2 overflow-hidden rounded-full bg-[var(--line)]" aria-hidden="true">
                <span
                  className="block h-full bg-[var(--brand)]"
                  style={{ width: `${Math.round((entry.count / maxCreated) * 100)}%` }}
                />
              </span>
              <span className="text-right tabular-nums">{entry.count}</span>
            </li>
          ))}
        </ul>
        <p className="muted border-t border-[var(--line)] p-4 text-xs">
          Bars compare within this window only; every count is written beside its bar.
        </p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <QueueTable
          caption={`Open now, per queue`}
          head="Oldest open"
          rows={metrics.openPerQueue.map((row) => {
            const oldest = oldestOpen(row.oldestCreatedAt, now);
            return {
              key: row.queueId,
              name: row.queueName,
              count: String(row.count),
              extra: oldest.text,
              tone: oldest.tone,
            };
          })}
          countLabel="Open"
        />
        <QueueTable
          caption={`Decisions by queue, last ${days} days`}
          head="Decisions"
          rows={metrics.decisionsByQueue.map((row) => ({
            key: row.queueId,
            name: row.queueName,
            count: String(row.count),
            extra: "",
            tone: "fresh" as const,
          }))}
          countLabel="Decisions"
        />
        <QueueTable
          caption={`Skips by queue, last ${days} days`}
          head="Skips"
          rows={metrics.skipsByQueue.map((row) => ({
            key: row.queueId,
            name: row.queueName,
            count: String(row.count),
            extra: "",
            tone: "fresh" as const,
          }))}
          countLabel="Skips"
        />
        <div className="overflow-hidden a-card">
          <h2 className="border-b border-[var(--line)] p-4">Decisions by reviewer, last {days} days</h2>
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Decisions per reviewer</caption>
            <thead>
              <tr className="border-b border-[var(--line)]">
                <th className="eyebrow p-4" scope="col">
                  Reviewer
                </th>
                <th className="eyebrow p-4" scope="col">
                  Decisions
                </th>
              </tr>
            </thead>
            <tbody>
              {metrics.decisionsByReviewer.length === 0 ? (
                <tr>
                  <td className="muted p-4" colSpan={2}>
                    No decisions in this window.
                  </td>
                </tr>
              ) : (
                metrics.decisionsByReviewer.map((row) => (
                  <tr className="border-t border-[var(--line)]" key={row.reviewerEmailHash}>
                    <td className="p-4">{reviewerName(row.reviewerEmailHash, auth.session.emailHash)}</td>
                    <td className="p-4 tabular-nums">{row.count}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="muted mt-8 max-w-2xl text-xs">
        Time to first review runs from a job&apos;s creation to its decision. Handle time runs from the claim
        that decided the item, so decisions taken without holding the item (bulk actions, the sync) count in
        the first figure and not the second. The p90 time to first review is{" "}
        {metrics.timeToDecision.p90Seconds === null ? "not shown" : secondsText(metrics.timeToDecision.p90Seconds)}
        {metrics.timeToDecision.p90Seconds !== null && ` (${metrics.timeToDecision.samples} decided jobs)`}.
      </p>
    </section>
  );
}

function reviewerName(reviewerEmailHash: string, viewerEmailHash: string) {
  if (reviewerEmailHash === viewerEmailHash) return "You";
  if (reviewerEmailHash === "") return "System";
  return `Reviewer ${reviewerEmailHash.slice(0, 4)}`;
}

function Metric({
  label,
  value,
  hint,
  alert,
}: {
  label: string;
  value: string;
  hint: string;
  alert?: boolean;
}) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className={`mt-2 font-semibold tabular-nums ${alert ? "text-base font-normal" : "a-stat-value"}`}>{value}</p>
      <p className="muted mt-1 text-xs">{hint}</p>
    </div>
  );
}

function QueueTable({
  caption,
  head,
  countLabel,
  rows,
}: {
  caption: string;
  head: string;
  countLabel: string;
  rows: Array<{ key: string; name: string; count: string; extra: string; tone: "fresh" | "aging" | "over-day" }>;
}) {
  return (
    <div className="overflow-hidden a-card">
      <h2 className="border-b border-[var(--line)] p-4">{caption}</h2>
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-[var(--line)]">
            <th className="eyebrow p-4" scope="col">
              Queue
            </th>
            <th className="eyebrow p-4" scope="col">
              {countLabel}
            </th>
            <th className="eyebrow p-4" scope="col">
              {head}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="muted p-4" colSpan={3}>
                Nothing to show in this window.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr className="border-t border-[var(--line)]" key={row.key}>
                <td className="p-4">{row.name}</td>
                <td className="p-4 tabular-nums">{row.count}</td>
                <td
                  className={`a-nowrap p-4 tabular-nums ${
                    row.tone === "over-day"
                      ? "font-semibold text-[var(--danger)]"
                      : row.tone === "aging"
                        ? "text-[var(--coral)]"
                        : "text-[var(--text-muted)]"
                  }`}
                >
                  {row.tone === "over-day" && <span aria-hidden="true">! </span>}
                  {row.extra}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
