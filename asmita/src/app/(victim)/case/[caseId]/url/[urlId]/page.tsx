import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { requireSession } from "@/lib/auth/middleware";
import { getCaseForUser } from "@/lib/case-ops";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";

export default async function UrlDetailPage({
  params,
}: {
  params: Promise<{ caseId: string; urlId: string }>;
}) {
  const { caseId, urlId } = await params;
  const locale = await getLocale();
  const auth = await requireSession({ adultOnly: true });
  const record = auth.ok ? await getCaseForUser(caseId, auth.session.sub) : null;
  const url = record?.urls.find((item) => item.id === urlId);

  if (!record || !url) {
    return (
      <AppShell>
        <div className="page-canvas">
          <section className="container page-hero text-center">
            <div className="mx-auto max-w-2xl">
              <span className="eyebrow">{t(locale, "urldetail.notAvailable.pill")}</span>
              <h1 className="page-title-sm mt-8">
                {t(locale, "urldetail.notAvailable.title.1")}{" "}
                <em className="not-italic text-gradient">{t(locale, "urldetail.notAvailable.title.em")}</em>
                {t(locale, "urldetail.notAvailable.title.2")}
              </h1>
              <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
                {t(locale, "urldetail.notAvailable.sub")}
              </p>
              <div className="mt-10 flex flex-wrap justify-center gap-3">
                <Link
                  className="btn btn-primary"
                  href={record ? `/case/${record.id}` : "/start"}
                >
                  {t(locale, "urldetail.notAvailable.cta")}
                </Link>
              </div>
            </div>
          </section>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="page-canvas">
        {/* HEADER */}
        <section className="container page-hero text-center">
          <div className="mx-auto max-w-2xl">
            <span className="eyebrow">{t(locale, "urldetail.pill")}</span>
            <p className="eyebrow mt-6">
              {t(locale, "urldetail.case")} · {record.referenceNumber}
            </p>
            <h1 className="page-title-sm mt-4">
              {url.platformName}
            </h1>
            <p className="font-mono mt-3 text-[14px] tracking-tight text-[var(--text-muted)] md:text-[16px]">
              {url.domain}
            </p>
          </div>
        </section>

        {/* STATUS BLOCK */}
        <section className="container section-pad">
          <div className="mx-auto max-w-2xl">
            <dl className="mx-auto grid max-w-md gap-6 text-center sm:grid-cols-2 sm:text-left">
              <Field label={t(locale, "urldetail.field.status")} value={url.status.replaceAll("_", " ")} />
              <Field
                label={t(locale, "urldetail.field.hash")}
                value={url.urlHash ? url.urlHash.slice(0, 16) : t(locale, "case.urlExpired")}
                mono
              />
            </dl>
            <p className="muted mx-auto mt-10 max-w-lg text-center text-base leading-[1.75]">
              {t(locale, "urldetail.note")}
            </p>
          </div>
        </section>

        {/* CLOSING */}
        <section className="container page-hero text-center">
          <div className="flex flex-wrap justify-center gap-3">
            <Link className="btn btn-primary" href={`/case/${record.id}`}>
              {t(locale, "urldetail.cta.dashboard")}
            </Link>
            <Link className="btn btn-secondary" href="/resources">
              {t(locale, "urldetail.cta.resources")}
            </Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="eyebrow">
        {label}
      </dt>
      <dd
        className={`mt-2 capitalize ${
          mono
            ? "font-mono text-[14px] tracking-tight text-[var(--ink)] normal-case"
            : "font-display text-[20px] tracking-tight text-[var(--ink)] md:text-[24px]"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
