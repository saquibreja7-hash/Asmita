import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";

type Section = {
  num: string;
  id: string;
  title: string;
};

const toc: Section[] = [
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

export default function PrivacyPage() {
  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="container pb-12 pt-20 text-center md:pb-16 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              Privacy policy
            </span>
            <p className="muted mt-3 text-xs tracking-wide">
              Available in English and <span lang="hi">हिंदी</span>
            </p>
            <h1 className="font-display mt-8 text-[40px] font-normal leading-[1.08] tracking-tight md:text-[68px] md:leading-[1.06]">
              Privacy is the
              <br />
              <em className="not-italic text-gradient">architecture</em>.
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              This policy explains exactly what Asmita collects, why, how long
              we keep it, who can see it, and what rights you have over your
              own data - in plain language.
            </p>
            <p className="font-mono mt-8 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
              Last updated · 17 May 2026 · Version 0.4 · Draft for legal review
            </p>
          </div>
        </section>

        {/* TL;DR - three quiet promises */}
        <section className="container py-14 text-center md:py-20">
          <div className="mx-auto max-w-2xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
              The short version
            </p>
            <h2 className="font-display mt-4 text-[28px] font-normal leading-[1.18] tracking-tight md:text-[44px] md:leading-[1.14]">
              Three promises that shape everything below.
            </h2>
            <ul className="muted mx-auto mt-8 max-w-md space-y-3 text-base leading-[1.75] md:text-lg">
              <li>
                <span className="font-semibold text-[var(--foreground)]">
                  We never fetch your URLs.
                </span>{" "}
                Servers parse the domain string only - they never request the
                page or its contents.
              </li>
              <li>
                <span className="font-semibold text-[var(--foreground)]">
                  We never store intimate media.
                </span>{" "}
                Asmita keeps notice metadata and case records, not the
                content the case is about.
              </li>
              <li>
                <span className="font-semibold text-[var(--foreground)]">
                  We never share without you.
                </span>{" "}
                No third party sees your case unless you explicitly route it
                there, or unless we are compelled by a court of law.
              </li>
            </ul>
          </div>
        </section>

        {/* TABLE OF CONTENTS - quiet anchor list */}
        <section className="container py-14 md:py-20">
          <div className="mx-auto max-w-2xl">
            <p className="font-mono text-center text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
              Contents
            </p>
            <ol className="mt-6 space-y-2 text-base leading-[1.8] md:text-lg">
              {toc.map((s) => (
                <li key={s.id} className="flex gap-4">
                  <span className="font-mono text-[12px] tracking-wide text-[var(--muted)] tabular-nums pt-[6px] w-8 shrink-0">
                    {s.num}
                  </span>
                  <Link
                    href={`#${s.id}`}
                    className="link-underline text-[var(--foreground)]"
                  >
                    {s.title}
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* SECTION 01 - Scope */}
        <Section num="01" id="scope" title="What this policy covers">
          <p>
            This policy applies to the Asmita platform - the website you are
            reading now, the case dashboard you sign in to with an email
            one-time-code, and any notices, evidence packages, or
            correspondence the platform produces on your behalf.
          </p>
          <p>
            It does not cover the websites of any platform Asmita sends a
            takedown notice to, the cybercrime portal at
            cybercrime.gov.in, the Grievance Officers we email, or any
            third-party service you visit from a link in our pages. Those
            services have their own privacy policies.
          </p>
        </Section>

        {/* SECTION 02 - Who we are */}
        <Section num="02" id="who-we-are" title="Who Asmita is">
          <p>
            Asmita (अस्मिता) is a free, India-specific platform built to
            help women remove non-consensual intimate content from the
            internet. It operates as a privacy-first notice and tracking
            service under the framework of the IT Rules 2021 and the
            Digital Personal Data Protection Act, 2023.
          </p>
          <p>
            Asmita is currently in a pre-launch phase. The legal entity that
            will operate the production service, and the registered office
            address, will be published at this section before public
            launch. For the time being, all enquiries should be sent to the
            Grievance Officer email listed in section 16.
          </p>
        </Section>

        {/* SECTION 03 - What we collect */}
        <Section num="03" id="what-we-collect" title="What we collect">
          <p>
            The data Asmita stores can be divided into five categories.
            None of it is collected for marketing, profiling, or sale.
          </p>
          <ul className="mt-6 space-y-4">
            <li>
              <span className="font-semibold text-[var(--foreground)]">
                Account data.
              </span>{" "}
              Your email address (used only to send one-time login codes),
              and the timestamp of each sign-in. Asmita does not store
              passwords because Asmita does not use passwords.
            </li>
            <li>
              <span className="font-semibold text-[var(--foreground)]">
                Case data.
              </span>{" "}
              The URLs you submit (as text strings), the platform name
              detected from each URL, the digital declaration you sign
              when you create a case, and any notes you choose to add to
              the case. URLs are stored encrypted at rest.
            </li>
            <li>
              <span className="font-semibold text-[var(--foreground)]">
                Notice and response data.
              </span>{" "}
              The text of the takedown notices we send on your behalf,
              the timestamps of each delivery attempt, and the contents
              of any reply the platform sends to our handling address.
            </li>
            <li>
              <span className="font-semibold text-[var(--foreground)]">
                Operational logs.
              </span>{" "}
              Limited server logs that record IP address, user-agent,
              request path, status code, and timestamp - used for abuse
              detection and security incident review. These are kept for
              30 days and then automatically purged.
            </li>
          </ul>
        </Section>

        {/* SECTION 04 - What we never collect */}
        <Section
          num="04"
          id="what-we-never-collect"
          title="What we never collect"
        >
          <p>
            Some things Asmita refuses to collect by design - meaning
            the architecture would have to be re-built before it could
            ever start collecting them.
          </p>
          <ul className="mt-6 space-y-4">
            <li>
              <span className="font-semibold text-[var(--foreground)]">
                The intimate content itself.
              </span>{" "}
              We do not request, fetch, render, download, proxy, cache,
              hash, thumbnail, transcode, or otherwise interact with the
              media behind any URL you share. URLs are opaque text
              tokens. A network-level monitor blocks outbound requests to
              any submitted URL host as a defence in depth.
            </li>
            <li>
              <span className="font-semibold text-[var(--foreground)]">
                Passwords or biometric templates.
              </span>{" "}
              Authentication is by email one-time code only.
            </li>
            <li>
              <span className="font-semibold text-[var(--foreground)]">
                Aadhaar, PAN, or any government ID.
              </span>{" "}
              Asmita does not collect, request, or accept Aadhaar
              offline-XML bundles, PAN cards, or any other government
              identity document. The email you sign in with is the
              verified identity tied to your case.
            </li>
            <li>
              <span className="font-semibold text-[var(--foreground)]">
                Tracking pixels, advertising identifiers, or cross-site
                cookies.
              </span>{" "}
              See section 12.
            </li>
          </ul>
        </Section>

        {/* SECTION 05 - Why we collect */}
        <Section num="05" id="why-we-collect" title="Why we collect it">
          <p>
            Each piece of data exists because a specific feature would
            not work without it. We list the purposes explicitly so you
            can hold us to them.
          </p>
          <ul className="mt-6 space-y-3">
            <li>
              <span className="font-semibold text-[var(--foreground)]">
                Email address -
              </span>{" "}
              to authenticate you (one-time codes), to send case status
              updates, and to receive replies from platforms on your
              behalf.
            </li>
            <li>
              <span className="font-semibold text-[var(--foreground)]">
                URL strings -
              </span>{" "}
              to identify which platform each notice is addressed to,
              to compose the notice, and to record what was sent for
              your audit trail.
            </li>
            <li>
              <span className="font-semibold text-[var(--foreground)]">
                Declaration text -
              </span>{" "}
              to satisfy the legal requirement that the person filing
              the notice declares ownership of the rights, under
              penalty of law.
            </li>
            <li>
              <span className="font-semibold text-[var(--foreground)]">
                Operational logs -
              </span>{" "}
              to detect abuse of the platform, to investigate security
              incidents, and to meet auditability requirements.
            </li>
          </ul>
        </Section>

        {/* SECTION 06 - Legal basis */}
        <Section num="06" id="legal-basis" title="The legal basis we rely on">
          <p>
            Under the Digital Personal Data Protection Act, 2023
            (&ldquo;DPDP Act&rdquo;), Asmita processes your data on the basis
            of your <span className="font-semibold text-[var(--foreground)]">explicit consent</span>,
            which you give at registration and again at the point of each
            case creation. The consent is purpose-specific - agreeing to
            create a case does not consent to anything outside of preparing
            and routing the takedown notice you ask for.
          </p>
          <p>
            For the limited operational logs described in section 3, Asmita
            relies on{" "}
            <span className="font-semibold text-[var(--foreground)]">
              legitimate use
            </span>{" "}
            under Section 7 of the DPDP Act, restricted to security and abuse
            prevention. These logs are not used for any other purpose.
          </p>
        </Section>

        {/* SECTION 07 - Retention */}
        <Section num="07" id="how-long" title="How long we keep it">
          <p>
            The retention schedule below is enforced by automated jobs.
            Times are measured from the date the relevant event ends
            (case resolution, account deletion, log creation).
          </p>
          <ul className="mt-6 space-y-3">
            <li>
              <span className="font-semibold text-[var(--foreground)]">
                Active case data:
              </span>{" "}
              kept while the case is open and for 90 days after the
              case is resolved or closed, so you have time to download
              your audit trail and FIR package.
            </li>
            <li>
              <span className="font-semibold text-[var(--foreground)]">
                Account data:
              </span>{" "}
              kept until you delete your account.
            </li>
            <li>
              <span className="font-semibold text-[var(--foreground)]">
                Account deletion:
              </span>{" "}
              soft delete is immediate. A scheduled job permanently
              erases the account and all linked case data 30 days after
              soft delete, unless you have an open legal hold.
            </li>
            <li>
              <span className="font-semibold text-[var(--foreground)]">
                Operational logs:
              </span>{" "}
              30 days, then auto-purged.
            </li>
            <li>
              <span className="font-semibold text-[var(--foreground)]">
                Notice templates and audit metadata (anonymised):
              </span>{" "}
              kept indefinitely for the purpose of platform-response
              statistics and accountability reporting. These contain
              no personal data.
            </li>
          </ul>
        </Section>

        {/* SECTION 08 - Sharing */}
        <Section num="08" id="who-we-share-with" title="Who we share it with">
          <p>
            Asmita shares your data only in the narrow circumstances
            listed below. We do not sell data. We do not exchange data
            with advertisers, data brokers, or social-media platforms
            outside the takedown notice itself.
          </p>
          <ul className="mt-6 space-y-3">
            <li>
              <span className="font-semibold text-[var(--foreground)]">
                Platforms, when you send a notice.
              </span>{" "}
              The notice we send on your behalf contains the URLs you
              submitted, the platform name, your declaration text, and
              the contact email you authorised the platform to reply
              to. Nothing else.
            </li>
            <li>
              <span className="font-semibold text-[var(--foreground)]">
                Government bodies, only when compelled.
              </span>{" "}
              We disclose data to a law-enforcement agency only on
              receipt of a valid order under Indian law. We will
              attempt to notify you of any such order unless we are
              legally prohibited from doing so.
            </li>
            <li>
              <span className="font-semibold text-[var(--foreground)]">
                NGO partners, only when you ask.
              </span>{" "}
              If you choose to vouch through an NGO partner (for
              example, where a survivor cannot reasonably attest
              independently), the NGO sees only what you authorise it
              to see for that vouching action.
            </li>
            <li>
              <span className="font-semibold text-[var(--foreground)]">
                Infrastructure providers, under contract.
              </span>{" "}
              Asmita uses managed infrastructure for database, email
              delivery, and hosting. These providers process data
              under written agreements that bind them to use it only
              for providing the service to Asmita.
            </li>
          </ul>
        </Section>

        {/* SECTION 09 - Security */}
        <Section num="09" id="how-we-protect" title="How we protect it">
          <p>
            Security is a stack of overlapping controls. None of them
            is perfect alone; together they make compromise expensive.
          </p>
          <ul className="mt-6 space-y-3">
            <li>
              <span className="font-semibold text-[var(--foreground)]">
                Encryption.
              </span>{" "}
              All data at rest is encrypted at the disk layer. Sensitive
              fields - submitted URLs, declaration text, KYC bundles -
              are also encrypted at the application layer with per-case
              keys before storage.
            </li>
            <li>
              <span className="font-semibold text-[var(--foreground)]">
                Network isolation.
              </span>{" "}
              The application servers run inside a private network with
              no outbound access to the public internet, except for the
              specific platform endpoints needed for notice delivery.
            </li>
            <li>
              <span className="font-semibold text-[var(--foreground)]">
                Authentication.
              </span>{" "}
              Email one-time codes only, with rate limits on requests
              and on URL submissions (10 URLs per 24 hours per account).
            </li>
            <li>
              <span className="font-semibold text-[var(--foreground)]">
                CSRF and session integrity.
              </span>{" "}
              All state-changing requests are CSRF-protected. Session
              cookies are HTTP-only, Secure, and SameSite-Lax.
            </li>
            <li>
              <span className="font-semibold text-[var(--foreground)]">
                Audit logging.
              </span>{" "}
              Every access to sensitive data by an administrator is
              recorded in an append-only security event log.
            </li>
            <li>
              <span className="font-semibold text-[var(--foreground)]">
                No-fetch monitor.
              </span>{" "}
              A live integrity check verifies the no-fetch invariant -
              that the application does not make outbound HTTP requests
              to user-submitted URLs. If it ever did, alerting fires
              immediately.
            </li>
          </ul>
        </Section>

        {/* SECTION 10 - Your rights */}
        <Section num="10" id="your-rights" title="Your rights under the DPDP Act">
          <p>
            The Digital Personal Data Protection Act, 2023 gives you a
            set of rights over your own data. Asmita honours each of them
            without charge.
          </p>
          <ul className="mt-6 space-y-3">
            <li>
              <span className="font-semibold text-[var(--foreground)]">
                Right to access.
              </span>{" "}
              You can download every piece of data we hold about you, at
              any time, from your case dashboard.
            </li>
            <li>
              <span className="font-semibold text-[var(--foreground)]">
                Right to correction.
              </span>{" "}
              You can edit your email address, declaration text, and any
              free-text fields in your case. URL submissions can be
              withdrawn but not edited (so the audit trail stays sound).
            </li>
            <li>
              <span className="font-semibold text-[var(--foreground)]">
                Right to erasure.
              </span>{" "}
              You can delete your account at any time. After a 30-day
              soft-delete window - during which you can restore - the
              data is permanently erased.
            </li>
            <li>
              <span className="font-semibold text-[var(--foreground)]">
                Right to grievance redressal.
              </span>{" "}
              You can write to the Grievance Officer listed in section
              16. We acknowledge every grievance within 72 hours and
              resolve or escalate within 14 days, in line with the DPDP
              Act and IT Rules 2021.
            </li>
            <li>
              <span className="font-semibold text-[var(--foreground)]">
                Right to nominate.
              </span>{" "}
              You can nominate another person to exercise these rights
              on your behalf in case of incapacity or death. Contact the
              Grievance Officer to set this up.
            </li>
          </ul>
        </Section>

        {/* SECTION 11 - Children */}
        <Section num="11" id="children" title="Children and minors">
          <p>
            Asmita does not knowingly collect any personal data from a
            person under the age of 18. The age attestation at the start
            of every case flow routes anyone who indicates they are
            under 18 away from URL submission and into a curated set of
            child-safety resources, including CHILDLINE 1098,
            TakeItDown (NCMEC), and cybercrime.gov.in.
          </p>
          <p>
            If we learn that we have collected data from a minor through
            an inaccurate attestation, that data is deleted immediately
            and the case account is closed. Concerned parents or
            guardians can write to the Grievance Officer.
          </p>
        </Section>

        {/* SECTION 12 - Cookies */}
        <Section num="12" id="cookies" title="Cookies and analytics">
          <p>
            Asmita uses two cookies, both strictly functional: a session
            cookie that keeps you signed in, and a language-preference
            cookie that remembers whether you chose English or
            Hindi. No third-party advertising, marketing, or tracking
            cookies are set by Asmita.
          </p>
          <p>
            Asmita does not use Google Analytics, Facebook Pixel, or any
            equivalent third-party analytics suite. Aggregate
            platform-response statistics are computed from internal
            logs that contain no personal data.
          </p>
        </Section>

        {/* SECTION 13 - Transfers */}
        <Section num="13" id="transfers" title="Where your data lives">
          <p>
            Asmita is built for India. All personal data is stored on
            servers physically located in India. The list of
            sub-processors (database, email, hosting) is maintained in
            our public sub-processor register and updated whenever the
            list changes.
          </p>
          <p>
            We do not transfer your data outside India, except where a
            specific platform you have asked us to send a notice to is
            located outside India - in which case the notice itself
            (and only the notice) crosses the border.
          </p>
        </Section>

        {/* SECTION 14 - Breach */}
        <Section num="14" id="breach" title="If we ever have a breach">
          <p>
            If a personal-data breach occurs that is likely to result in
            risk to you, we will notify the Data Protection Board of
            India and the affected users without undue delay, in
            accordance with the DPDP Act and the rules made under it.
            The notification will include the nature of the breach, the
            data affected, the likely consequences, and the steps we
            have taken to contain it.
          </p>
          <p>
            Even when not legally required, we will notify you of any
            incident that affected your case data.
          </p>
        </Section>

        {/* SECTION 15 - Changes */}
        <Section num="15" id="changes" title="Changes to this policy">
          <p>
            We will post any change to this policy at this URL, with a
            new &ldquo;Last updated&rdquo; date at the top. For material
            changes - anything that expands what we collect, broadens
            with whom we share, or lengthens retention - we will give
            you at least 30 days&rsquo; advance notice by email before
            the change takes effect.
          </p>
        </Section>

        {/* SECTION 16 - Contact */}
        <Section
          num="16"
          id="contact"
          title="Contact and Grievance Officer"
        >
          <p>
            The Grievance Officer is the named human responsible for
            replying to your privacy questions and grievances. The
            production-launch contact will be added to this section
            before public launch.
          </p>
          <p>
            For now, please write to{" "}
            <a
              href="mailto:grievance@meriasmita.org"
              className="link-underline text-[var(--foreground)]"
            >
              grievance@meriasmita.org
            </a>{" "}
            with the subject line &ldquo;Privacy grievance&rdquo;, or
            use the{" "}
            <Link
              href="/contact"
              className="link-underline text-[var(--foreground)]"
            >
              contact page
            </Link>
            .
          </p>
          <p>
            Notice templates and policy posture have been reviewed
            informally with Internet Freedom Foundation and SFLC.in. A
            full legal opinion is on file and will be linked here at
            production launch.
          </p>
        </Section>

        {/* CLOSING */}
        <section className="container pb-24 pt-20 text-center md:pb-32 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <h2 className="font-display text-[32px] font-normal leading-[1.15] tracking-tight md:text-[52px] md:leading-[1.12]">
              Privacy is the architecture.
            </h2>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.75] md:text-lg">
              If anything on this page is unclear, write to us. We will
              answer in English or Hindi - whichever is easier for you.
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

function Section({
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
    <section id={id} className="container scroll-mt-20 py-14 md:py-20">
      <div className="mx-auto max-w-2xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
          Section {num}
        </p>
        <h2 className="font-display mt-4 text-[26px] font-normal leading-[1.2] tracking-tight md:text-[36px] md:leading-[1.18]">
          {title}
        </h2>
        <div className="muted mt-6 space-y-4 text-base leading-[1.8] md:text-[17px]">
          {children}
        </div>
      </div>
    </section>
  );
}
