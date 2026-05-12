import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { cases } from "@/lib/store";

export default async function UrlDetailPage({ params }: { params: Promise<{ caseId: string; urlId: string }> }) {
  const { caseId, urlId } = await params;
  const record = cases.get(caseId);
  const url = record?.urls.find((item) => item.id === urlId);

  return (
    <AppShell>
      <section className="container py-16">
        <p className="text-sm font-bold uppercase tracking-widest text-[var(--teal)]">URL status</p>
        {!record || !url ? (
          <div className="panel mt-8 max-w-2xl p-6">
            <h1 className="text-3xl font-black">This URL record is not available.</h1>
            <p className="muted mt-3">Return to the case dashboard and choose a listed item.</p>
            <Link className="btn btn-primary mt-6" href={record ? `/case/${record.id}` : "/cases"}>
              Back to dashboard
            </Link>
          </div>
        ) : (
          <>
            <h1 className="mt-3 text-4xl font-black">{record.referenceNumber}</h1>
            <div className="panel mt-8 max-w-3xl p-6">
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm font-bold text-[var(--muted)]">Platform</dt>
                  <dd className="mt-1 text-lg font-black">{url.platformName}</dd>
                </div>
                <div>
                  <dt className="text-sm font-bold text-[var(--muted)]">Domain</dt>
                  <dd className="mt-1 text-lg font-black">{url.domain}</dd>
                </div>
                <div>
                  <dt className="text-sm font-bold text-[var(--muted)]">Status</dt>
                  <dd className="mt-1 text-lg font-black">{url.status.replaceAll("_", " ")}</dd>
                </div>
                <div>
                  <dt className="text-sm font-bold text-[var(--muted)]">URL hash prefix</dt>
                  <dd className="mt-1 font-mono text-sm">{url.urlHash.slice(0, 16)}</dd>
                </div>
              </dl>
              <p className="muted mt-6">
                Asmita shows routing metadata only. It does not preview, fetch, or render submitted content.
              </p>
            </div>
          </>
        )}
      </section>
    </AppShell>
  );
}
