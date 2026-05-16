import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";

type Tocitem = { num: string; id: string; title: string };

const toc: Tocitem[] = [
  { num: "01", id: "scope", title: "What these Terms cover" },
  { num: "02", id: "who-can-use", title: "Who can use Asmita" },
  { num: "03", id: "account", title: "Your account and authentication" },
  { num: "04", id: "how-a-case-works", title: "How a case works" },
  { num: "05", id: "your-declaration", title: "Your declaration and undertaking" },
  { num: "06", id: "acceptable-use", title: "Acceptable use" },
  { num: "07", id: "rate-limits", title: "Rate limits and abuse prevention" },
  { num: "08", id: "ngo-vouching", title: "NGO vouching" },
  { num: "09", id: "our-role", title: "What Asmita does and does not do" },
  { num: "10", id: "ip", title: "Intellectual property" },
  { num: "11", id: "termination", title: "Termination and account closure" },
  { num: "12", id: "indemnity", title: "Indemnity" },
  { num: "13", id: "limitation", title: "Limitation of liability" },
  { num: "14", id: "law", title: "Governing law and dispute resolution" },
  { num: "15", id: "changes", title: "Changes to these Terms" },
  { num: "16", id: "contact", title: "Contact" },
];

export default function TermsPage() {
  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="container pb-12 pt-20 text-center md:pb-16 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              Terms of use
            </span>
            <p className="muted mt-3 text-xs tracking-wide">
              Available in English and <span lang="hi">हिंदी</span>
            </p>
            <h1 className="font-display mt-8 text-[40px] font-normal leading-[1.08] tracking-tight md:text-[68px] md:leading-[1.06]">
              The rules of the
              <br />
              <em className="not-italic text-gradient">road</em>.
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              These Terms set out what you can expect from Asmita, what we
              expect from you, and the legal framework that holds both of
              us. Written in plain language. Reviewed against Indian law.
            </p>
            <p className="font-mono mt-8 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
              Last updated · 17 May 2026 · Version 0.4 · Draft pending legal
              review
            </p>
          </div>
        </section>

        {/* TL;DR */}
        <section className="container py-14 text-center md:py-20">
          <div className="mx-auto max-w-2xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
              The short version
            </p>
            <h2 className="font-display mt-4 text-[28px] font-normal leading-[1.18] tracking-tight md:text-[44px] md:leading-[1.14]">
              Three things you are agreeing to.
            </h2>
            <ul className="muted mx-auto mt-8 max-w-md space-y-3 text-base leading-[1.75] md:text-lg">
              <li>
                <span className="font-semibold text-[var(--foreground)]">
                  You are an adult acting on your own behalf,
                </span>{" "}
                or you are a person vouching for an adult survivor with
                their consent.
              </li>
              <li>
                <span className="font-semibold text-[var(--foreground)]">
                  Your declaration is truthful.
                </span>{" "}
                You have the right to ask for removal of the content at
                each URL you submit, and you understand that a false
                declaration carries legal consequences.
              </li>
              <li>
                <span className="font-semibold text-[var(--foreground)]">
                  Asmita is a tool, not a guarantee.
                </span>{" "}
                We do everything we can to get content removed quickly,
                but platforms ultimately decide. We make no promise of
                removal.
              </li>
            </ul>
          </div>
        </section>

        {/* TOC */}
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

        {/* SECTIONS */}
        <Section num="01" id="scope" title="What these Terms cover">
          <p>
            These Terms of Use form a contract between you and Asmita that
            governs your use of the Asmita platform — the website, the
            case dashboard, the notice-dispatch system, the audit trail, and
            any tool or document the platform produces on your behalf.
          </p>
          <p>
            They do not cover the websites of any platform Asmita sends a
            takedown notice to, the cybercrime portal at
            cybercrime.gov.in, or any third-party service you visit from a
            link in our pages. Those services have their own terms.
          </p>
          <p>
            By creating an account or using any signed-in feature, you
            agree to these Terms and to the{" "}
            <Link href="/privacy" className="link-underline text-[var(--foreground)]">
              Privacy Policy
            </Link>
            .
          </p>
        </Section>

        <Section num="02" id="who-can-use" title="Who can use Asmita">
          <p>
            You may use Asmita if all of the following are true.
          </p>
          <ul className="mt-6 space-y-3">
            <li>
              You are eighteen (18) years of age or older.
            </li>
            <li>
              You are filing a takedown request for non-consensual intimate
              content that depicts you, or you are an authorised NGO
              vouching for an adult survivor with their explicit consent.
            </li>
            <li>
              You are located in India, or the platforms you are sending
              notices to are subject to Indian law.
            </li>
            <li>
              You have not been previously suspended from Asmita for abuse.
            </li>
          </ul>
          <p>
            If you are under 18, Asmita does not collect URLs from you. You
            will be routed to{" "}
            <Link
              href="/minor-support"
              className="link-underline text-[var(--foreground)]"
            >
              minor support resources
            </Link>{" "}
            including CHILDLINE 1098, TakeItDown (NCMEC), and
            cybercrime.gov.in.
          </p>
        </Section>

        <Section num="03" id="account" title="Your account and authentication">
          <p>
            Accounts are created with an email address. There are no
            passwords — Asmita sends a one-time code to your email each
            time you sign in. You are responsible for keeping your email
            account secure, because anyone with access to your inbox can
            sign in to your Asmita case.
          </p>
          <p>
            You may not share your account with another person, register
            multiple accounts to circumvent rate limits, or use someone
            else&rsquo;s email to register.
          </p>
        </Section>

        <Section num="04" id="how-a-case-works" title="How a case works">
          <p>
            A case begins with age attestation and a digital declaration.
            You then add URLs as text. Asmita identifies the platform from
            each URL, prepares legally reviewed takedown notices, asks you
            to approve them, and sends them to the platform&rsquo;s
            Grievance Officer or equivalent. A private dashboard shows
            each platform, response window, and audit trail.
          </p>
          <p>
            A full walkthrough lives at{" "}
            <Link
              href="/how-it-works"
              className="link-underline text-[var(--foreground)]"
            >
              /how-it-works
            </Link>
            .
          </p>
        </Section>

        <Section
          num="05"
          id="your-declaration"
          title="Your declaration and undertaking"
        >
          <p>
            Each case begins with a digital declaration in which you
            confirm, under penalty of law, that the content you are
            asking to be removed is non-consensual, depicts you, and that
            you have the right to demand its removal. This declaration
            is the legal basis on which platforms act.
          </p>
          <p>
            A knowingly false declaration is an offence under Section 199
            of the Bharatiya Nyaya Sanhita (BNS) and may also attract
            liability under the Information Technology Act, 2000 and IT
            Rules 2021. Asmita reserves the right to forward false
            declarations to law-enforcement authorities at its
            discretion.
          </p>
        </Section>

        <Section num="06" id="acceptable-use" title="Acceptable use">
          <p>
            You agree not to use Asmita to do any of the following.
          </p>
          <ul className="mt-6 space-y-3">
            <li>
              Submit URLs you do not have the legal right to request
              removal of, including content depicting other adults
              without their consent.
            </li>
            <li>
              Use Asmita to harass, defame, or extort any person.
            </li>
            <li>
              Submit content that is not non-consensual intimate
              imagery (for example, ordinary public commentary, news
              reporting, or political speech).
            </li>
            <li>
              Probe, scan, or test the vulnerability of any part of the
              service without authorisation.
            </li>
            <li>
              Upload intimate media files. Asmita only accepts URLs as
              text. Any file upload that bypasses this restriction is a
              violation of these Terms and may be reported.
            </li>
            <li>
              Attempt to gain access to another user&rsquo;s case
              dashboard or audit trail.
            </li>
          </ul>
          <p>
            We may suspend or close an account that violates this
            section, and may notify affected platforms or
            law-enforcement authorities where required.
          </p>
        </Section>

        <Section
          num="07"
          id="rate-limits"
          title="Rate limits and abuse prevention"
        >
          <p>
            To prevent abuse and to protect platform Grievance Officers
            from a flood of notices, Asmita enforces rate limits of up
            to ten URLs per twenty-four hours per account, with
            corresponding caps on notice dispatch. The limits apply
            symmetrically to NGO accounts when vouching, except where a
            higher limit has been explicitly agreed in writing.
          </p>
          <p>
            Persistent attempts to circumvent rate limits, including
            registering multiple accounts, will result in suspension.
          </p>
        </Section>

        <Section num="08" id="ngo-vouching" title="NGO vouching">
          <p>
            Survivor-support organisations may be onboarded as vouching
            partners. A vouching NGO acts only with the explicit, recorded
            consent of the survivor it is representing, and is bound by an
            additional partnership agreement that governs case handling
            and data access. NGO vouching is described in the{" "}
            <Link
              href="/how-it-works"
              className="link-underline text-[var(--foreground)]"
            >
              How it works
            </Link>{" "}
            page.
          </p>
        </Section>

        <Section
          num="09"
          id="our-role"
          title="What Asmita does and does not do"
        >
          <p>
            Asmita prepares and routes legally reviewed takedown notices,
            tracks platform responses, and assembles evidence packages.
            That is the scope of the service.
          </p>
          <p>
            Asmita does not, and cannot, do the following.
          </p>
          <ul className="mt-6 space-y-3">
            <li>
              Force a platform to remove content. Platforms decide; we do
              everything legally available to make removal likely and
              fast.
            </li>
            <li>
              Provide legal advice. The notice templates are legally
              reviewed, but Asmita is not your lawyer.
            </li>
            <li>
              File a First Information Report (FIR) on your behalf. We
              prepare a police-ready FIR package after seven days; you
              file it at a station of your choice or through
              cybercrime.gov.in.
            </li>
            <li>
              Hash, fingerprint, or otherwise scan the content of the
              media. Asmita is a URL-based notice system. Hash-matching
              services exist elsewhere (for example, StopNCII.org).
            </li>
          </ul>
        </Section>

        <Section num="10" id="ip" title="Intellectual property">
          <p>
            All material Asmita produces — code, design, notice
            templates, evidence formats — is the property of Asmita and
            its licensors. The audit trail, FIR package, and case data
            that pertain to your case are yours, and you may download or
            forward them at any time.
          </p>
          <p>
            The Asmita name and wordmark may not be used to imply
            partnership, endorsement, or official affiliation without
            written permission.
          </p>
        </Section>

        <Section
          num="11"
          id="termination"
          title="Termination and account closure"
        >
          <p>
            You may close your account at any time. Soft deletion is
            immediate; a scheduled job permanently erases the account
            and all linked case data 30 days after soft deletion, in
            line with the{" "}
            <Link
              href="/privacy"
              className="link-underline text-[var(--foreground)]"
            >
              Privacy Policy
            </Link>
            .
          </p>
          <p>
            Asmita may suspend or terminate an account for serious or
            repeated violations of these Terms, for legal compulsion, or
            for security reasons. We will notify you of any termination
            unless we are legally prohibited from doing so.
          </p>
        </Section>

        <Section num="12" id="indemnity" title="Indemnity">
          <p>
            You agree to indemnify and hold Asmita and its operators
            harmless from any claim, damage, or expense arising from a
            false declaration, an unlawful use of the platform, or a
            breach of these Terms by you. This indemnity does not apply
            to claims caused by Asmita&rsquo;s own negligence or wilful
            misconduct.
          </p>
        </Section>

        <Section num="13" id="limitation" title="Limitation of liability">
          <p>
            Asmita is offered free of charge as a public-interest tool.
            To the maximum extent permitted by law, Asmita and its
            operators are not liable for indirect, incidental, or
            consequential damages, or for the conduct of any third party
            (including the platforms to whom we send notices).
          </p>
          <p>
            Nothing in these Terms excludes any liability that cannot be
            excluded under Indian law, including liability for death or
            personal injury caused by negligence.
          </p>
        </Section>

        <Section
          num="14"
          id="law"
          title="Governing law and dispute resolution"
        >
          <p>
            These Terms are governed by the laws of the Republic of
            India. Any dispute arising under them is subject to the
            exclusive jurisdiction of the courts at New Delhi.
          </p>
          <p>
            Before any dispute is taken to court, you agree to first
            raise it with the Grievance Officer at{" "}
            <Link
              href="/contact"
              className="link-underline text-[var(--foreground)]"
            >
              /contact
            </Link>{" "}
            so we can attempt good-faith resolution.
          </p>
        </Section>

        <Section num="15" id="changes" title="Changes to these Terms">
          <p>
            We will post any change to these Terms at this URL, with a
            new &ldquo;Last updated&rdquo; date at the top. For material
            changes — anything that meaningfully reduces your rights or
            expands your obligations — we will give you at least 30
            days&rsquo; advance notice by email before the change takes
            effect. Continued use of the service after the effective date
            constitutes acceptance.
          </p>
        </Section>

        <Section num="16" id="contact" title="Contact">
          <p>
            For questions about these Terms, write to the Grievance
            Officer at{" "}
            <a
              href="mailto:grievance@asmita.in"
              className="link-underline text-[var(--foreground)]"
            >
              grievance@asmita.in
            </a>{" "}
            or use the{" "}
            <Link
              href="/contact"
              className="link-underline text-[var(--foreground)]"
            >
              contact page
            </Link>
            .
          </p>
        </Section>

        {/* CLOSING */}
        <section className="container pb-24 pt-20 text-center md:pb-32 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <h2 className="font-display text-[32px] font-normal leading-[1.15] tracking-tight md:text-[52px] md:leading-[1.12]">
              Plainly written. Properly held.
            </h2>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.75] md:text-lg">
              If anything in these Terms is unclear, write to us. We will
              answer in English or Hindi — whichever is easier for you.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link className="btn btn-primary" href="/contact">
                Contact Asmita
              </Link>
              <Link className="btn btn-secondary" href="/privacy">
                Read the Privacy Policy
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
