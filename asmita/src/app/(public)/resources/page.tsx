import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";

type Resource = {
  name: string;
  contact: string;
  href: string;
  description: string;
};

type Group = {
  label: string;
  title: string;
  subtitle: string;
  items: Resource[];
};

const groups: Group[] = [
  {
    label: "Group 01",
    title: "If you are in immediate danger.",
    subtitle:
      "Call first. Both lines are 24-hour, free, and answer in multiple Indian languages.",
    items: [
      {
        name: "Emergency Response Support",
        contact: "112",
        href: "tel:112",
        description:
          "Police, fire, ambulance, and emergency response across India. Call if you are in immediate danger.",
      },
      {
        name: "CHILDLINE",
        contact: "1098",
        href: "tel:1098",
        description:
          "For minors and child safety concerns. Adults concerned about a child can also call.",
      },
    ],
  },
  {
    label: "Group 02",
    title: "If you need to talk to someone.",
    subtitle:
      "Free, confidential counselling - not legal advice, not law enforcement.",
    items: [
      {
        name: "iCALL · TISS",
        contact: "9152987821",
        href: "tel:9152987821",
        description:
          "Psychosocial counselling by telephone and email, run by the Tata Institute of Social Sciences.",
      },
    ],
  },
  {
    label: "Group 03",
    title: "If you need legal aid.",
    subtitle:
      "Free legal services through India’s statutory legal-aid authorities.",
    items: [
      {
        name: "NALSA / DLSA Directory",
        contact: "nalsa.gov.in/directory",
        href: "https://nalsa.gov.in/directory/",
        description:
          "Official directory of National, State, and District Legal Services Authorities. Use the state link to find your district office.",
      },
    ],
  },
  {
    label: "Group 04",
    title: "If you want to file a cybercrime complaint.",
    subtitle:
      "The government portal for cybercrime reporting in India - and a short guide for using it well.",
    items: [
      {
        name: "National Cybercrime Reporting Portal",
        contact: "cybercrime.gov.in",
        href: "https://cybercrime.gov.in/",
        description:
          "Plain-language path for filing cybercrime complaints. The women-and-child path applies for non-consensual intimate content.",
      },
    ],
  },
  {
    label: "Group 05",
    title: "Awareness and community.",
    subtitle:
      "Indian organisations working alongside survivors on digital safety and gender-based violence.",
    items: [
      {
        name: "Cyber Peace Foundation",
        contact: "cyberpeace.org",
        href: "https://cyberpeace.org",
        description:
          "Cyber-safety guidance and public-awareness resources for individuals and organisations.",
      },
      {
        name: "Red Dot Foundation",
        contact: "reddotfoundation.org",
        href: "https://reddotfoundation.org/",
        description:
          "Support and reporting ecosystem for gender-based violence and public safety.",
      },
    ],
  },
];

const filingSteps = [
  "Open the National Cybercrime Reporting Portal and choose the women-and-child path if it applies to your situation.",
  "Use your Asmita case reference and FIR package once your case has reached the seven-day mark.",
  "Do not upload intimate images to Asmita. Only attach material where the official portal explicitly asks for it.",
  "Call 112 first if there is immediate danger, or 1098 for child-safety concerns.",
];

export default function ResourcesPage() {
  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="container pb-12 pt-20 text-center md:pb-16 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              Support resources
            </span>
            <p className="muted mt-3 text-xs tracking-wide">
              Available in English and <span lang="hi">हिंदी</span>
            </p>
            <h1 className="font-display mt-8 text-[40px] font-normal leading-[1.08] tracking-tight md:text-[68px] md:leading-[1.06]">
              Help you can reach
              <br />
              <em className="not-italic text-gradient">without</em> an account.
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              Every line below is free to use, requires no Asmita case, and is
              run by an Indian organisation or the Government of India.
            </p>
            <p className="font-mono mt-8 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
              Last verified against public source pages: 12 May 2026.
            </p>
          </div>
        </section>

        {/* GROUPS - each category gets its own section header + stacked resource items */}
        {groups.map((group) => (
          <div key={group.label}>
            <section className="container pb-6 pt-16 text-center md:pb-8 md:pt-24">
              <div className="mx-auto max-w-2xl">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
                  {group.label}
                </p>
                <h2 className="font-display mt-4 text-[28px] font-normal leading-[1.18] tracking-tight md:text-[44px] md:leading-[1.14]">
                  {group.title}
                </h2>
                <p className="muted mx-auto mt-5 max-w-lg text-base leading-[1.75] md:text-lg">
                  {group.subtitle}
                </p>
              </div>
            </section>

            {group.items.map((item) => (
              <section
                key={item.name}
                className="container py-8 text-center md:py-12"
              >
                <div className="mx-auto max-w-2xl">
                  <h3 className="font-display text-[22px] font-normal leading-[1.2] tracking-tight md:text-[28px] md:leading-[1.18]">
                    {item.name}
                  </h3>
                  <p className="mt-4">
                    <a
                      href={item.href}
                      target={
                        item.href.startsWith("http") ? "_blank" : undefined
                      }
                      rel={
                        item.href.startsWith("http")
                          ? "noopener noreferrer"
                          : undefined
                      }
                      aria-label={
                        item.href.startsWith("tel:")
                          ? `${item.name} - call ${item.contact}`
                          : `${item.name} - ${item.contact} (opens in new tab)`
                      }
                      className="font-mono text-[28px] tracking-tight text-[var(--teal-dark)] underline decoration-transparent underline-offset-[6px] transition-colors hover:decoration-[var(--teal-dark)] md:text-[40px]"
                    >
                      {item.contact}
                    </a>
                  </p>
                  <p className="muted mx-auto mt-5 max-w-lg text-base leading-[1.75] md:text-lg">
                    {item.description}
                  </p>
                </div>
              </section>
            ))}
          </div>
        ))}

        {/* FILING GUIDE - numbered, quiet, like how-it-works steps */}
        <section className="container pb-6 pt-20 text-center md:pb-8 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
              Filing guide
            </p>
            <h2 className="font-display mt-4 text-[28px] font-normal leading-[1.18] tracking-tight md:text-[44px] md:leading-[1.14]">
              How to use the cybercrime portal well.
            </h2>
            <p className="muted mx-auto mt-5 max-w-lg text-base leading-[1.75] md:text-lg">
              Four short notes from people who have helped survivors file
              before.
            </p>
          </div>
        </section>

        {filingSteps.map((text, i) => (
          <section
            key={i}
            className="container py-6 text-center md:py-8"
          >
            <div className="mx-auto max-w-2xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
                Note {String(i + 1).padStart(2, "0")}
              </p>
              <p className="font-display mx-auto mt-3 max-w-lg text-[18px] leading-[1.5] tracking-tight text-[var(--foreground)] md:text-[22px] md:leading-[1.45]">
                {text}
              </p>
            </div>
          </section>
        ))}

        {/* CLOSING - invitation back into the case flow */}
        <section className="container pb-24 pt-24 text-center md:pb-32 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <h2 className="font-display text-[32px] font-normal leading-[1.15] tracking-tight md:text-[52px] md:leading-[1.12]">
              When you are ready, Asmita is here.
            </h2>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.75] md:text-lg">
              You can use any of the resources above without ever creating an
              Asmita case. None of them require it.
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
