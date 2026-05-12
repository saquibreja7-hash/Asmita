import { AppShell } from "@/components/layout/AppShell";

export default function ContactPage() {
  return (
    <AppShell>
      <section className="container py-16">
        <p className="text-sm font-bold uppercase tracking-widest text-[var(--teal)]">Contact</p>
        <h1 className="mt-3 text-4xl font-black">Reach the Asmita team</h1>
        <div className="panel mt-8 max-w-3xl p-6 leading-7">
          <p>
            For support questions, partnership requests, or template review coordination, use the
            configured team inbox once the production domain is approved.
          </p>
          <p className="mt-4 font-bold">Draft inbox: support@asmita.in</p>
          <p className="muted mt-4">
            Do not send intimate media files by email. Asmita only needs case references and platform links as text.
          </p>
        </div>
      </section>
    </AppShell>
  );
}
