import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";

type Resource = {
  num: string;
  name: string;
  contact: string;
  href: string;
  external: boolean;
  description: string;
};

const emergency: Resource[] = [
  {
    num: "01",
    name: "Emergency Response Support",
    contact: "112",
    href: "tel:112",
    external: false,
    description:
      "Call if you are in immediate danger. Police, ambulance, and fire respond across India.",
  },
  {
    num: "02",
    name: "CHILDLINE",
    contact: "1098",
    href: "tel:1098",
    external: false,
    description:
      "Free 24-hour helpline for anyone under 18 in India. You can call about any situation that scares you — not only the one that brought you here.",
  },
];

const removal: Resource[] = [
  {
    num: "03",
    name: "TakeItDown · NCMEC",
    contact: "takeitdown.ncmec.org",
    href: "https://takeitdown.ncmec.org/",
    external: true,
    description:
      "Free, designed specifically for people under 18. It uses your phone or computer to create a private hash of the image and helps remove it from participating platforms — your image never leaves your device.",
  },
  {
    num: "04",
    name: "StopNCII.org",
    contact: "stopncii.org",
    href: "https://stopncii.org/",
    external: true,
    description:
      "Hash-based support that helps stop re-sharing of intimate images. Designed for adults but young people can also use it.",
  },
];

const reporting: Resource[] = [
  {
    num: "05",
    name: "National Cybercrime Reporting Portal",
    contact: "cybercrime.gov.in",
    href: "https://cybercrime.gov.in/",
    external: true,
    description:
      "Government of India portal for cybercrime reporting. Use the women-and-child path. A trusted adult can help you file.",
  },
  {
    num: "06",
    name: "Cyber Peace Foundation",
    contact: "cyberpeace.org",
    href: "https://cyberpeace.org/",
    external: true,
    description:
      "Indian organisation that publishes cyber-safety guidance and offers support resources.",
  },
];

export default function MinorSupportPage() {
  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="container pb-12 pt-20 text-center md:pb-16 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              For people under 18
            </span>
            <p className="muted mt-3 text-xs tracking-wide">
              Available in English and <span lang="hi">हिंदी</span>
            </p>
            <h1 className="font-display mt-8 text-[40px] font-normal leading-[1.08] tracking-tight md:text-[68px] md:leading-[1.06]">
              You deserve real
              <br />
              help — <em className="not-italic text-gradient">right now</em>.
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              Asmita does not collect URLs from anyone under 18. Nothing is
              recorded on this page. Below are services built specifically
              for people your age — please use them.
            </p>
          </div>
        </section>

        {/* VALIDATION */}
        <section className="container py-12 text-center md:py-16">
          <div className="mx-auto max-w-2xl">
            <p className="font-display text-[20px] leading-[1.55] tracking-tight text-[var(--foreground)] md:text-[24px] md:leading-[1.5]">
              What you&rsquo;re feeling is valid. None of this is your fault.
              Telling a trusted adult — a parent, a teacher, a CHILDLINE
              counsellor — is the right next step.
            </p>
          </div>
        </section>

        {/* EMERGENCY GROUP */}
        <SectionHeader
          label="Group 01"
          title="If you are in immediate danger or need to talk to someone now."
          subtitle="Both lines are free, 24-hour, and answer in multiple Indian languages."
        />
        {emergency.map((r) => (
          <ResourceBlock key={r.num} {...r} />
        ))}

        {/* REMOVAL GROUP */}
        <SectionHeader
          label="Group 02"
          title="To help take the content down."
          subtitle="These services are designed for people under 18 and do not require you to send the image to anyone."
        />
        {removal.map((r) => (
          <ResourceBlock key={r.num} {...r} />
        ))}

        {/* REPORTING GROUP */}
        <SectionHeader
          label="Group 03"
          title="To report it formally."
          subtitle="A trusted adult can help you file. The portal is in English and Hindi."
        />
        {reporting.map((r) => (
          <ResourceBlock key={r.num} {...r} />
        ))}

        {/* WHY NOT ASMITA */}
        <section className="container py-14 text-center md:py-20">
          <div className="mx-auto max-w-2xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
              Why Asmita does not handle this directly
            </p>
            <h2 className="font-display mt-4 text-[26px] font-normal leading-[1.2] tracking-tight md:text-[36px] md:leading-[1.18]">
              The law treats this differently when a minor is involved.
            </h2>
            <p className="muted mx-auto mt-6 max-w-lg text-base leading-[1.75] md:text-lg">
              In India, content showing anyone under 18 is treated under the
              POCSO Act, which carries mandatory reporting obligations and
              specialised handling. Sending you through an adult takedown
              flow would risk taking that protection away from you. That is
              why we route you here instead.
            </p>
          </div>
        </section>

        {/* CLOSING */}
        <section className="container pb-24 pt-12 text-center md:pb-32 md:pt-16">
          <div className="mx-auto max-w-2xl">
            <h2 className="font-display text-[28px] font-normal leading-[1.2] tracking-tight md:text-[40px] md:leading-[1.16]">
              You are not alone in this.
            </h2>
            <p className="muted mx-auto mt-6 max-w-lg text-base leading-[1.75] md:text-lg">
              Reach one of the lines above. They have helped many people in
              the situation you are in.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <a className="btn btn-primary" href="tel:1098">
                Call CHILDLINE — 1098
              </a>
              <Link className="btn btn-secondary" href="/">
                Back to home
              </Link>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function SectionHeader({
  label,
  title,
  subtitle,
}: {
  label: string;
  title: string;
  subtitle: string;
}) {
  return (
    <section className="container pb-6 pt-16 text-center md:pb-8 md:pt-24">
      <div className="mx-auto max-w-2xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
          {label}
        </p>
        <h2 className="font-display mt-4 text-[28px] font-normal leading-[1.18] tracking-tight md:text-[44px] md:leading-[1.14]">
          {title}
        </h2>
        <p className="muted mx-auto mt-5 max-w-lg text-base leading-[1.75] md:text-lg">
          {subtitle}
        </p>
      </div>
    </section>
  );
}

function ResourceBlock({
  name,
  contact,
  href,
  external,
  description,
}: Resource) {
  return (
    <section className="container py-8 text-center md:py-12">
      <div className="mx-auto max-w-2xl">
        <h3 className="font-display text-[22px] font-normal leading-[1.2] tracking-tight md:text-[28px] md:leading-[1.18]">
          {name}
        </h3>
        <p className="mt-4">
          <a
            href={href}
            target={external ? "_blank" : undefined}
            rel={external ? "noopener noreferrer" : undefined}
            aria-label={
              external
                ? `${name} — ${contact} (opens in new tab)`
                : `${name} — call ${contact}`
            }
            className="font-mono text-[28px] tracking-tight text-[var(--teal-dark)] underline decoration-transparent underline-offset-[6px] transition-colors hover:decoration-[var(--teal-dark)] md:text-[40px]"
          >
            {contact}
          </a>
        </p>
        <p className="muted mx-auto mt-5 max-w-lg text-base leading-[1.75] md:text-lg">
          {description}
        </p>
      </div>
    </section>
  );
}
