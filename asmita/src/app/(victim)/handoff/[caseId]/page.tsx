import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import {
  findPlatformByDomain,
  HUMAN_VERIFICATION_REQUIRED,
} from "@/lib/platforms";
import { getCaseForUser } from "@/lib/case-ops";
import { requireSession } from "@/lib/auth/middleware";
import { listHashesForCase } from "@/lib/hash-submission";

export default async function HandoffPage({
  params,
  searchParams,
}: {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<{ formUrl?: string; platformName?: string }>;
}) {
  const { caseId } = await params;
  const { formUrl: queryFormUrl, platformName: queryPlatformName } = await searchParams;

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

  // Fetch APPROVED hashes if hash upload is enabled — used in copy-paste text
  // and surfaced on the handoff page for FORM_ONLY platforms.
  const hashEnabled = process.env.ENABLE_HASH_UPLOAD === "true";
  const hashes = hashEnabled ? await listHashesForCase(caseId) : [];
  const approvedHashes = hashes.filter((h) => h.status === "APPROVED" || h.status === "DISPATCHED");

  const hashSection =
    approvedHashes.length > 0
      ? `\nImage fingerprints (PDQ — for automated detection):\n${approvedHashes
          .map((h) => `• ${h.hashDigest} (quality ${h.quality}/100)`)
          .join("\n")}`
      : "";

  const text = `NCII REMOVAL REQUEST
Case reference: ${record.referenceNumber}

I am the person depicted in this intimate content. It was shared without my consent and I request its immediate removal.${hashSection}

Please process this through your official content removal procedure.`;

  // Form links: prefer URL-derived links; fall back to query params (hash-only path).
  const urlFormLinks = record.urls
    .map((url) => findPlatformByDomain(url.domain))
    .filter(
      (platform) =>
        platform?.formUrl && platform.formUrl !== HUMAN_VERIFICATION_REQUIRED,
    );

  type FormLink = { name: string; formUrl: string };
  let formLinks: FormLink[];

  if (urlFormLinks.length > 0) {
    formLinks = urlFormLinks.map((p) => ({ name: p!.name, formUrl: p!.formUrl! }));
  } else if (queryFormUrl) {
    formLinks = [{ name: queryPlatformName ?? "Platform", formUrl: queryFormUrl }];
  } else {
    formLinks = [];
  }

  // Is this arrival via the hash-only path?
  const isHashOnlyPath = record.urls.length === 0 && !!queryFormUrl;

  return (
    <AppShell>
      <div className="page-canvas">
        {/* HEADER */}
        <section className="container pb-10 pt-20 text-center md:pb-14 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              {isHashOnlyPath ? "Tier 02 · Image fingerprint" : "Tier 03 · Guided handoff"}
            </span>
            <h1 className="font-display mt-8 text-[36px] font-normal leading-[1.1] tracking-tight md:text-[56px] md:leading-[1.06]">
              {isHashOnlyPath
                ? <>Fill the platform&rsquo;s form for <em className="not-italic text-gradient">better results</em>.</>
                : <>Use the platform&rsquo;s form, <em className="not-italic text-gradient">together</em>.</>}
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              {isHashOnlyPath
                ? "Your image fingerprint has been recorded. Filling out the platform's own form alongside it significantly improves the chance of removal."
                : "Asmita does not guess platform contacts. When a verified email is unavailable, we hand off to the platform’s own form — with the notice text ready for you to paste."}
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
              Platform form
            </p>
            <h2 className="font-display mt-4 text-[24px] font-normal leading-[1.22] tracking-tight md:text-[32px] md:leading-[1.18]">
              {formLinks.length
                ? "Open the form in a new tab."
                : "No verified form URL is available yet."}
            </h2>
            {formLinks.length ? (
              <ul className="mx-auto mt-8 max-w-md space-y-3 text-base leading-[1.75]">
                {formLinks.map((link) => (
                  <li key={link.formUrl} className="flex flex-col items-center">
                    <span className="font-display text-[18px] tracking-tight">
                      {link.name}
                    </span>
                    <a
                      href={link.formUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-underline font-mono text-sm text-[var(--teal-dark)]"
                    >
                      Open removal form &rarr;
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
