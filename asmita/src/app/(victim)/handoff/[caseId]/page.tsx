import { AppShell } from "@/components/layout/AppShell";
import { findPlatformByDomain, HUMAN_VERIFICATION_REQUIRED } from "@/lib/platforms";
import { cases, ensureDemoCase } from "@/lib/store";

export default async function HandoffPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const record = cases.get(caseId) || ensureDemoCase();
  const text = `PENDING LEGAL REVIEW\nCase reference: ${record.referenceNumber}\nRequest: Please review the reported non-consensual intimate content complaint through your official takedown process.`;
  const formLinks = record.urls
    .map((url) => findPlatformByDomain(url.domain))
    .filter((platform) => platform?.formUrl && platform.formUrl !== HUMAN_VERIFICATION_REQUIRED);

  return (
    <AppShell>
      <section className="container py-16">
        <p className="text-sm font-bold uppercase tracking-widest text-[var(--teal)]">Tier 3 handoff</p>
        <h1 className="mt-3 text-4xl font-black">Use the platform form when email contacts are not verified.</h1>
        <div className="panel mt-8 max-w-3xl p-6">
          <p className="muted leading-7">
            Asmita does not guess platform contacts. When a verified email is unavailable, use this
            reviewed-by-human handoff flow and paste only approved text into the platform form.
          </p>
          <textarea className="field mt-5 min-h-44 font-mono text-sm" readOnly value={text} />
          <div className="mt-5 rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-sm font-bold">Platform form URLs</p>
            {formLinks.length ? (
              <ul className="mt-3 grid gap-2 text-sm">
                {formLinks.map((platform) => (
                  <li key={platform!.id}>
                    {platform!.name}: {platform!.formUrl}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-[var(--muted)]">
                No verified platform-specific form URL is available for this case yet.
              </p>
            )}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
