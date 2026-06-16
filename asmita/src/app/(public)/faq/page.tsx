import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";

type Faq = { question: string; answer: string };
type Section = { eyebrow: string; title: string; items: Faq[] };

const sections: Section[] = [
  {
    eyebrow: "About Asmita",
    title: "The basics",
    items: [
      {
        question: "What is Asmita?",
        answer:
          "Asmita is a privacy-first support platform for adults in India seeking help with non-consensual intimate-image abuse. It helps prepare platform notices under IT Rules 2021, track notice status, and preserve a clear audit trail - all without anyone at Asmita ever seeing your content.",
      },
      {
        question: "Does Asmita download or view submitted content?",
        answer:
          "No. Submitted URLs are treated as text tokens for routing only. The system is architecturally prevented from fetching, downloading, rendering, or displaying intimate content - this is enforced at the code level, not just policy.",
      },
      {
        question: "Are notices legally reviewed?",
        answer:
          "Yes. Live notice templates are reviewed by a legal advisor before activation. Draft legal text in pre-launch builds is marked pending review and must not be treated as legal advice.",
      },
      {
        question: "What happens if a platform does not respond?",
        answer:
          "The system schedules a follow-up at 24 hours and a re-send at 48 hours. If there is still no response after 7 days, Asmita prepares a police-ready FIR package for submission to cybercrime.gov.in.",
      },
    ],
  },
  {
    eyebrow: "About NCII",
    title: "Non-consensual intimate imagery",
    items: [
      {
        question: "What counts as 'intimate' content?",
        answer:
          "Intimate images are images or videos showing nudity, underwear, genitals, sexual activity, or sexual poses. Deepfakes and AI-generated images that depict you in these ways are also included.",
      },
      {
        question: "Someone is threatening to share my images but hasn't posted them yet. Can Asmita help?",
        answer:
          "Yes - this is called the preemptive or sextortion path, and it is fully supported. You can create a digital fingerprint of your images on your own device. That fingerprint, not the image, is included in legal notices to platforms so they can block the content before it is ever posted. Your images never leave your device.",
      },
      {
        question: "Someone else is also in the images. Can I still use Asmita?",
        answer:
          "Yes. If you are in the image and it was shared without your consent, you can file a case regardless of who else appears in it.",
      },
      {
        question: "Is NCII illegal in India?",
        answer:
          "Yes. Sharing intimate images without consent is a criminal offence under the IT (Amendment) Act 2023 and the Bharatiya Nyaya Sanhita (BNS). Platforms are also required under IT Rules 2021 to respond to takedown notices within 24 hours for such content. Asmita automates that notice process.",
      },
    ],
  },
  {
    eyebrow: "Digital fingerprinting",
    title: "How image hashing works",
    items: [
      {
        question: "What is a digital fingerprint?",
        answer:
          "A digital fingerprint - technically called a hash - is a unique code generated from your image, like a barcode attached to it. Duplicate copies of the same image produce the same hash. Asmita uses this to include in legal notices so platforms can identify and block matching content. The algorithm cannot be run in reverse to recreate your image.",
      },
      {
        question: "Can the fingerprint be reversed to reveal my original image?",
        answer:
          "No. Hashing is a one-way process. The fingerprint cannot be used to reconstruct or view your image by anyone - including Asmita, the platforms, or anyone who intercepts the notice.",
      },
      {
        question: "What if the image has been cropped, filtered, or edited?",
        answer:
          "Each edited version produces a different fingerprint. If the version being circulated is cropped or filtered, you should generate a fingerprint from that version, not just the original. You can create multiple fingerprints - one for each meaningful variation.",
      },
      {
        question: "Can I delete the image from my device after the fingerprint is created?",
        answer:
          "Yes. Once the fingerprint is generated, you can delete the image from your device. The fingerprint persists and will continue to work. It does not require the original image to remain.",
      },
      {
        question: "Does it work on deepfakes or AI-generated images?",
        answer:
          "Yes. If a deepfake or AI-generated image depicts you in an intimate way, you can generate a fingerprint from it. Asmita treats synthetic intimate images the same as real ones.",
      },
    ],
  },
  {
    eyebrow: "Eligibility & limits",
    title: "Who can use Asmita, and what it can't do",
    items: [
      {
        question: "Can minors use Asmita?",
        answer:
          "No. Minors are routed to CHILDLINE 1098, TakeItDown (NCMEC), and cybercrime.gov.in before any email or URL is collected. No case, session, or record is created. Content depicting anyone under 18 is governed by POCSO, which requires specialised handling that Asmita does not provide.",
      },
      {
        question: "Can I file on behalf of someone else?",
        answer:
          "No - the case must be filed by the person depicted. This rule exists to prevent the tool from being used to target others. If you know someone who needs help, you can share Asmita with them and help them connect with a support organisation such as iCALL (9152987821).",
      },
      {
        question: "Does Asmita work for content shared on WhatsApp or Telegram private chats?",
        answer:
          "No. These platforms use end-to-end encryption, which means content inside private chats cannot be detected or matched by any external tool. Asmita reaches platforms with public-facing content and verified grievance contacts. For encrypted-platform abuse, the National Cybercrime Portal (cybercrime.gov.in) is the right path.",
      },
      {
        question: "Does Asmita cover the whole internet?",
        answer:
          "No. Asmita sends notices to platforms that have a verified grievance contact under IT Rules 2021. Personal websites, obscure hosting services, or platforms that ignore notices are beyond what Asmita can automatically resolve - in those cases the FIR package is the next step.",
      },
      {
        question: "I don't have the original image anymore. Can I still file?",
        answer:
          "For URL takedown, you don't need the image at all - just the link where the content appears. For digital fingerprinting, a high-quality screenshot can work if it is the best version you have access to.",
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="container pb-16 pt-20 text-center md:pb-20 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              Questions, answered
            </span>
            <h1 className="font-display mt-8 text-[40px] font-normal leading-[1.08] tracking-tight md:text-[68px] md:leading-[1.06]">
              Frequently asked{" "}
              <em className="not-italic text-gradient">questions</em>.
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              Plain-language answers for survivors, supporters, NGOs, and
              reviewers.
            </p>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* FAQ SECTIONS */}
        {sections.map((section, si) => (
          <section key={section.eyebrow} className="container py-14 md:py-20">
            <div className="mx-auto max-w-3xl">
              <span className="eyebrow mb-3 block">{section.eyebrow}</span>
              <h2 className="font-display text-[22px] font-normal leading-[1.2] tracking-tight md:text-[30px]">
                {section.title}
              </h2>

              <div className="mt-8 divide-y divide-[var(--hairline)] rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden"
                style={{ boxShadow: "var(--shadow-soft)" }}
              >
                {section.items.map((faq) => (
                  <details key={faq.question} className="group">
                    <summary className="flex cursor-pointer items-start justify-between gap-6 px-6 py-5 marker:content-none list-none [&::-webkit-details-marker]:hidden">
                      <span className="font-medium text-[var(--foreground)] text-base leading-[1.5] md:text-[17px]">
                        {faq.question}
                      </span>
                      {/* chevron */}
                      <svg
                        className="mt-0.5 h-4 w-4 shrink-0 text-[var(--muted)] transition-transform duration-200 group-open:rotate-180"
                        viewBox="0 0 16 16"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        aria-hidden
                      >
                        <path
                          d="M4 6l4 4 4-4"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </summary>
                    <div className="px-6 pb-6 pt-1">
                      <p className="muted text-base leading-[1.8] md:text-[17px]">
                        {faq.answer}
                      </p>
                    </div>
                  </details>
                ))}
              </div>
            </div>

            {si < sections.length - 1 && (
              <div className="mx-auto mt-14 max-w-3xl">
                <div className="hairline" />
              </div>
            )}
          </section>
        ))}

        <div className="container">
          <div className="hairline" />
        </div>

        {/* CLOSING */}
        <section className="container pb-24 pt-20 text-center md:pb-32 md:pt-28">
          <div className="mx-auto max-w-2xl">
            <h2 className="font-display text-[32px] font-normal leading-[1.15] tracking-tight md:text-[52px] md:leading-[1.12]">
              Still have a question?
            </h2>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.75] md:text-lg">
              Reach out before you start a case. We answer in English or Hindi -
              whichever is easier for you.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link className="btn btn-primary" href="/contact">
                Contact Asmita
              </Link>
              <Link className="btn btn-secondary" href="/resources">
                See support resources
              </Link>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
