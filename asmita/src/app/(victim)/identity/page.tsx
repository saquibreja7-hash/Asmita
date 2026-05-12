import { AppShell } from "@/components/layout/AppShell";

export default function IdentityPage() {
  return (
    <AppShell>
      <section className="container py-16">
        <p className="text-sm font-bold uppercase tracking-widest text-[var(--teal)]">Optional</p>
        <h1 className="mt-3 text-4xl font-black">Identity verification</h1>
        <div className="panel mt-8 max-w-3xl space-y-5 p-6 leading-7">
          <p>
            Identity verification is optional in this scaffold. Aadhaar offline XML verification is
            not activated until certificate-chain validation and legal review are complete.
          </p>
          <p className="rounded-md border border-[var(--border)] bg-[var(--teal-soft)] p-4 font-bold">
            No Aadhaar number is requested or stored on this screen.
          </p>
        </div>
      </section>
    </AppShell>
  );
}
