import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { requireSession } from "@/lib/auth/middleware";
import { getCaseForUser } from "@/lib/case-ops";

export default async function UrlDetailPage({
  params,
}: {
  params: Promise<{ caseId: string; urlId: string }>;
}) {
  const { caseId, urlId } = await params;
  const auth = await requireSession({ adultOnly: true });
  const record = auth.ok ? await getCaseForUser(caseId, auth.session.sub) : null;
  const url = record?.urls.find((item) => item.id === urlId);

  if (!record || !url) {
    return (
      <AppShell>
        <div className="page-canvas">
          <section className="container pb-24 pt-20 text-center md:pb-32 md:pt-32">
            <div className="mx-auto max-w-2xl">
              <span className="pill">
                <span className="dot" />
                URL not available
              </span>
              <h1 className="font-display mt-8 text-[36px] font-normal leading-[1.1] tracking-tight md:text-[56px] md:leading-[1.06]">
                This URL record is{" "}
                <em className="not-italic text-gradient">unavailable</em>.
              </h1>
              <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
                Return to the case dashboard and choose a listed item.
              </p>
              <div className="mt-10 flex flex-wrap justify-center gap-3">
                <Link
                  className="btn btn-primary"
                  href={record ? `/case/${record.id}` : "/start"}
                >
                  Back to dashboard
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
        <section className="container pb-10 pt-20 text-center md:pb-14 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              URL status
            </span>
            <p className="font-mono mt-6 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
              Case · {record.referenceNumber}
            </p>
            <h1 className="font-display mt-4 text-[36px] font-normal leading-[1.1] tracking-tight md:text-[52px] md:leading-[1.06]">
              {url.platformName}
            </h1>
            <p className="font-mono mt-3 text-[14px] tracking-tight text-[var(--muted)] md:text-[16px]">
              {url.domain}
            </p>
          </div>
        </section>

        {/* STATUS BLOCK */}
        <section className="container py-10 md:py-14">
          <div className="mx-auto max-w-2xl">
            <dl className="mx-auto grid max-w-md gap-6 text-center sm:grid-cols-2 sm:text-left">
              <Field label="Status" value={url.status.replaceAll("_", " ")} />
              <Field
                label="URL hash prefix"
                value={url.urlHash.slice(0, 16)}
                mono
              />
            </dl>
            <p className="muted mx-auto mt-10 max-w-lg text-center text-base leading-[1.75]">
              Asmita shows routing metadata only. It does not preview, fetch,
              or render submitted content.
            </p>
          </div>
        </section>

        {/* CLOSING */}
        <section className="container pb-24 pt-12 text-center md:pb-32 md:pt-16">
          <div className="flex flex-wrap justify-center gap-3">
            <Link className="btn btn-primary" href={`/case/${record.id}`}>
              Back to dashboard
            </Link>
            <Link className="btn btn-secondary" href="/resources">
              Support resources
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
      <dt className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
        {label}
      </dt>
      <dd
        className={`mt-2 capitalize ${
          mono
            ? "font-mono text-[14px] tracking-tight text-[var(--foreground)] normal-case"
            : "font-display text-[20px] tracking-tight text-[var(--foreground)] md:text-[24px]"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
