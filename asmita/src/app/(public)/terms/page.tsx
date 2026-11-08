import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Callout, Fold, ItemCards, NextStep, ReadingLayout, ReadingSection, type TocItem } from "@/components/Reading";
import { ReadingTime } from "@/components/ReadingTime";
import { Illustration } from "@/components/Illustration";

const toc: TocItem[] = [
  { id: "scope", title: "What these Terms cover" },
  { id: "who-can-use", title: "Who can use Asmita" },
  { id: "account", title: "Your account and authentication" },
  { id: "how-a-case-works", title: "How a case works" },
  { id: "your-declaration", title: "Your declaration and undertaking" },
  { id: "acceptable-use", title: "Acceptable use" },
  { id: "rate-limits", title: "Rate limits and abuse prevention" },
  { id: "ngo-vouching", title: "NGO vouching" },
  { id: "our-role", title: "What Asmita does and does not do" },
  { id: "ip", title: "Intellectual property" },
  { id: "termination", title: "Termination and account closure" },
  { id: "indemnity", title: "Indemnity" },
  { id: "limitation", title: "Limitation of liability" },
  { id: "law", title: "Governing law and dispute resolution" },
  { id: "changes", title: "Changes to these Terms" },
  { id: "contact", title: "Contact" },
];

const title = (id: string) => toc.find((s) => s.id === id)!.title;

// The Terms are English only, so the page text lives here rather than in i18n.
export default function TermsPage() {
  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="container page-hero text-center page-hero-split">
          <div className="mx-auto max-w-2xl">
            <span className="eyebrow">Terms of use</span>
            <h1 className="page-title mt-8">
              The rules of the
              <br />
              <em className="not-italic text-gradient">road</em>.
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              These Terms set out what you can expect from Asmita, what we
              expect from you, and the legal framework that holds both of
              us. Written in plain language. Reviewed against Indian law.
            </p>
            <p className="eyebrow mt-8">
              Last updated · 17 May 2026 · Version 0.4 · Draft pending legal
              review<ReadingTime label="{n} min read" />
            </p>
          </div>
          <Illustration name="page-terms" eager className="page-hero-art" />
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* TL;DR */}
        <section className="container section-pad">
          <div className="mx-auto max-w-3xl">
            <span className="eyebrow mb-4 block">The short version</span>
            <h2 className="section-title">Three things you are agreeing to.</h2>
            <ItemCards
              mark="check"
              items={[
                {
                  title: "You are an adult acting on your own behalf,",
                  body: "or you are a person vouching for an adult survivor with their consent.",
                },
                {
                  title: "Your declaration is truthful.",
                  body: "You have the right to ask for removal of the content at each URL you submit, and you understand that a false declaration carries legal consequences.",
                },
                {
                  title: "Asmita is a tool, not a guarantee.",
                  body: "We do everything we can to get content removed quickly, but platforms ultimately decide. We make no promise of removal.",
                },
              ]}
            />
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* SECTIONS */}
        <ReadingLayout tocLabel="Contents" toc={toc}>
          <ReadingSection id="scope" icon="compass" title={title("scope")}>
            <p>
              These Terms of Use form a contract between you and Asmita that
              governs your use of the Asmita platform - the website, the
              case dashboard, the notice-dispatch system, the audit trail, and
              any tool or document the platform produces on your behalf.
            </p>
            <Callout>
              By creating an account or using any signed-in feature, you
              agree to these Terms and to the{" "}
              <Link href="/privacy" className="link-underline text-[var(--ink)]">
                Privacy Policy
              </Link>
              .
            </Callout>
            <Fold locale="en">
              <p>
                They do not cover the websites of any platform Asmita sends a
                takedown notice to, the cybercrime portal at
                cybercrime.gov.in, or any third-party service you visit from a
                link in our pages. Those services have their own terms.
              </p>
            </Fold>
          </ReadingSection>

          <ReadingSection id="who-can-use" icon="users" title={title("who-can-use")}>
            <p>You may use Asmita if all of the following are true.</p>
            <ItemCards
              mark="check"
              items={[
                { body: "You are eighteen (18) years of age or older." },
                { body: "You are filing a takedown request for non-consensual intimate content that depicts you, or you are an authorised NGO vouching for an adult survivor with their explicit consent." },
                { body: "You are located in India, or the platforms you are sending notices to are subject to Indian law." },
                { body: "You have not been previously suspended from Asmita for abuse." },
              ]}
            />
            <p>
              If you are under 18, Asmita does not collect URLs from you. You
              will be routed to minor support resources including CHILDLINE
              1098, TakeItDown (NCMEC), and cybercrime.gov.in.
            </p>
            <NextStep
              title="Under 18, or was the image taken when you were?"
              body="There is a separate, safer path with child-safety help."
              cta="See the safer path"
              href="/minor-support"
            />
          </ReadingSection>

          <ReadingSection id="account" icon="lock" title={title("account")}>
            <p>
              Accounts are created with an email address. There are no
              passwords - Asmita sends a one-time code to your email each
              time you sign in.
            </p>
            <Callout icon="alert">
              You are responsible for keeping your email account secure,
              because anyone with access to your inbox can sign in to your
              Asmita case.
            </Callout>
            <p>
              You may not share your account with another person, register
              multiple accounts to circumvent rate limits, or use someone
              else&rsquo;s email to register.
            </p>
          </ReadingSection>

          <ReadingSection id="how-a-case-works" icon="clipboard" title={title("how-a-case-works")}>
            <p>
              A case begins with age attestation and a digital declaration.
              You then add URLs as text. You may also submit image fingerprints.
              Asmita identifies the
              platform from each URL and prepares a takedown notice for you to
              review and sign. Real dispatch requires human verification of the
              platform contact, sender domain, and notice template. Where a
              platform has no verified contact, a guided form handoff may help
              you submit through the platform&rsquo;s own web form. A private
              dashboard shows each platform, response window, and audit trail.
            </p>
            <p>
              Notices are sent by email with the reported URL in the signed
              PDF attachment. The email provider and recipient may retain
              copies beyond Asmita&rsquo;s retention period.
            </p>
            <NextStep
              title="A full walkthrough"
              body="Every step of a case, from links to the platform's reply."
              cta="How it works"
              href="/how-it-works"
            />
          </ReadingSection>

          <ReadingSection id="your-declaration" icon="scale" title={title("your-declaration")}>
            <p>
              Each case begins with a digital declaration in which you
              confirm, under penalty of law, that the content you are
              asking to be removed is non-consensual, depicts you, and that
              you have the right to demand its removal. This declaration
              is the legal basis on which platforms act.
            </p>
            <Callout icon="alert">
              A knowingly false declaration is an offence under Section 199
              of the Bharatiya Nyaya Sanhita (BNS) and may also attract
              liability under the Information Technology Act, 2000 and IT
              Rules 2021.
            </Callout>
            <p>
              Asmita reserves the right to forward false declarations to
              law-enforcement authorities at its discretion.
            </p>
          </ReadingSection>

          <ReadingSection id="acceptable-use" icon="alert" title={title("acceptable-use")}>
            <p>You agree not to use Asmita to do any of the following.</p>
            <ItemCards
              mark="x"
              items={[
                { body: "Submit URLs you do not have the legal right to request removal of, including content depicting other adults without their consent." },
                { body: "Use Asmita to harass, defame, or extort any person." },
                { body: "Submit content that is not non-consensual intimate imagery (for example, ordinary public commentary, news reporting, or political speech)." },
                { body: "Probe, scan, or test the vulnerability of any part of the service without authorisation." },
                { body: "Upload intimate media files. The current flow accepts URLs as text only. Transmitting actual image or video files to Asmita is not supported and any attempt to do so is a violation of these Terms." },
                { body: <>Attempt to gain access to another user&rsquo;s case dashboard or audit trail.</> },
              ]}
            />
            <p>
              We may suspend or close an account that violates this
              section, and may notify affected platforms or
              law-enforcement authorities where required.
            </p>
          </ReadingSection>

          <ReadingSection id="rate-limits" icon="clock" title={title("rate-limits")}>
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
          </ReadingSection>

          <ReadingSection id="ngo-vouching" icon="heart" title={title("ngo-vouching")}>
            <p>
              Survivor-support organisations may be onboarded as vouching
              partners. A vouching NGO acts only with the explicit, recorded
              consent of the survivor it is representing, and is bound by an
              additional partnership agreement that governs case handling
              and data access. NGO vouching is described in the{" "}
              <Link href="/how-it-works" className="link-underline text-[var(--ink)]">
                How it works
              </Link>{" "}
              page.
            </p>
          </ReadingSection>

          <ReadingSection id="our-role" icon="target" title={title("our-role")}>
            <p>
              Asmita prepares and routes legally reviewed takedown notices,
              tracks platform responses, and assembles evidence packages.
              That is the scope of the service.
            </p>
            <p>Asmita does not, and cannot, do the following.</p>
            <ItemCards
              mark="x"
              items={[
                { body: "Force a platform to remove content. Platforms decide; we do everything legally available to make removal likely and fast." },
                { body: "Provide legal advice. The notice templates are legally reviewed, but Asmita is not your lawyer." },
                { body: "File a First Information Report (FIR) on your behalf. We prepare a police-ready FIR package after seven days; you file it at a station of your choice or through cybercrime.gov.in." },
                { body: "Access, view, or process media behind a URL you submit. URLs are handled as text. You may submit a fingerprint generated on your device. The optional deeper AI check forwards an image to its provider only after your consent." },
              ]}
            />
          </ReadingSection>

          <ReadingSection id="ip" icon="building" title={title("ip")}>
            <p>
              All material Asmita produces - code, design, notice
              templates, evidence formats - is the property of Asmita and
              its licensors. The audit trail, FIR package, and case data
              that pertain to your case are yours, and you may download or
              forward them at any time.
            </p>
            <Fold locale="en">
              <p>
                The Asmita name and wordmark may not be used to imply
                partnership, endorsement, or official affiliation without
                written permission.
              </p>
            </Fold>
          </ReadingSection>

          <ReadingSection id="termination" icon="x" title={title("termination")}>
            <p>
              You may close your account at any time. Soft deletion is
              immediate; a scheduled job permanently erases the account
              and all linked case data 30 days after soft deletion, in
              line with the{" "}
              <Link href="/privacy" className="link-underline text-[var(--ink)]">
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
          </ReadingSection>

          <ReadingSection id="indemnity" icon="shieldCheck" title={title("indemnity")}>
            <p>
              You agree to indemnify and hold Asmita and its operators
              harmless from any claim, damage, or expense arising from a
              false declaration, an unlawful use of the platform, or a
              breach of these Terms by you. This indemnity does not apply
              to claims caused by Asmita&rsquo;s own negligence or wilful
              misconduct.
            </p>
          </ReadingSection>

          <ReadingSection id="limitation" icon="info" title={title("limitation")}>
            <p>
              Asmita is offered free of charge as a public-interest tool.
              To the maximum extent permitted by law, Asmita and its
              operators are not liable for indirect, incidental, or
              consequential damages, or for the conduct of any third party
              (including the platforms to whom we send notices).
            </p>
            <Fold locale="en">
              <p>
                Nothing in these Terms excludes any liability that cannot be
                excluded under Indian law, including liability for death or
                personal injury caused by negligence.
              </p>
            </Fold>
          </ReadingSection>

          <ReadingSection id="law" icon="globe" title={title("law")}>
            <p>
              These Terms are governed by the laws of the Republic of
              India. Any dispute arising under them is subject to the
              exclusive jurisdiction of the courts at New Delhi.
            </p>
            <p>
              Before any dispute is taken to court, you agree to first
              raise it with the Grievance Officer at{" "}
              <Link href="/contact" className="link-underline text-[var(--ink)]">
                /contact
              </Link>{" "}
              so we can attempt good-faith resolution.
            </p>
          </ReadingSection>

          <ReadingSection id="changes" icon="refresh" title={title("changes")}>
            <p>
              We will post any change to these Terms at this URL, with a
              new &ldquo;Last updated&rdquo; date at the top.
            </p>
            <Callout>
              For material changes - anything that meaningfully reduces your
              rights or expands your obligations - we will give you at least
              30 days&rsquo; advance notice by email before the change takes
              effect.
            </Callout>
            <p>Continued use of the service after the effective date constitutes acceptance.</p>
          </ReadingSection>

          <ReadingSection id="contact" icon="mail" title={title("contact")}>
            <p>
              For questions about these Terms, write to the Grievance
              Officer at{" "}
              <a href="mailto:grievance@meriasmita.org" className="link-underline text-[var(--ink)]">
                grievance@meriasmita.org
              </a>{" "}
              or use the{" "}
              <Link href="/contact" className="link-underline text-[var(--ink)]">
                contact page
              </Link>
              .
            </p>
          </ReadingSection>
        </ReadingLayout>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* CLOSING */}
        <section className="container page-hero text-center">
          <div className="mx-auto max-w-2xl">
            <h2 className="section-title">
              Plainly written. Properly held.
            </h2>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.75] md:text-lg">
              If anything in these Terms is unclear, write to us. We will
              answer in English or Hindi - whichever is easier for you.
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
