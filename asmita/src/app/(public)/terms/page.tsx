import { AppShell } from "@/components/layout/AppShell";

export default function TermsPage() {
  return (
    <AppShell>
      <section className="container py-16">
        <h1 className="text-4xl font-black">Terms of use</h1>
        <div className="panel mt-8 max-w-3xl space-y-5 p-6 leading-7">
          <p className="font-bold text-[var(--rose)]">PENDING_REVIEW_BY_LEGAL</p>
          <p>
            This draft is a placeholder for legal review. It must not be treated as final terms or
            used for public launch until a qualified human legal reviewer approves it.
          </p>
        </div>
      </section>
    </AppShell>
  );
}
