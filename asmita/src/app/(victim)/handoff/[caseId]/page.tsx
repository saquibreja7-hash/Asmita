import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { findPlatformByDomain, HUMAN_VERIFICATION_REQUIRED } from "@/lib/platforms";
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
              <span className="pill"><span className="dot" />Case not available</span>
              <h1 className="font-display mt-8 text-[36px] font-normal leading-[1.1] tracking-tight md:text-[56px]">
                This case is <em className="not-italic text-gradient">unavailable</em>.
              </h1>
            </div>
          </section>
        </div>
      </AppShell>
    );
  }

  const hashEnabled = process.env.ENABLE_HASH_UPLOAD === "true";
  const hashes = hashEnabled ? await listHashesForCase(caseId) : [];
  const approvedHashes = hashes.filter((h) => h.status === "APPROVED" || h.status === "DISPATCHED");

  const hashSection =
    approvedHashes.length > 0
      ? `\nImage fingerprints (PDQ - for automated detection):\n${approvedHashes
          .map((h) => `• ${h.hashDigest} (quality ${h.quality}/100)`)
          .join("\n")}`
      : "";

  const text = `NCII REMOVAL REQUEST
Case reference: ${record.referenceNumber}

I am the person depicted in this intimate content. It was shared without my consent and I request its immediate removal.${hashSection}

Please process this through your official content removal procedure.`;

  const urlFormLinks = record.urls
    .map((url) => findPlatformByDomain(url.domain))
    .filter((p) => p?.formUrl && p.formUrl !== HUMAN_VERIFICATION_REQUIRED);

  type FormLink = { name: string; formUrl: string };
  let formLinks: FormLink[];

  if (urlFormLinks.length > 0) {
    formLinks = urlFormLinks.map((p) => ({ name: p!.name, formUrl: p!.formUrl! }));
  } else if (queryFormUrl) {
    formLinks = [{ name: queryPlatformName ?? "Platform", formUrl: queryFormUrl }];
  } else {
    formLinks = [];
  }

  const isHashOnlyPath = record.urls.length === 0 && !!queryFormUrl;

  return (
    <AppShell>
      <div className="page-canvas">
        <div className="container py-16 md:py-24">
          <div className="mx-auto max-w-5xl gap-16 md:flex md:items-start">

            {/* LEFT - sticky context */}
            <aside className="mb-12 md:mb-0 md:w-64 md:shrink-0">
              <div className="md:sticky md:top-28">
                <span className="pill">
                  <span className="dot" />
                  {isHashOnlyPath ? "Image fingerprint" : "Guided handoff"}
                </span>

                <p className="font-mono mt-4 text-[13px] text-[var(--muted)]">
                  {record.referenceNumber}
                </p>

                <p className="muted mt-5 text-sm leading-[1.75]">
                  {isHashOnlyPath
                    ? "Your image fingerprint has been recorded. Filling out the platform's own form alongside it significantly improves the chance of removal."
                    : "Asmita doesn't guess platform contacts. When a verified email is unavailable, we hand off to the platform's own form with the notice text ready to paste."}
                </p>

                <div className="mt-8 space-y-4">
                  {[
                    ["Copy the notice text", "Use the read-only box on the right - select all and copy."],
                    ["Open the platform form", "Click the link below the text box to open the form in a new tab."],
                    ["Paste and submit", "Paste the copied text into the form's message field and submit."],
                  ].map(([heading, detail]) => (
                    <div key={heading as string} className="flex items-start gap-3">
                      <span
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--teal-soft)]"
                        aria-hidden
                      >
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4l2.5 2.5L9 1" stroke="var(--teal)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-[var(--foreground)]">{heading}</p>
                        <p className="muted mt-0.5 text-sm leading-[1.65]">{detail}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-8 space-y-2">
                  <Link className="btn btn-primary w-full justify-center" href={`/case/${record.id}`}>
                    Back to dashboard
                  </Link>
                  <Link className="btn btn-secondary w-full justify-center" href="/resources">
                    Support resources
                  </Link>
                </div>
              </div>
            </aside>

            {/* RIGHT - notice text + form links */}
            <div className="min-w-0 flex-1 flex flex-col gap-8">
              <div>
                <h1 className="font-display text-[28px] font-normal leading-[1.2] tracking-tight md:text-[36px]">
                  {isHashOnlyPath
                    ? "Fill the platform's form for better results."
                    : "Use the platform's own form."}
                </h1>
                <p className="muted mt-2 text-sm leading-[1.75]">
                  Copy the notice text below and paste it into the platform's removal form.
                </p>
              </div>

              {/* Notice text */}
              <div className="flex flex-col">
                <label
                  htmlFor="handoff-text"
                  className="block text-sm font-semibold text-[var(--foreground)]"
                >
                  Notice text - read only
                </label>
                <p className="muted mt-1 text-sm">
                  Select all, copy, and paste into the platform form below.
                </p>
                <textarea
                  id="handoff-text"
                  className="field mt-3 font-mono text-[13px] leading-[1.7]"
                  style={{ minHeight: "260px" }}
                  readOnly
                  value={text}
                />
              </div>

              {/* Platform form links */}
              <div>
                <p className="text-sm font-semibold text-[var(--foreground)]">
                  Platform removal form
                </p>
                {formLinks.length > 0 ? (
                  <div className="mt-3 space-y-3">
                    {formLinks.map((link) => (
                      <a
                        key={link.formUrl}
                        href={link.formUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4 transition-colors hover:border-[var(--teal)] hover:bg-[var(--teal-soft)]"
                        style={{ boxShadow: "var(--shadow-soft)" }}
                      >
                        <span className="font-semibold text-[var(--foreground)]">{link.name}</span>
                        <span className="font-mono text-sm text-[var(--teal-dark)]">
                          Open form ↗
                        </span>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
                    <p className="muted text-sm leading-[1.75]">
                      No verified form URL is available for this platform yet. Once the admin team
                      adds one, it will appear here.
                    </p>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </AppShell>
  );
}
