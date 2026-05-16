import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import {
  findPlatformByDomain,
  HUMAN_VERIFICATION_REQUIRED,
} from "@/lib/platforms";
import { getCaseForUser } from "@/lib/case-ops";
import { requireSession } from "@/lib/auth/middleware";

export default async function HandoffPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const auth = await requireSession({ adultOnly: true });
  const record = auth.ok ? await getCaseForUser(caseId, auth.session.sub) : null;

  if (!record) {
    return (
      <AppShell>
        <div className="page-canvas">
          <section className="container pb-24 pt-20 text-center md:pb-32 md:pt-32">
            <div className="mx-auto max-w-2xl">
              <span className="pill">
                <span className="dot" />
                Case not available
              </span>
              <h1 className="font-display mt-8 text-[36px] font-normal leading-[1.1] tracking-tight md:text-[56px] md:leading-[1.06]">
                This case is{" "}
                <em className="not-italic text-gradient">unavailable</em>.
              </h1>
            </div>
          </section>
        </div>
      </AppShell>
    );
  }

  const text = `PENDING LEGAL REVIEW
Case reference: ${record.referenceNumber}
Request: Please review the reported non-consensual intimate content complaint through your official takedown process.`;

  const formLinks = record.urls
    .map((url) => findPlatformByDomain(url.domain))
    .filter(
      (platform) =>
        platform?.formUrl && platform.formUrl !== HUMAN_VERIFICATION_REQUIRED
    );

  return (
    <AppShell>
      <div className="page-canvas">
        {/* HEADER */}
        <section className="container pb-10 pt-20 text-center md:pb-14 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              Tier 03 · Guided handoff
            </span>
            <h1 className="font-display mt-8 text-[36px] font-normal leading-[1.1] tracking-tight md:text-[56px] md:leading-[1.06]">
              Use the platform&rsquo;s form,{" "}
              <em className="not-italic text-gradient">together</em>.
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              Asmita does not guess platform contacts. When a verified email
              is unavailable, we hand off to the platform&rsquo;s own form —
              with the notice text ready for you to paste.
            </p>
          </div>
        </section>

        {/* TEXT TO COPY */}
        <section className="container py-10 md:py-14">
          <div className="mx-auto max-w-xl">
            <label
              htmlFor="handoff-text"
              className="font-display text-[18px] leading-[1.3] tracking-tight text-[var(--foreground)]"
            >
              Notice text · read-only
            </label>
            <p className="muted mt-1 text-sm leading-[1.6]">
              Copy this text and paste it into the platform&rsquo;s form below.
            </p>
            <textarea
              id="handoff-text"
              className="field mt-3 min-h-44 font-mono text-[13px] leading-[1.7]"
              readOnly
              value={text}
            />
          </div>
        </section>

        {/* FORM URLS */}
        <section className="container py-10 md:py-14">
          <div className="mx-auto max-w-2xl text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
              Platform form URLs
            </p>
            <h2 className="font-display mt-4 text-[24px] font-normal leading-[1.22] tracking-tight md:text-[32px] md:leading-[1.18]">
              {formLinks.length
                ? "Open each platform in a new tab."
                : "No verified form URL is available yet."}
            </h2>
            {formLinks.length ? (
              <ul className="mx-auto mt-8 max-w-md space-y-3 text-base leading-[1.75]">
                {formLinks.map((platform) => (
                  <li key={platform!.id} className="flex flex-col items-center">
                    <span className="font-display text-[18px] tracking-tight">
                      {platform!.name}
                    </span>
                    <a
                      href={platform!.formUrl ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-underline font-mono text-sm text-[var(--teal-dark)]"
                    >
                      {platform!.formUrl}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted mx-auto mt-6 max-w-lg text-base leading-[1.75]">
                Once a verified form URL is added by the admin team, it will
                appear here.
              </p>
            )}
          </div>
        </section>

        {/* CLOSING */}
        <section className="container pb-24 pt-12 text-center md:pb-32 md:pt-16">
          <div className="flex flex-wrap justify-center gap-3">
            <Link className="btn btn-primary" href={`/case/${record.id}`}>
              Back to dashboard
            </Link>
            <Link className="btn btn-secondary" href="/resources">
              Support resources
            </Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
