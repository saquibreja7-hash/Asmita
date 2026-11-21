import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t, type MessageKey } from "@/lib/i18n";
import { labEnabled } from "@/lib/lab/flags";
import { labPublicNumbers } from "@/lib/lab/lab-stats";
import { LAB_CHOKEPOINT_KINDS, type LabChokepointKind, type LabServiceStatus } from "@/lib/lab/lab-store";

export const metadata: Metadata = {
  title: "Service tracker",
  description:
    "An Asmita AI Lab page: aggregate numbers on the services that make or spread AI-made intimate images — how many are tracked, how many were taken down, and how fast reports work. No service is ever named.",
};

export const dynamic = "force-dynamic";

// The public service tracker (docs/lab/beta-spec.md WP92): the E2 aggregate
// numbers, from labPublicNumbers() — services tracked, taken down, the
// median days from first report to down, a small by-provider-kind table, and
// the status split as a small chart. Aggregate numbers only: no service or
// provider is ever named or linked, and the page says so. While there is no
// data it shows an honest empty state instead of zeroes. Like every Lab tool
// page it answers 404 while ENABLE_LAB is off, carries the Beta badge, the
// one-sentence limits note and the site's under-18 pointer, and every string
// is translated (en, hi).

const KIND_LABELS: Record<LabChokepointKind, MessageKey> = {
  HOST: "lab.tracker.table.kind.host",
  CDN: "lab.tracker.table.kind.cdn",
  REGISTRAR: "lab.tracker.table.kind.registrar",
  PAYMENT_PROCESSOR: "lab.tracker.table.kind.payment",
  APP_STORE: "lab.tracker.table.kind.appStore",
  AD_NETWORK: "lab.tracker.table.kind.adNetwork",
  PLATFORM_ACCOUNT: "lab.tracker.table.kind.platform",
};

// The chart's bars, in reading order: what the daily check last saw.
const STATUS_BARS: { status: LabServiceStatus; labelKey: MessageKey; color: string }[] = [
  { status: "DOWN", labelKey: "lab.tracker.chart.down", color: "var(--brand-strong)" },
  { status: "ACTIVE", labelKey: "lab.tracker.chart.active", color: "var(--ink)" },
  { status: "UNKNOWN", labelKey: "lab.tracker.chart.unknown", color: "var(--muted)" },
];

export default async function TrackerPage() {
  if (!labEnabled()) notFound();
  const locale = await getLocale();
  const numbers = await labPublicNumbers();
  const hasData = numbers.servicesTracked > 0;
  const total = numbers.servicesTracked;

  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="hero" aria-label={t(locale, "lab.eyebrow")}>
          <div className="hero-content container section-pad page-hero-split">
            <div className="mx-auto max-w-2xl text-center">
              <span className="eyebrow">{t(locale, "lab.eyebrow")}</span>
              <h1 className="page-title mt-5">{t(locale, "lab.tracker.title")}</h1>
              <p className="mt-4">
                <span className="inline-flex items-center rounded-full border border-[var(--brand)] bg-[var(--brand-soft)] px-3 py-1 text-xs font-semibold tracking-wide text-[var(--brand-strong)]">
                  {t(locale, "lab.tracker.beta")}
                </span>
              </p>
              <p className="font-size-large mx-auto mt-5 max-w-xl text-[var(--ink)]">{t(locale, "lab.tracker.intro")}</p>
              <p className="muted mx-auto mt-4 max-w-xl text-sm leading-[1.7]">{t(locale, "lab.tracker.cannotDo")}</p>
              <p className="mt-6">
                <Link href="/lab" className="btn btn-secondary">
                  {t(locale, "lab.tracker.back")}
                </Link>
              </p>
            </div>
          </div>
        </section>

        {/* NUMBERS */}
        <section className="section-pad" aria-labelledby="tracker-numbers">
          <div className="container">
            <h2 id="tracker-numbers" className="section-title">{t(locale, "lab.tracker.numbers.title")}</h2>

            {!hasData ? (
              // The honest empty state: no data has been published yet, so no
              // numbers are invented. role="status" announces the region.
              <div
                role="status"
                className="mx-auto mt-8 max-w-2xl rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-8 text-center"
              >
                <h3 className="font-semibold">{t(locale, "lab.tracker.empty.title")}</h3>
                <p className="muted mt-3 text-sm leading-[1.7]">{t(locale, "lab.tracker.empty.body")}</p>
              </div>
            ) : (
              <>
                <div className="mx-auto mt-8 grid max-w-4xl gap-6 sm:grid-cols-3">
                  <div className="card text-center">
                    <p className="text-3xl font-medium tabular-nums">{numbers.servicesTracked}</p>
                    <p className="mt-1 text-sm">{t(locale, "lab.tracker.stat.services")}</p>
                  </div>
                  <div className="card text-center">
                    <p className="text-3xl font-medium tabular-nums">{numbers.servicesTakenDown}</p>
                    <p className="mt-1 text-sm">{t(locale, "lab.tracker.stat.takenDown")}</p>
                  </div>
                  <div className="card text-center">
                    <p className="text-3xl font-medium tabular-nums">
                      {numbers.medianDaysToDown === null ? "—" : numbers.medianDaysToDown.toFixed(1)}
                    </p>
                    <p className="mt-1 text-sm">{t(locale, "lab.tracker.stat.median")}</p>
                  </div>
                </div>

                {/* A small chart, no library: CSS bars whose numbers are real
                    text, so every label and count is readable without sight. */}
                <div className="mx-auto mt-10 max-w-2xl">
                  <h3 className="text-center font-semibold">{t(locale, "lab.tracker.chart.title")}</h3>
                  <ul className="mt-5 space-y-3">
                    {STATUS_BARS.map((bar) => {
                      const value = numbers.servicesByStatus[bar.status];
                      const pct = total > 0 ? Math.round((value / total) * 100) : 0;
                      return (
                        <li key={bar.status} className="flex items-center gap-3">
                          <span className="w-24 shrink-0 text-sm text-[var(--text)]">{t(locale, bar.labelKey)}</span>
                          <span
                            aria-hidden="true"
                            className="h-3 flex-1 overflow-hidden rounded-full"
                            style={{ background: "var(--line)" }}
                          >
                            <span
                              className="block h-full rounded-full"
                              style={{ width: `${pct}%`, background: bar.color }}
                            />
                          </span>
                          <span className="w-10 shrink-0 text-right text-sm tabular-nums font-medium text-[var(--ink)]">
                            {value}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="muted mt-4 text-center text-sm leading-[1.7]">{t(locale, "lab.tracker.chart.note")}</p>
                </div>

                {/* BY-PROVIDER-KIND TABLE */}
                <div className="mx-auto mt-12 max-w-3xl">
                  <h3 className="text-center font-semibold">{t(locale, "lab.tracker.table.title")}</h3>
                  <div className="mt-5 overflow-hidden rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)]">
                    <table className="w-full text-left text-sm">
                      <caption className="sr-only">{t(locale, "lab.tracker.table.title")}</caption>
                      <thead>
                        <tr className="border-b border-[var(--line)]">
                          <th scope="col" className="px-4 py-3 font-semibold">{t(locale, "lab.tracker.table.kind")}</th>
                          <th scope="col" className="px-4 py-3 text-right font-semibold">{t(locale, "lab.tracker.table.reported")}</th>
                          <th scope="col" className="px-4 py-3 text-right font-semibold">{t(locale, "lab.tracker.table.down")}</th>
                          <th scope="col" className="px-4 py-3 text-right font-semibold">{t(locale, "lab.tracker.table.median")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {LAB_CHOKEPOINT_KINDS.map((kind) => {
                          const kindNumbers = numbers.byKind[kind];
                          return (
                            <tr key={kind} className="border-b border-[var(--line)] last:border-b-0">
                              <td className="px-4 py-3">{t(locale, KIND_LABELS[kind])}</td>
                              <td className="px-4 py-3 text-right tabular-nums">{kindNumbers.reported}</td>
                              <td className="px-4 py-3 text-right tabular-nums">{kindNumbers.down}</td>
                              <td className="px-4 py-3 text-right tabular-nums">
                                {kindNumbers.medianDays === null ? "—" : kindNumbers.medianDays.toFixed(1)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="muted mt-4 text-center text-sm leading-[1.7]">{t(locale, "lab.tracker.table.dash")}</p>

                  {numbers.downWithin30Days.reported > 0 && (
                    <p className="muted mt-6 text-center text-sm leading-[1.7]">
                      {t(locale, "lab.tracker.metric.prefix")}{" "}
                      <strong className="tabular-nums text-[var(--ink)]">{numbers.downWithin30Days.reported}</strong>{" "}
                      {t(locale, "lab.tracker.metric.middle")}{" "}
                      <strong className="tabular-nums text-[var(--ink)]">{numbers.downWithin30Days.downWithin}</strong>{" "}
                      {t(locale, "lab.tracker.metric.suffix")}
                    </p>
                  )}
                </div>
              </>
            )}

            <p className="muted mx-auto mt-8 max-w-2xl text-center text-sm leading-[1.7]">{t(locale, "lab.tracker.names")}</p>
          </div>
        </section>

        {/* METHOD, in plain words */}
        <section className="zone-white section-pad" aria-labelledby="tracker-method">
          <div className="container">
            <h2 id="tracker-method" className="section-title">{t(locale, "lab.tracker.method.title")}</h2>
            <div className="mx-auto mt-8 max-w-2xl space-y-8">
              <div>
                <h3 className="font-semibold">{t(locale, "lab.tracker.method.down.title")}</h3>
                <p className="mt-2 text-[16px] leading-[1.7] text-[var(--text)]">{t(locale, "lab.tracker.method.down.body")}</p>
              </div>
              <div>
                <h3 className="font-semibold">{t(locale, "lab.tracker.method.liveness.title")}</h3>
                <p className="mt-2 text-[16px] leading-[1.7] text-[var(--text)]">{t(locale, "lab.tracker.method.liveness.body")}</p>
              </div>
              <div>
                <h3 className="font-semibold">{t(locale, "lab.tracker.method.median.title")}</h3>
                <p className="mt-2 text-[16px] leading-[1.7] text-[var(--text)]">{t(locale, "lab.tracker.method.median.body")}</p>
              </div>
              <div>
                <h3 className="font-semibold">{t(locale, "lab.tracker.method.kinds.title")}</h3>
                <p className="mt-2 text-[16px] leading-[1.7] text-[var(--text)]">{t(locale, "lab.tracker.method.kinds.body")}</p>
              </div>
            </div>
            <p className="mt-8">
              <Link href="/minor-support" className="link-underline text-sm text-[var(--text-muted)]">
                {t(locale, "lab.tracker.minor")}{" "}
                <span className="cta-arrow" aria-hidden>→</span>
              </Link>
            </p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
