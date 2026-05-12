import { AppShell } from "@/components/layout/AppShell";
import { DeleteAccountForm } from "./DeleteAccountForm";

export default function DeleteAccountPage() {
  return (
    <AppShell>
      <section className="container py-16">
        <p className="text-sm font-bold uppercase tracking-widest text-[var(--rose)]">Account deletion</p>
        <h1 className="mt-3 text-4xl font-black">Delete your Asmita account</h1>
        <DeleteAccountForm />
      </section>
    </AppShell>
  );
}
