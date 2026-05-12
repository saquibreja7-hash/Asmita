const faqs = [
  {
    question: "What is Asmita?",
    answer:
      "Asmita is a privacy-first support platform for adults in India seeking help with non-consensual intimate image abuse. It helps prepare platform notices, track status, and preserve a clear audit trail.",
    hindiQuestion: "अस्मिता क्या है?",
    hindiAnswer:
      "अस्मिता भारत में वयस्कों के लिए एक गोपनीयता-केंद्रित सहायता मंच है। यह प्लेटफॉर्म नोटिस, स्थिति ट्रैकिंग और सुरक्षित ऑडिट रिकॉर्ड में मदद करता है।",
  },
  {
    question: "Can minors submit URLs?",
    answer:
      "No. Minors are routed to child-safety support resources before email collection or URL submission. CHILDLINE 1098 and emergency 112 are shown prominently.",
    hindiQuestion: "क्या नाबालिग URL जमा कर सकते हैं?",
    hindiAnswer:
      "नहीं। नाबालिगों को ईमेल या URL लेने से पहले बाल-सुरक्षा सहायता संसाधनों पर भेजा जाता है। CHILDLINE 1098 और आपातकालीन 112 स्पष्ट रूप से दिखाए जाते हैं।",
  },
  {
    question: "Does Asmita download or view submitted content?",
    answer:
      "No. Submitted URLs are treated as tokens for routing and hashing. The system is designed not to fetch, download, or display intimate content.",
    hindiQuestion: "क्या अस्मिता जमा की गई सामग्री डाउनलोड या देखती है?",
    hindiAnswer:
      "नहीं। जमा किए गए URL केवल रूटिंग और हैशिंग के लिए उपयोग होते हैं। सिस्टम निजी सामग्री को fetch, download या display नहीं करता।",
  },
  {
    question: "Are notices legally reviewed?",
    answer:
      "Live notice templates must be reviewed by a legal advisor before activation. Draft legal text in this build is marked pending review and must not be treated as legal advice.",
    hindiQuestion: "क्या नोटिस कानूनी रूप से समीक्षा किए गए हैं?",
    hindiAnswer:
      "लाइव नोटिस टेम्पलेट सक्रिय होने से पहले कानूनी सलाहकार द्वारा समीक्षा किए जाने चाहिए। इस बिल्ड में ड्राफ्ट कानूनी टेक्स्ट pending review है।",
  },
  {
    question: "What happens if a platform does not respond?",
    answer:
      "The system schedules follow-up at 24 hours, victim notification at 48 hours, and a 7-day support package if there is still no response.",
    hindiQuestion: "अगर प्लेटफॉर्म जवाब नहीं देता तो क्या होता है?",
    hindiAnswer:
      "सिस्टम 24 घंटे पर follow-up, 48 घंटे पर victim notification और जवाब न मिलने पर 7-दिन का support package तैयार करता है।",
  },
];

export default function FaqPage() {
  return (
    <main className="container py-12">
      <section className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <p className="text-sm font-bold uppercase text-[var(--muted)]">Launch FAQ</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">Frequently asked questions</h1>
          <p className="mt-4 text-lg text-[var(--muted)]">
            Plain-language answers in English and Hindi for victims, supporters, NGOs, and reviewers.
          </p>
        </div>
        <div className="space-y-4">
          {faqs.map((item) => (
            <article className="panel p-5" key={item.question}>
              <h2 className="text-xl font-black">{item.question}</h2>
              <p className="mt-2 text-[var(--muted)]">{item.answer}</p>
              <div className="mt-4 border-t border-[var(--border)] pt-4" lang="hi">
                <h3 className="font-black">{item.hindiQuestion}</h3>
                <p className="mt-2 text-[var(--muted)]">{item.hindiAnswer}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
