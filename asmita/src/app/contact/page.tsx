import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";

type Channel = {
  num: string;
  title: string;
  body: string;
  email: string;
};

const channels: Channel[] = [
  {
    num: "01",
    title: "General questions",
    body: "If you are unsure where to write, write here. We read every message and route it to the right teammate. Reply usually within 48 hours, in English or Hindi.",
    email: "hello@asmita.in",
  },
  {
    num: "02",
    title: "Privacy grievance",
    body: "For anything covered by the privacy policy — access, correction, deletion, or a complaint about how we have handled your data. The named Grievance Officer reads every message at this address.",
    email: "grievance@asmita.in",
  },
  {
    num: "03",
    title: "NGO partnership and vouching",
    body: "For survivor-support organisations that want to vouch for a survivor under the NGO vouching path, or to coordinate template review and case escalations.",
    email: "partners@asmita.in",
  },
  {
    num: "04",
    title: "Security disclosure",
    body: "For vulnerability reports, abuse signals, or anything that needs to reach the engineering and security team quickly. We acknowledge within 72 hours. PGP key is published on request.",
    email: "security@asmita.in",
  },
  {
    num: "05",
    title: "Press and research",
    body: "For journalists, academic researchers, and policy organisations. We share aggregate, anonymised data only — never identifying details of any survivor or case.",
    email: "press@asmita.in",
  },
];

export default function ContactPage() {
  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="container pb-12 pt-20 text-center md:pb-16 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              Contact
            </span>
            <p className="muted mt-3 text-xs tracking-wide">
              Available in English and <span lang="hi">हिंदी</span>
            </p>
            <h1 className="font-display mt-8 text-[40px] font-normal leading-[1.08] tracking-tight md:text-[68px] md:leading-[1.06]">
              Reach the
              <br />
              Asmita <em className="not-italic text-gradient">team</em>.
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              There are five ways to write to us. Pick the one that matches
              what you need — or use the first one if you are not sure.
            </p>
            <p className="font-mono mt-8 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
              Pre-launch · email addresses provisional · will be confirmed
              before public launch
            </p>
          </div>
        </section>

        {/* WHAT TO NOT SEND — short trauma-informed warning */}
        <section className="container py-12 text-center md:py-16">
          <div className="mx-auto max-w-2xl">
            <p className="font-display text-[20px] leading-[1.5] tracking-tight text-[var(--foreground)] md:text-[24px] md:leading-[1.45]">
              Please do not email intimate images or videos. Asmita only ever
              needs links as text — never the content itself.
            </p>
          </div>
        </section>

        {/* CHANNELS — five quiet contact blocks */}
        {channels.map((c) => (
          <section
            key={c.num}
            className="container py-12 text-center md:py-16"
          >
            <div className="mx-auto max-w-2xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
                Channel {c.num}
              </p>
              <h2 className="font-display mt-4 text-[26px] font-normal leading-[1.2] tracking-tight md:text-[36px] md:leading-[1.18]">
                {c.title}
              </h2>
              <p className="mt-4">
                <a
                  href={`mailto:${c.email}`}
                  className="font-mono text-[20px] tracking-tight text-[var(--teal-dark)] underline decoration-transparent underline-offset-[6px] transition-colors hover:decoration-[var(--teal-dark)] md:text-[28px]"
                >
                  {c.email}
                </a>
              </p>
              <p className="muted mx-auto mt-5 max-w-lg text-base leading-[1.75] md:text-lg">
                {c.body}
              </p>
            </div>
          </section>
        ))}

        {/* RESPONSE TIMES */}
        <section className="container py-14 text-center md:py-20">
          <div className="mx-auto max-w-2xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
              Response times
            </p>
            <h2 className="font-display mt-4 text-[28px] font-normal leading-[1.18] tracking-tight md:text-[40px] md:leading-[1.14]">
              How quickly we reply.
            </h2>
            <ul className="muted mx-auto mt-7 max-w-md space-y-3 text-base leading-[1.75] md:text-lg">
              <li>
                <span className="font-semibold text-[var(--foreground)]">
                  Privacy grievances:
                </span>{" "}
                acknowledged within 72 hours, resolved or escalated within 14
                days, per the DPDP Act.
              </li>
              <li>
                <span className="font-semibold text-[var(--foreground)]">
                  Security disclosures:
                </span>{" "}
                acknowledged within 72 hours.
              </li>
              <li>
                <span className="font-semibold text-[var(--foreground)]">
                  Everything else:
                </span>{" "}
                usually within 48 hours on working days.
              </li>
            </ul>
            <p className="muted mx-auto mt-6 max-w-md text-sm leading-[1.7]">
              Asmita is not an emergency service. If you are in immediate
              danger, call{" "}
              <a
                href="tel:112"
                aria-label="Call emergency services 112"
                className="link-underline text-[var(--foreground)]"
              >
                112
              </a>
              .
            </p>
          </div>
        </section>

        {/* CLOSING */}
        <section className="container pb-24 pt-20 text-center md:pb-32 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <h2 className="font-display text-[32px] font-normal leading-[1.15] tracking-tight md:text-[52px] md:leading-[1.12]">
              We will write back.
            </h2>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.75] md:text-lg">
              Every message reaches a person. We answer in English or Hindi —
              whichever is easier for you.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link className="btn btn-primary" href="/start">
                Start a case
              </Link>
              <Link className="btn btn-secondary" href="/faq">
                Read the FAQ
              </Link>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
