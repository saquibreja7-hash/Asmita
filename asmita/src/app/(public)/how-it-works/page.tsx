import { AppShell } from "@/components/layout/AppShell";

export default function HowItWorksPage() {
  return (
    <AppShell>
      <section className="container py-16">
        <h1 className="text-4xl font-black">How Asmita works</h1>
        <div className="mt-8 grid gap-5">
          {[
            ["Tier 1", "Major Indian platforms are routed first when their verified process exists."],
            ["Tier 2", "Platforms without API access use legally reviewed email notices after human contact verification."],
            ["Tier 3", "When contact details are missing, Asmita prepares a guided form handoff instead of guessing."],
          ].map(([title, body]) => (
            <article className="panel p-6" key={title}>
              <h2 className="text-2xl font-black">{title}</h2>
              <p className="muted mt-3 leading-7">{body}</p>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
