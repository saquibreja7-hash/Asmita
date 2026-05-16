import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";

const faqs = [
  {
    question: "What is Asmita?",
    answer:
      "Asmita is a privacy-first support platform for adults in India seeking help with non-consensual intimate-image abuse. It helps prepare platform notices, track status, and preserve a clear audit trail.",
    hindiQuestion: "अस्मिता क्या है?",
    hindiAnswer:
      "अस्मिता भारत में वयस्कों के लिए एक गोपनीयता-केंद्रित सहायता मंच है। यह प्लेटफॉर्म नोटिस, स्थिति ट्रैकिंग और सुरक्षित ऑडिट रिकॉर्ड में मदद करता है।",
  },
  {
    question: "Can minors submit URLs?",
    answer:
      "No. Minors are routed to child-safety support resources before email collection or URL submission. CHILDLINE 1098 and Emergency 112 are shown prominently.",
    hindiQuestion: "क्या नाबालिग URL जमा कर सकते हैं?",
    hindiAnswer:
      "नहीं। नाबालिगों को ईमेल या URL लेने से पहले बाल-सुरक्षा सहायता संसाधनों पर भेजा जाता है। CHILDLINE 1098 और आपातकालीन 112 स्पष्ट रूप से दिखाए जाते हैं।",
  },
  {
    question: "Does Asmita download or view submitted content?",
    answer:
      "No. Submitted URLs are treated as text tokens for routing only. The system is designed not to fetch, download, render, or display intimate content.",
    hindiQuestion: "क्या अस्मिता जमा की गई सामग्री डाउनलोड या देखती है?",
    hindiAnswer:
      "नहीं। जमा किए गए URL केवल रूटिंग के लिए text tokens के रूप में उपयोग होते हैं। सिस्टम निजी सामग्री को fetch, download या display नहीं करता।",
  },
  {
    question: "Are notices legally reviewed?",
    answer:
      "Yes. Live notice templates are reviewed by a legal advisor before activation. Draft legal text in pre-launch builds is marked pending review and must not be treated as legal advice.",
    hindiQuestion: "क्या नोटिस कानूनी रूप से समीक्षा किए गए हैं?",
    hindiAnswer:
      "हाँ। लाइव नोटिस टेम्पलेट सक्रिय होने से पहले कानूनी सलाहकार द्वारा समीक्षा किए जाते हैं। प्री-लॉन्च बिल्ड में ड्राफ्ट कानूनी टेक्स्ट pending review है।",
  },
  {
    question: "What happens if a platform does not respond?",
    answer:
      "The system schedules follow-up at 24 hours and a re-send at 48 hours. If there is still no response after 7 days, Asmita prepares a police-ready FIR package for cybercrime.gov.in.",
    hindiQuestion: "अगर प्लेटफॉर्म जवाब नहीं देता तो क्या होता है?",
    hindiAnswer:
      "सिस्टम 24 घंटे पर follow-up और 48 घंटे पर re-send करता है। 7 दिनों के बाद भी जवाब न मिलने पर अस्मिता cybercrime.gov.in के लिए FIR package तैयार करता है।",
  },
];

export default function FaqPage() {
  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="container pb-12 pt-20 text-center md:pb-16 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              Questions, answered
            </span>
            <p className="muted mt-3 text-xs tracking-wide">
              Available in English and <span lang="hi">हिंदी</span>
            </p>
            <h1 className="font-display mt-8 text-[40px] font-normal leading-[1.08] tracking-tight md:text-[68px] md:leading-[1.06]">
              Frequently asked
              <br />
              <em className="not-italic text-gradient">questions</em>.
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              Plain-language answers for survivors, supporters, NGOs, and
              reviewers — every question answered in both English and Hindi.
            </p>
          </div>
        </section>

        {/* QUESTIONS — each FAQ is its own quiet block, EN then HI */}
        {faqs.map((faq, i) => (
          <section
            key={faq.question}
            className="container py-14 text-center md:py-20"
          >
            <div className="mx-auto max-w-2xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
                Q {String(i + 1).padStart(2, "0")}
              </p>

              {/* English */}
              <h2 className="font-display mt-4 text-[26px] font-normal leading-[1.2] tracking-tight md:text-[36px] md:leading-[1.18]">
                {faq.question}
              </h2>
              <p className="muted mx-auto mt-5 max-w-lg text-base leading-[1.75] md:text-lg">
                {faq.answer}
              </p>

              {/* Hindi — same quiet treatment, slightly smaller */}
              <h3
                lang="hi"
                className="font-display mx-auto mt-10 max-w-lg text-[22px] font-normal leading-[1.3] tracking-tight md:text-[28px] md:leading-[1.28]"
              >
                {faq.hindiQuestion}
              </h3>
              <p
                lang="hi"
                className="muted mx-auto mt-4 max-w-lg text-base leading-[1.85] md:text-lg"
              >
                {faq.hindiAnswer}
              </p>
            </div>
          </section>
        ))}

        {/* CLOSING — still have questions? */}
        <section className="container pb-24 pt-20 text-center md:pb-32 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <h2 className="font-display text-[32px] font-normal leading-[1.15] tracking-tight md:text-[52px] md:leading-[1.12]">
              Still have a question?
            </h2>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.75] md:text-lg">
              Reach out before you start a case. We answer in English or Hindi
              — whichever is easier for you.
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
