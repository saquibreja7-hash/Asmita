import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";

const toc = [
  { num: "01", id: "scope", title: "What this policy covers" },
  { num: "02", id: "who-we-are", title: "Who Asmita is" },
  { num: "03", id: "what-we-collect", title: "What we collect" },
  { num: "04", id: "what-we-never-collect", title: "What we never collect" },
  { num: "05", id: "why-we-collect", title: "Why we collect it" },
  { num: "06", id: "legal-basis", title: "The legal basis we rely on" },
  { num: "07", id: "how-long", title: "How long we keep it" },
  { num: "08", id: "who-we-share-with", title: "Who we share it with" },
  { num: "09", id: "how-we-protect", title: "How we protect it" },
  { num: "10", id: "your-rights", title: "Your rights under the DPDP Act" },
  { num: "11", id: "children", title: "Children and minors" },
  { num: "12", id: "cookies", title: "Cookies and analytics" },
  { num: "13", id: "transfers", title: "Where your data lives" },
  { num: "14", id: "breach", title: "If we ever have a breach" },
  { num: "15", id: "changes", title: "Changes to this policy" },
  { num: "16", id: "contact", title: "Contact and Grievance Officer" },
];

const promises = [
  {
    bold: "We never fetch your URLs.",
    detail:
      "Servers parse the domain string only - they never request the page or its contents.",
  },
  {
    bold: "We never store intimate media.",
    detail:
      "Asmita keeps notice metadata and case records, not the content the case is about.",
  },
  {
    bold: "We never share without you.",
    detail:
      "No third party sees your case unless you explicitly route it there, or unless compelled by a court of law.",
  },
];

export default function PrivacyPage() {
  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="container pb-16 pt-20 text-center md:pb-20 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              Privacy policy
            </span>
            <h1 className="font-display mt-8 text-[40px] font-normal leading-[1.08] tracking-tight md:text-[68px] md:leading-[1.06]">
              Privacy is the{" "}
              <em className="not-italic text-gradient">architecture</em>.
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              What Asmita collects, why, how long we keep it, who can see it,
              and what rights you have - in plain language.
            </p>
            <p className="font-mono mt-6 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
              Last updated · 17 May 2026 · Version 0.4 · Draft for legal review
            </p>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* TL;DR - three promise cards */}
        <section className="container py-14 md:py-20">
          <div className="mx-auto max-w-3xl">
            <span className="eyebrow mb-4 block">The short version</span>
            <h2 className="font-display text-[28px] font-normal leading-[1.2] tracking-tight md:text-[44px] md:leading-[1.14]">
              Three promises that shape everything below.
            </h2>
            <ul className="mt-10 space-y-4">
              {promises.map(({ bold, detail }) => (
                <li
                  key={bold}
                  className="flex items-start gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 py-5"
                  style={{ boxShadow: "var(--shadow-soft)" }}
                >
                  <span
                    className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--teal-soft)]"
                    aria-hidden
                  >
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path
                        d="M1 4l2.5 2.5L9 1"
                        stroke="var(--teal)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <p className="text-base leading-[1.7] md:text-[17px]">
                    <span className="font-semibold text-[var(--foreground)]">{bold}</span>{" "}
                    <span className="text-[var(--muted)]">{detail}</span>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* TWO-COLUMN: sticky sidebar ToC + scrollable content */}
        <div className="container py-14 md:py-20">
          <div className="mx-auto max-w-5xl">
            <div className="gap-16 md:flex md:items-start">

              {/* SIDEBAR - sticky ToC */}
              <aside className="mb-12 md:mb-0 md:w-56 md:shrink-0">
                <div className="md:sticky md:top-24">
                  <p className="eyebrow mb-4 block">Contents</p>
                  <nav aria-label="Privacy policy sections">
                    <ol className="space-y-1">
                      {toc.map((s) => (
                        <li key={s.id}>
                          <a
                            href={`#${s.id}`}
                            className="flex items-baseline gap-2 rounded-md px-2 py-1 text-sm text-[var(--muted)] transition-colors hover:bg-[var(--teal-soft)] hover:text-[var(--teal-dark)]"
                          >
                            <span className="font-mono text-[10px] shrink-0 tabular-nums opacity-60">
                              {s.num}
                            </span>
                            <span className="leading-[1.5]">{s.title}</span>
                          </a>
                        </li>
                      ))}
                    </ol>
                  </nav>
                </div>
              </aside>

              {/* MAIN CONTENT */}
              <div className="min-w-0 flex-1 space-y-0">
                <PolicySection num="01" id="scope" title="What this policy covers">
                  <p>
                    This policy applies to the Asmita platform - the website you are
                    reading now, the case dashboard you sign in to with an email
                    one-time-code, and any notices, evidence packages, or
                    correspondence the platform produces on your behalf.
                  </p>
                  <p>
                    It does not cover the websites of any platform Asmita sends a
                    takedown notice to, the cybercrime portal at cybercrime.gov.in,
                    the Grievance Officers we email, or any third-party service you
                    visit from a link in our pages. Those services have their own
                    privacy policies.
                  </p>
                </PolicySection>

                <PolicySection num="02" id="who-we-are" title="Who Asmita is">
                  <p>
                    Asmita (अस्मिता) is a free, India-specific platform built to help
                    women remove non-consensual intimate content from the internet. It
                    operates as a privacy-first notice and tracking service under the
                    framework of the IT Rules 2021 and the Digital Personal Data
                    Protection Act, 2023.
                  </p>
                  <p>
                    Asmita is currently in a pre-launch phase. The legal entity that
                    will operate the production service, and the registered office
                    address, will be published at this section before public launch.
                    For the time being, all enquiries should be sent to the Grievance
                    Officer email listed in section 16.
                  </p>
                </PolicySection>

                <PolicySection num="03" id="what-we-collect" title="What we collect">
                  <p>
                    The data Asmita stores can be divided into five categories. None
                    of it is collected for marketing, profiling, or sale.
                  </p>
                  <ul className="mt-4 space-y-3">
                    {[
                      ["Account data.", "Your email address (used only to send one-time login codes), and the timestamp of each sign-in. Asmita does not store passwords because Asmita does not use passwords."],
                      ["Case data.", "The URLs you submit (as text strings), the platform name detected from each URL, the digital declaration you sign when you create a case, and any notes you choose to add to the case. URLs are stored encrypted at rest."],
                      ["Notice and response data.", "The text of the takedown notices we send on your behalf, the timestamps of each delivery attempt, and the contents of any reply the platform sends to our handling address."],
                      ["Operational logs.", "Limited server logs that record IP address, user-agent, request path, status code, and timestamp - used for abuse detection and security incident review. These are kept for 30 days and then automatically purged."],
                    ].map(([bold, detail]) => (
                      <li key={bold as string}>
                        <span className="font-semibold text-[var(--foreground)]">{bold}</span>{" "}
                        {detail}
                      </li>
                    ))}
                  </ul>
                </PolicySection>

                <PolicySection num="04" id="what-we-never-collect" title="What we never collect">
                  <p>
                    Some things Asmita refuses to collect by design - meaning the
                    architecture would have to be re-built before it could ever start
                    collecting them.
                  </p>
                  <ul className="mt-4 space-y-3">
                    {[
                      ["The intimate content itself.", "We do not request, fetch, render, download, proxy, cache, hash, thumbnail, transcode, or otherwise interact with the media behind any URL you share. URLs are opaque text tokens. A network-level monitor blocks outbound requests to any submitted URL host as a defence in depth."],
                      ["Passwords or biometric templates.", "Authentication is by email one-time code only."],
                      ["Aadhaar, PAN, or any government ID.", "Asmita does not collect, request, or accept Aadhaar offline-XML bundles, PAN cards, or any other government identity document. The email you sign in with is the verified identity tied to your case."],
                      ["Tracking pixels, advertising identifiers, or cross-site cookies.", "See section 12."],
                    ].map(([bold, detail]) => (
                      <li key={bold as string}>
                        <span className="font-semibold text-[var(--foreground)]">{bold}</span>{" "}
                        {detail}
                      </li>
                    ))}
                  </ul>
                </PolicySection>

                <PolicySection num="05" id="why-we-collect" title="Why we collect it">
                  <p>
                    Each piece of data exists because a specific feature would not
                    work without it.
                  </p>
                  <ul className="mt-4 space-y-3">
                    {[
                      ["Email address -", "to authenticate you (one-time codes), to send case status updates, and to receive replies from platforms on your behalf."],
                      ["URL strings -", "to identify which platform each notice is addressed to, to compose the notice, and to record what was sent for your audit trail."],
                      ["Declaration text -", "to satisfy the legal requirement that the person filing the notice declares ownership of the rights, under penalty of law."],
                      ["Operational logs -", "to detect abuse of the platform, to investigate security incidents, and to meet auditability requirements."],
                    ].map(([bold, detail]) => (
                      <li key={bold as string}>
                        <span className="font-semibold text-[var(--foreground)]">{bold}</span>{" "}
                        {detail}
                      </li>
                    ))}
                  </ul>
                </PolicySection>

                <PolicySection num="06" id="legal-basis" title="The legal basis we rely on">
                  <p>
                    Under the Digital Personal Data Protection Act, 2023 (&ldquo;DPDP
                    Act&rdquo;), Asmita processes your data on the basis of your{" "}
                    <span className="font-semibold text-[var(--foreground)]">explicit consent</span>,
                    which you give at registration and again at the point of each case
                    creation. The consent is purpose-specific - agreeing to create a
                    case does not consent to anything outside of preparing and routing
                    the takedown notice you ask for.
                  </p>
                  <p>
                    For the limited operational logs described in section 3, Asmita
                    relies on{" "}
                    <span className="font-semibold text-[var(--foreground)]">legitimate use</span>{" "}
                    under Section 7 of the DPDP Act, restricted to security and abuse
                    prevention. These logs are not used for any other purpose.
                  </p>
                </PolicySection>

                <PolicySection num="07" id="how-long" title="How long we keep it">
                  <p>
                    The retention schedule below is enforced by automated jobs. Times
                    are measured from the date the relevant event ends (case
                    resolution, account deletion, log creation).
                  </p>
                  <ul className="mt-4 space-y-3">
                    {[
                      ["Active case data:", "kept while the case is open and for 90 days after resolution, so you have time to download your audit trail and FIR package."],
                      ["Account data:", "kept until you delete your account."],
                      ["Account deletion:", "soft delete is immediate. A scheduled job permanently erases the account and all linked case data 30 days after soft delete, unless you have an open legal hold."],
                      ["Operational logs:", "30 days, then auto-purged."],
                      ["Notice templates and audit metadata (anonymised):", "kept indefinitely for platform-response statistics and accountability reporting. These contain no personal data."],
                    ].map(([bold, detail]) => (
                      <li key={bold as string}>
                        <span className="font-semibold text-[var(--foreground)]">{bold}</span>{" "}
                        {detail}
                      </li>
                    ))}
                  </ul>
                </PolicySection>

                <PolicySection num="08" id="who-we-share-with" title="Who we share it with">
                  <p>
                    Asmita shares your data only in the narrow circumstances listed
                    below. We do not sell data. We do not exchange data with
                    advertisers, data brokers, or social-media platforms outside the
                    takedown notice itself.
                  </p>
                  <ul className="mt-4 space-y-3">
                    {[
                      ["Platforms, when you send a notice.", "The notice contains the URLs you submitted, the platform name, your declaration text, and the contact email you authorised. Nothing else."],
                      ["Government bodies, only when compelled.", "We disclose data to a law-enforcement agency only on receipt of a valid order under Indian law. We will attempt to notify you unless legally prohibited."],
                      ["NGO partners, only when you ask.", "If you choose to vouch through an NGO partner, the NGO sees only what you authorise it to see for that vouching action."],
                      ["Infrastructure providers, under contract.", "Asmita uses managed infrastructure for database, email delivery, and hosting. These providers process data under written agreements."],
                    ].map(([bold, detail]) => (
                      <li key={bold as string}>
                        <span className="font-semibold text-[var(--foreground)]">{bold}</span>{" "}
                        {detail}
                      </li>
                    ))}
                  </ul>
                </PolicySection>

                <PolicySection num="09" id="how-we-protect" title="How we protect it">
                  <p>
                    Security is a stack of overlapping controls. None of them is
                    perfect alone; together they make compromise expensive.
                  </p>
                  <ul className="mt-4 space-y-3">
                    {[
                      ["Encryption.", "All data at rest is encrypted at the disk layer. Sensitive fields - submitted URLs, declaration text - are also encrypted at the application layer with per-case keys."],
                      ["Network isolation.", "Application servers run inside a private network with no outbound access except for the specific platform endpoints needed for notice delivery."],
                      ["Authentication.", "Email one-time codes only, with rate limits on requests and on URL submissions (10 URLs per 24 hours per account)."],
                      ["CSRF and session integrity.", "All state-changing requests are CSRF-protected. Session cookies are HTTP-only, Secure, and SameSite-Lax."],
                      ["Audit logging.", "Every access to sensitive data by an administrator is recorded in an append-only security event log."],
                      ["No-fetch monitor.", "A live integrity check verifies that the application does not make outbound HTTP requests to user-submitted URLs. If it ever did, alerting fires immediately."],
                    ].map(([bold, detail]) => (
                      <li key={bold as string}>
                        <span className="font-semibold text-[var(--foreground)]">{bold}</span>{" "}
                        {detail}
                      </li>
                    ))}
                  </ul>
                </PolicySection>

                <PolicySection num="10" id="your-rights" title="Your rights under the DPDP Act">
                  <p>
                    The Digital Personal Data Protection Act, 2023 gives you a set of
                    rights over your own data. Asmita honours each of them without
                    charge.
                  </p>
                  <ul className="mt-4 space-y-3">
                    {[
                      ["Right to access.", "You can download every piece of data we hold about you, at any time, from your case dashboard."],
                      ["Right to correction.", "You can edit your email address, declaration text, and any free-text fields in your case. URL submissions can be withdrawn but not edited (so the audit trail stays sound)."],
                      ["Right to erasure.", "You can delete your account at any time. After a 30-day soft-delete window - during which you can restore - the data is permanently erased."],
                      ["Right to grievance redressal.", "You can write to the Grievance Officer listed in section 16. We acknowledge every grievance within 72 hours and resolve or escalate within 14 days."],
                      ["Right to nominate.", "You can nominate another person to exercise these rights on your behalf in case of incapacity or death. Contact the Grievance Officer to set this up."],
                    ].map(([bold, detail]) => (
                      <li key={bold as string}>
                        <span className="font-semibold text-[var(--foreground)]">{bold}</span>{" "}
                        {detail}
                      </li>
                    ))}
                  </ul>
                </PolicySection>

                <PolicySection num="11" id="children" title="Children and minors">
                  <p>
                    Asmita does not knowingly collect any personal data from a person
                    under the age of 18. The age attestation at the start of every
                    case flow routes anyone who indicates they are under 18 away from
                    URL submission and into a curated set of child-safety resources,
                    including CHILDLINE 1098, TakeItDown (NCMEC), and
                    cybercrime.gov.in.
                  </p>
                  <p>
                    If we learn that we have collected data from a minor through an
                    inaccurate attestation, that data is deleted immediately and the
                    case account is closed. Concerned parents or guardians can write
                    to the Grievance Officer.
                  </p>
                </PolicySection>

                <PolicySection num="12" id="cookies" title="Cookies and analytics">
                  <p>
                    Asmita uses two cookies, both strictly functional: a session
                    cookie that keeps you signed in, and a language-preference cookie
                    that remembers whether you chose English or Hindi. No third-party
                    advertising, marketing, or tracking cookies are set by Asmita.
                  </p>
                  <p>
                    Asmita does not use Google Analytics, Facebook Pixel, or any
                    equivalent third-party analytics suite. Aggregate
                    platform-response statistics are computed from internal logs that
                    contain no personal data.
                  </p>
                </PolicySection>

                <PolicySection num="13" id="transfers" title="Where your data lives">
                  <p>
                    Asmita is built for India. All personal data is stored on servers
                    physically located in India. The list of sub-processors is
                    maintained in our public sub-processor register and updated
                    whenever the list changes.
                  </p>
                  <p>
                    We do not transfer your data outside India, except where a
                    specific platform you have asked us to send a notice to is located
                    outside India - in which case the notice itself (and only the
                    notice) crosses the border.
                  </p>
                </PolicySection>

                <PolicySection num="14" id="breach" title="If we ever have a breach">
                  <p>
                    If a personal-data breach occurs that is likely to result in risk
                    to you, we will notify the Data Protection Board of India and the
                    affected users without undue delay, in accordance with the DPDP
                    Act. The notification will include the nature of the breach, the
                    data affected, the likely consequences, and the steps we have
                    taken to contain it.
                  </p>
                  <p>
                    Even when not legally required, we will notify you of any incident
                    that affected your case data.
                  </p>
                </PolicySection>

                <PolicySection num="15" id="changes" title="Changes to this policy">
                  <p>
                    We will post any change to this policy at this URL, with a new
                    &ldquo;Last updated&rdquo; date at the top. For material changes
                    - anything that expands what we collect, broadens with whom we
                    share, or lengthens retention - we will give you at least 30
                    days&rsquo; advance notice by email before the change takes
                    effect.
                  </p>
                </PolicySection>

                <PolicySection num="16" id="contact" title="Contact and Grievance Officer">
                  <p>
                    The Grievance Officer is the named human responsible for replying
                    to your privacy questions and grievances. The
                    production-launch contact will be added to this section before
                    public launch.
                  </p>
                  <p>
                    For now, please write to{" "}
                    <a
                      href="mailto:grievance@meriasmita.org"
                      className="link-underline text-[var(--foreground)]"
                    >
                      grievance@meriasmita.org
                    </a>{" "}
                    with the subject line &ldquo;Privacy grievance&rdquo;, or use the{" "}
                    <Link href="/contact" className="link-underline text-[var(--foreground)]">
                      contact page
                    </Link>
                    .
                  </p>
                  <p>
                    Notice templates and policy posture have been reviewed informally
                    with Internet Freedom Foundation and SFLC.in. A full legal opinion
                    is on file and will be linked here at production launch.
                  </p>
                </PolicySection>
              </div>
            </div>
          </div>
        </div>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* CLOSING */}
        <section className="container pb-24 pt-20 text-center md:pb-32 md:pt-28">
          <div className="mx-auto max-w-2xl">
            <h2 className="font-display text-[32px] font-normal leading-[1.15] tracking-tight md:text-[52px] md:leading-[1.12]">
              Privacy is the architecture.
            </h2>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.75] md:text-lg">
              If anything on this page is unclear, write to us. We will answer
              in English or Hindi - whichever is easier for you.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link className="btn btn-primary" href="/contact">
                Contact Asmita
              </Link>
              <Link className="btn btn-secondary" href="/start">
                Start a case
              </Link>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function PolicySection({
  num,
  id,
  title,
  children,
}: {
  num: string;
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-[var(--hairline)] py-10 first:border-t-0 first:pt-0">
      <div className="flex items-baseline gap-3 mb-5">
        <span className="font-mono text-[10px] tabular-nums text-[var(--muted)] opacity-60 shrink-0">
          {num}
        </span>
        <h2 className="font-display text-[20px] font-normal leading-[1.25] tracking-tight md:text-[26px] md:leading-[1.2]">
          {title}
        </h2>
      </div>
      <div className="muted space-y-4 text-[15px] leading-[1.8] md:text-[16px]">
        {children}
      </div>
    </section>
  );
}
