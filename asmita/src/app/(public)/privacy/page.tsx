import { AppShell } from "@/components/layout/AppShell";

export default function PrivacyPage() {
  return (
    <AppShell>
      <section className="container py-16">
        <h1 className="text-4xl font-black">Privacy policy</h1>
        <div className="panel mt-8 max-w-3xl space-y-5 p-6 leading-7">
          <p>Asmita stores only the minimum data needed to create and track a case.</p>
          <p>Submitted URLs are parsed locally as text. The app never fetches, previews, stores, or downloads content from those links.</p>
          <p>Personal identifiers are encrypted or hashed. Case references are designed to avoid exposing sensitive context in email.</p>
          <p>Account deletion is implemented as soft deletion followed by a scheduled hard delete job in production.</p>
        </div>
      </section>
    </AppShell>
  );
}
