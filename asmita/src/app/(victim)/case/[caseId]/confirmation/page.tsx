import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { cases, ensureDemoCase } from "@/lib/store";

export default async function ConfirmationPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const record = cases.get(caseId) || ensureDemoCase();
  return (
    <AppShell>
      <section className="container py-16">
        <p className="text-sm font-bold uppercase tracking-widest text-[var(--teal)]">Case created</p>
        <h1 className="mt-3 text-4xl font-black">We have your case reference.</h1>
        <div className="panel mt-8 max-w-2xl p-6">
          <p className="text-sm font-bold text-[var(--muted)]">Reference number</p>
          <p className="mt-2 font-mono text-2xl font-black">{record.referenceNumber}</p>
          <p className="muted mt-5 leading-7">
            Your dashboard shows platform status and next steps. Confirmation emails never include
            submitted URLs, only this case reference and a dashboard link.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="btn btn-primary" href={`/case/${record.id}`}>
              Open dashboard
            </Link>
            <Link className="btn btn-secondary" href="/resources">
              Support resources
            </Link>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
