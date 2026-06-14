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

type PlatformGuide = {
  name: string;
  notes: string;
  links: { label: string; href: string }[];
};

const platforms: PlatformGuide[] = [
  {
    name: "Instagram",
    notes:
      "Use the in-app report on the specific post or profile. Instagram's Safety Center also has a dedicated NCII removal path.",
    links: [
      {
        label: "Report on Instagram",
        href: "https://help.instagram.com/165828726894770",
      },
      {
        label: "Instagram Safety Center",
        href: "https://about.instagram.com/safety",
      },
    ],
  },
  {
    name: "Facebook",
    notes:
      "Facebook has a dedicated \"Not Without My Consent\" tool specifically for intimate images. Use it for the fastest removal path.",
    links: [
      {
        label: "Not Without My Consent",
        href: "https://www.facebook.com/safety/notwithoutmyconsent",
      },
      {
        label: "Report Harmful Content",
        href: "https://www.facebook.com/help/1380418588640631",
      },
    ],
  },
  {
    name: "Google (Search)",
    notes:
      "You can request Google remove links to intimate images from search results — even if you cannot get the content taken down at the source. This is often the fastest relief.",
    links: [
      {
        label: "Submit an NCII removal request",
        href: "https://support.google.com/websearch/answer/6302812",
      },
    ],
  },
  {
    name: "YouTube",
    notes:
      "YouTube staff review reported content 24 hours a day. You can report videos, thumbnails, comments, and entire channels.",
    links: [
      {
        label: "Report inappropriate content",
        href: "https://support.google.com/youtube/answer/2802027",
      },
      {
        label: "YouTube Help Center",
        href: "https://support.google.com/youtube",
      },
    ],
  },
  {
    name: "X (Twitter)",
    notes:
      "Use the in-app report on the specific post, or submit via X's Safety Center. Intimate images policy violations are reviewed separately from general abuse.",
    links: [
      {
        label: "Report abusive behaviour",
        href: "https://help.twitter.com/en/safety-and-security/report-abusive-behavior",
      },
      {
        label: "X Safety Center",
        href: "https://help.twitter.com/en/safety-and-security",
      },
    ],
  },
  {
    name: "Snapchat",
    notes:
      "Snapchat allows in-app anonymous reporting. When you report, both you and the person reported receive wellbeing resources.",
    links: [
      {
        label: "Report abuse in-app",
        href: "https://support.snapchat.com/en-US/article/report-abuse-in-app",
      },
      {
        label: "Snapchat Safety Resources",
        href: "https://support.snapchat.com/en-US/a/Snapchat-Safety",
      },
    ],
  },
  {
    name: "TikTok",
    notes:
      "Use TikTok's Report a Problem tool for content violations. The Safety Center has a dedicated path for privacy and intimate image reports.",
    links: [
      {
        label: "Report a Problem",
        href: "https://support.tiktok.com/en/safety-hc/report-a-problem",
      },
      {
        label: "TikTok Safety Center",
        href: "https://www.tiktok.com/safety/en-us/",
      },
    ],
  },
  {
    name: "WhatsApp",
    notes:
      "WhatsApp can block and remove a contact. Reporting sends WhatsApp your most recent messages with that person — they review for policy violations.",
    links: [
      {
        label: "Block and report a contact",
        href: "https://faq.whatsapp.com/iphone/security-and-privacy/how-to-block-and-unblock-contacts",
      },
    ],
  },
  {
    name: "Telegram",
    notes:
      "Telegram has no centralised reporting form. Use @notoscam on Telegram to report, or email abuse@telegram.org with channel/group links.",
    links: [
      {
        label: "Telegram support",
        href: "https://telegram.org/support",
      },
    ],
  },
  {
    name: "Discord",
    notes:
      "Submit an abuse report form to Discord's Trust and Safety team. Include message IDs and channel IDs where possible.",
    links: [
      {
        label: "Submit an Abuse Report",
        href: "https://support.discord.com/hc/en-us/requests/new?ticket_form_id=360000029731",
      },
      {
        label: "Discord Safety Center",
        href: "https://discord.com/safety",
      },
    ],
  },
  {
    name: "LinkedIn",
    notes:
      "Use LinkedIn's in-product reporting for inappropriate content, or contact LinkedIn Safety directly.",
    links: [
      {
        label: "Report inappropriate content",
        href: "https://www.linkedin.com/help/linkedin/answer/146",
      },
      {
        label: "LinkedIn Safety Center",
        href: "https://safety.linkedin.com/",
      },
    ],
  },
  {
    name: "Pinterest",
    notes:
      "Pinterest allows reporting specific pins, boards, or accounts. Intimate content violating consent is handled by the Trust and Safety team.",
    links: [
      {
        label: "Report something on Pinterest",
        href: "https://help.pinterest.com/en/article/report-something-on-pinterest",
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

        {/* PLATFORM REPORTING GUIDES */}
        <section className="container pb-6 pt-20 text-center md:pb-8 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
              Group 06
            </p>
            <h2 className="font-display mt-4 text-[28px] font-normal leading-[1.18] tracking-tight md:text-[44px] md:leading-[1.14]">
              If the content is already posted somewhere.
            </h2>
            <p className="muted mx-auto mt-5 max-w-lg text-base leading-[1.75] md:text-lg">
              Every major platform has a dedicated reporting path for
              non-consensual intimate imagery. Going direct is often the
              fastest way to get content removed. Links below go straight
              to each platform&rsquo;s reporting or safety tool.
            </p>
          </div>
        </section>

        <section className="container pb-16 pt-8 md:pb-24">
          <div className="mx-auto max-w-2xl space-y-4">
            {platforms.map((p) => (
              <div
                key={p.name}
                className="rounded-[14px] border border-[var(--hairline)] bg-white p-5"
              >
                <h3 className="font-display text-[18px] font-normal leading-[1.25] tracking-tight text-[var(--foreground)] md:text-[20px]">
                  {p.name}
                </h3>
                <p className="muted mt-2 text-sm leading-[1.65]">{p.notes}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {p.links.map((l) => (
                    <a
                      key={l.href}
                      href={l.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block rounded-full border border-[var(--hairline)] px-3 py-1 font-mono text-[12px] text-[var(--teal-dark)] transition-colors hover:border-[var(--teal)] hover:bg-[var(--teal-soft)]"
                    >
                      {l.label} ↗
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

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
