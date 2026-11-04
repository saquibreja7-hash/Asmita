import { getInternalAnalytics } from "@/lib/admin-dashboard";

export default async function InternalAnalyticsPage() {
  const analytics = await getInternalAnalytics();
  const stats: Array<[string, number | string]> = [
    ["Total cases", analytics.totalCases],
    ["Open cases", analytics.openCases],
    ["Resolved cases", analytics.resolvedCases],
    ["Submitted URLs", analytics.urlRecordCount],
    ["Review queue", analytics.reviewQueueItems],
    ["Avg URLs / case", analytics.averageUrlsPerCase],
  ];
  const betaStats: Array<[string, string | number]> = [
    [
      "Notice delivery success",
      formatPercent(analytics.betaMetrics.noticeDeliverySuccessRate),
    ],
    [
      "Acknowledgment rate",
      formatPercent(analytics.betaMetrics.acknowledgmentRate),
    ],
    [
      "Removal within 72h",
      formatPercent(analytics.betaMetrics.removalWithin72hRate),
    ],
    [
      "Registration to notice",
      formatHours(analytics.betaMetrics.medianRegistrationToNoticeHours),
    ],
    [
      "Legal package requests",
      analytics.betaMetrics.legalPackageRequests,
    ],
    [
      "Victim feedback",
      `${analytics.betaMetrics.victimFeedbackCount} / ${analytics.betaMetrics.averageVictimFeedbackRating}`,
    ],
    [
      "Email deliverability",
      analytics.betaMetrics.emailDeliverabilityHealthy
        ? "Healthy"
        : "Needs review",
    ],
    [
      "Scheduler correctness",
      formatPercent(analytics.betaMetrics.schedulerCorrectnessRate),
    ],
  ];

  return (
    <section>
      <div>
        <p className="eyebrow">
          Console · Analytics · Internal only
        </p>
        <h1 className="page-title-sm mt-3">
          Analytics dashboard
        </h1>
        <p className="muted mt-3 max-w-2xl text-sm leading-[1.7]">
          {analytics.privacyNote}
        </p>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {stats.map(([label, value]) => (
          <Metric key={label} label={label} value={value} />
        ))}
      </div>

      <div className="mt-12 grid gap-8 lg:grid-cols-3">
        <AnalyticsTable
          title="URL status mix"
          rows={analytics.urlStatusCounts}
          labelKey="status"
        />
        <AnalyticsTable
          title="Platform mix"
          rows={analytics.platformCounts}
          labelKey="platformName"
        />
        <AnalyticsTable
          title="Audit events"
          rows={analytics.auditEventCounts}
          labelKey="eventType"
        />
      </div>

      <section className="mt-14">
        <p className="eyebrow">
          Beta KPI tracker
        </p>
        <h2 className="section-title mt-3">
          Pre-launch indicators.
        </h2>
        <div className="mt-6 grid gap-6 md:grid-cols-4">
          {betaStats.map(([label, value]) => (
            <Metric key={label} label={label} value={value} small />
          ))}
        </div>
      </section>
    </section>
  );
}

function AnalyticsTable({
  title,
  rows,
  labelKey,
}: {
  title: string;
  rows: Array<Record<string, string | number>>;
  labelKey: string;
}) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--page)]">
      <h2 className="subsection-title border-b border-[var(--line)] p-4">
        {title}
      </h2>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--line)]">
            <th className="eyebrow p-4">
              Label
            </th>
            <th className="eyebrow p-4">
              Count
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr
                className="border-t border-[var(--line)]"
                key={String(row[labelKey])}
              >
                <td className="p-4">{row[labelKey]}</td>
                <td className="font-mono p-4 tabular-nums">{row.count}</td>
              </tr>
            ))
          ) : (
            <tr className="border-t border-[var(--line)]">
              <td className="muted p-4" colSpan={2}>
                No data yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Metric({
  label,
  value,
  small,
}: {
  label: string;
  value: number | string;
  small?: boolean;
}) {
  return (
    <div>
      <p className="eyebrow">
        {label}
      </p>
      <p
        className={`font-display mt-2 leading-none tracking-tight text-[var(--ink)] tabular-nums ${
          small ? "text-[26px]" : "text-[36px]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatHours(value: number | null) {
  return value === null ? "-" : `${value}h`;
}
