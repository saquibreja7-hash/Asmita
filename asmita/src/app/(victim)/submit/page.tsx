import { AppShell } from "@/components/layout/AppShell";
import { SubmitForm } from "./SubmitForm";

export default function SubmitPage() {
  return (
    <AppShell>
      <section className="container py-16">
        <p className="text-sm font-bold uppercase tracking-widest text-[var(--teal)]">URL submission</p>
        <h1 className="mt-3 text-4xl font-black">Paste links. Do not upload content.</h1>
        <p className="muted mt-4 max-w-3xl leading-7">
          Asmita parses domains locally and queues platform-specific next steps. Private IPs,
          localhost, file URLs, and unsupported schemes are rejected.
        </p>
        <SubmitForm />
      </section>
    </AppShell>
  );
}
