import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";

type Faq = {
  question: string;
  answer: string;
  hindiQuestion: string;
  hindiAnswer: string;
};

type Section = {
  label: string;
  title: string;
  items: Faq[];
};

const sections: Section[] = [
  {
    label: "Section 01",
    title: "About Asmita",
    items: [
      {
        question: "What is Asmita?",
        answer:
          "Asmita is a privacy-first support platform for adults in India seeking help with non-consensual intimate-image abuse. It helps prepare platform notices under IT Rules 2021, track notice status, and preserve a clear audit trail — all without anyone at Asmita ever seeing your content.",
        hindiQuestion: "अस्मिता क्या है?",
        hindiAnswer:
          "अस्मिता भारत में वयस्कों के लिए एक गोपनीयता-केंद्रित सहायता मंच है। यह IT नियम 2021 के तहत प्लेटफॉर्म नोटिस तैयार करने, स्थिति ट्रैकिंग और ऑडिट रिकॉर्ड में मदद करता है — और अस्मिता में कोई भी आपकी सामग्री नहीं देखता।",
      },
      {
        question: "Does Asmita download or view submitted content?",
        answer:
          "No. Submitted URLs are treated as text tokens for routing only. The system is architecturally prevented from fetching, downloading, rendering, or displaying intimate content — this is enforced at the code level, not just policy.",
        hindiQuestion: "क्या अस्मिता जमा की गई सामग्री डाउनलोड या देखती है?",
        hindiAnswer:
          "नहीं। जमा किए गए URL केवल रूटिंग के लिए text tokens के रूप में उपयोग होते हैं। सिस्टम को आर्किटेक्चर स्तर पर निजी सामग्री fetch, download या display करने से रोका गया है — यह केवल नीति नहीं, कोड-स्तर पर लागू है।",
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
          "The system schedules a follow-up at 24 hours and a re-send at 48 hours. If there is still no response after 7 days, Asmita prepares a police-ready FIR package for submission to cybercrime.gov.in.",
        hindiQuestion: "अगर प्लेटफॉर्म जवाब नहीं देता तो क्या होता है?",
        hindiAnswer:
          "सिस्टम 24 घंटे पर follow-up और 48 घंटे पर re-send करता है। 7 दिनों के बाद भी जवाब न मिलने पर अस्मिता cybercrime.gov.in के लिए FIR package तैयार करता है।",
      },
    ],
  },
  {
    label: "Section 02",
    title: "About non-consensual intimate imagery",
    items: [
      {
        question: "What counts as 'intimate' content?",
        answer:
          "Intimate images are images or videos showing nudity, underwear, genitals, sexual activity, or sexual poses. Deepfakes and AI-generated images that depict you in these ways are also included.",
        hindiQuestion: "'अंतरंग' सामग्री क्या मानी जाती है?",
        hindiAnswer:
          "अंतरंग छवियाँ वे होती हैं जो नग्नता, अंडरवियर, यौनांग, यौन गतिविधि, या यौन मुद्राओं को दिखाती हैं। Deepfakes और AI-जनित छवियाँ जो आपको इस तरह दिखाती हैं, वे भी शामिल हैं।",
      },
      {
        question:
          "Someone is threatening to share my images but hasn't posted them yet. Can Asmita help?",
        answer:
          "Yes — this is called the preemptive or sextortion path, and it is fully supported. You can create a digital fingerprint of your images on your own device. That fingerprint, not the image, is included in legal notices to platforms so they can block the content before it is ever posted. Your images never leave your device.",
        hindiQuestion:
          "कोई मेरी छवियाँ share करने की धमकी दे रहा है लेकिन अभी तक पोस्ट नहीं की हैं। क्या अस्मिता मदद कर सकती है?",
        hindiAnswer:
          "हाँ — इसे preemptive या sextortion path कहते हैं, और यह पूरी तरह से समर्थित है। आप अपने डिवाइस पर अपनी छवियों की digital fingerprint बना सकते हैं। वह fingerprint — छवि नहीं — प्लेटफॉर्म को कानूनी नोटिस में भेजी जाती है ताकि वे सामग्री को पोस्ट होने से पहले रोक सकें। आपकी छवियाँ आपके डिवाइस से बाहर नहीं जातीं।",
      },
      {
        question: "Someone else is also in the images. Can I still use Asmita?",
        answer:
          "Yes. If you are in the image and it was shared without your consent, you can file a case regardless of who else appears in it.",
        hindiQuestion:
          "मेरी छवियों में कोई और भी है। क्या मैं फिर भी अस्मिता का उपयोग कर सकती हूँ?",
        hindiAnswer:
          "हाँ। अगर आप छवि में हैं और इसे आपकी सहमति के बिना share किया गया है, तो आप केस दर्ज कर सकती हैं — चाहे उसमें कोई और भी हो।",
      },
      {
        question: "Is NCII illegal in India?",
        answer:
          "Yes. Sharing intimate images without consent is a criminal offence under the IT (Amendment) Act 2023 and the Bharatiya Nyaya Sanhita (BNS). Platforms are also required under IT Rules 2021 to respond to takedown notices within 24 hours for such content. Asmita automates that notice process.",
        hindiQuestion: "क्या भारत में NCII गैरकानूनी है?",
        hindiAnswer:
          "हाँ। बिना सहमति के अंतरंग छवियाँ share करना IT (संशोधन) अधिनियम 2023 और भारतीय न्याय संहिता (BNS) के तहत आपराधिक अपराध है। IT नियम 2021 के तहत प्लेटफॉर्म को ऐसी सामग्री के लिए 24 घंटे में takedown नोटिस का जवाब देना आवश्यक है। अस्मिता उस नोटिस प्रक्रिया को स्वचालित करती है।",
      },
    ],
  },
  {
    label: "Section 03",
    title: "About digital fingerprinting",
    items: [
      {
        question: "What is a digital fingerprint?",
        answer:
          "A digital fingerprint — technically called a hash — is a unique code generated from your image, like a barcode attached to it. Duplicate copies of the same image produce the same hash. Asmita uses this to include in legal notices so platforms can identify and block matching content. The algorithm cannot be run in reverse to recreate your image.",
        hindiQuestion: "Digital fingerprint क्या है?",
        hindiAnswer:
          "Digital fingerprint — तकनीकी रूप से hash कहलाती है — आपकी छवि से उत्पन्न एक unique code है, जैसे उस पर एक barcode। एक ही छवि की duplicate copies का hash समान होता है। अस्मिता इसे कानूनी नोटिस में शामिल करती है। इस algorithm को उलटा नहीं चलाया जा सकता ताकि आपकी छवि फिर से बनाई जा सके।",
      },
      {
        question:
          "Can the fingerprint be reversed to reveal my original image?",
        answer:
          "No. Hashing is a one-way process. The fingerprint cannot be used to reconstruct or view your image by anyone — including Asmita, the platforms, or anyone who intercepts the notice.",
        hindiQuestion:
          "क्या fingerprint को उलटकर मेरी मूल छवि देखी जा सकती है?",
        hindiAnswer:
          "नहीं। Hashing एक one-way प्रक्रिया है। Fingerprint का उपयोग करके कोई भी — अस्मिता, प्लेटफॉर्म, या नोटिस को intercept करने वाला — आपकी छवि नहीं देख सकता।",
      },
      {
        question:
          "What if the image has been cropped, filtered, or edited?",
        answer:
          "Each edited version produces a different fingerprint. If the version being circulated is cropped or filtered, you should generate a fingerprint from that version, not just the original. You can create multiple fingerprints — one for each meaningful variation.",
        hindiQuestion:
          "अगर छवि को crop, filter या edit किया गया है तो क्या होगा?",
        hindiAnswer:
          "प्रत्येक edited version का fingerprint अलग होता है। अगर जो version circulate हो रहा है वह cropped या filtered है, तो आपको उस version से fingerprint बनानी चाहिए, न कि केवल original से। आप कई fingerprints बना सकती हैं — प्रत्येक महत्वपूर्ण variation के लिए एक।",
      },
      {
        question:
          "Can I delete the image from my device after the fingerprint is created?",
        answer:
          "Yes. Once the fingerprint is generated, you can delete the image from your device. The fingerprint persists and will continue to work. Like a lasting record, it does not require the original image to remain.",
        hindiQuestion:
          "क्या fingerprint बनने के बाद मैं अपने डिवाइस से छवि delete कर सकती हूँ?",
        hindiAnswer:
          "हाँ। एक बार fingerprint बन जाने के बाद, आप अपने डिवाइस से छवि delete कर सकती हैं। Fingerprint बनी रहेगी और काम करती रहेगी। इसके लिए मूल छवि का रहना जरूरी नहीं है।",
      },
      {
        question: "Does it work on deepfakes or AI-generated images?",
        answer:
          "Yes. If a deepfake or AI-generated image depicts you in an intimate way, you can generate a fingerprint from it. Asmita treats synthetic intimate images the same as real ones.",
        hindiQuestion:
          "क्या यह deepfakes या AI-जनित छवियों पर काम करता है?",
        hindiAnswer:
          "हाँ। अगर कोई deepfake या AI-जनित छवि आपको अंतरंग तरीके से दर्शाती है, तो आप उससे fingerprint बना सकती हैं। अस्मिता synthetic अंतरंग छवियों को वास्तविक छवियों के समान मानती है।",
      },
    ],
  },
  {
    label: "Section 04",
    title: "Eligibility and limits",
    items: [
      {
        question: "Can minors use Asmita?",
        answer:
          "No. Minors are routed to CHILDLINE 1098, TakeItDown (NCMEC), and cybercrime.gov.in before any email or URL is collected. No case, session, or record is created. This is because content depicting anyone under 18 is governed by POCSO, which requires specialised handling that Asmita does not provide.",
        hindiQuestion: "क्या नाबालिग अस्मिता का उपयोग कर सकते हैं?",
        hindiAnswer:
          "नहीं। नाबालिगों को कोई भी ईमेल या URL लेने से पहले CHILDLINE 1098, TakeItDown (NCMEC), और cybercrime.gov.in पर भेजा जाता है। कोई केस, सत्र या रिकॉर्ड नहीं बनाया जाता। ऐसा इसलिए है क्योंकि 18 वर्ष से कम उम्र के किसी भी व्यक्ति को दर्शाने वाली सामग्री POCSO द्वारा नियंत्रित होती है।",
      },
      {
        question: "Can I file on behalf of someone else?",
        answer:
          "No — the case must be filed by the person depicted. This rule exists to prevent the tool from being used to target others. If you know someone who needs help, you can share Asmita with them and help them connect with a support organisation such as iCALL (9152987821).",
        hindiQuestion: "क्या मैं किसी और की ओर से केस दर्ज कर सकती हूँ?",
        hindiAnswer:
          "नहीं — केस उसी व्यक्ति को दर्ज करना होगा जो छवि में है। यह नियम इसलिए है ताकि tool का उपयोग दूसरों को नुकसान पहुँचाने के लिए न किया जा सके। अगर आप किसी ऐसे व्यक्ति को जानती हैं जिसे मदद चाहिए, तो आप उनके साथ अस्मिता share कर सकती हैं और iCALL (9152987821) जैसे support संगठन से जोड़ सकती हैं।",
      },
      {
        question:
          "Does Asmita work for content shared on WhatsApp or Telegram private chats?",
        answer:
          "No. These platforms use end-to-end encryption, which means content inside private chats cannot be detected or matched by any external tool. Asmita reaches platforms with public-facing content and verified grievance contacts. For encrypted-platform abuse, the National Cybercrime Portal (cybercrime.gov.in) is the right path.",
        hindiQuestion:
          "क्या अस्मिता WhatsApp या Telegram private chats पर share की गई सामग्री के लिए काम करती है?",
        hindiAnswer:
          "नहीं। ये प्लेटफॉर्म end-to-end encryption का उपयोग करते हैं, जिसका मतलब है कि private chats के अंदर की सामग्री को कोई भी external tool detect या match नहीं कर सकता। अस्मिता उन प्लेटफॉर्म तक पहुँचती है जिनके पास public-facing सामग्री और verified grievance contacts हैं। Encrypted platform abuse के लिए, National Cybercrime Portal (cybercrime.gov.in) सही रास्ता है।",
      },
      {
        question: "Does Asmita cover the whole internet?",
        answer:
          "No. Asmita sends notices to platforms that have a verified grievance contact under IT Rules 2021. Personal websites, obscure hosting services, or platforms that ignore notices are beyond what Asmita can automatically resolve — in those cases the FIR package is the next step.",
        hindiQuestion: "क्या अस्मिता पूरे इंटरनेट को cover करती है?",
        hindiAnswer:
          "नहीं। अस्मिता उन प्लेटफॉर्म को नोटिस भेजती है जिनके पास IT नियम 2021 के तहत verified grievance contact है। Personal websites, अज्ञात hosting services, या नोटिस को नज़रअंदाज़ करने वाले प्लेटफॉर्म अस्मिता के automatic resolution से परे हैं — उन मामलों में FIR package अगला कदम है।",
      },
      {
        question: "I don't have the original image anymore. Can I still file?",
        answer:
          "For URL takedown (Phase 1), you don't need the image at all — just the link where the content appears. For digital fingerprinting (Phase 2), a high-quality screenshot can work if it is the best version you have access to.",
        hindiQuestion:
          "मेरे पास मूल छवि नहीं है। क्या मैं फिर भी केस दर्ज कर सकती हूँ?",
        hindiAnswer:
          "URL takedown (Phase 1) के लिए, आपको छवि की बिल्कुल भी जरूरत नहीं है — बस वह link चाहिए जहाँ सामग्री दिखती है। Digital fingerprinting (Phase 2) के लिए, एक high-quality screenshot काम कर सकता है अगर वह आपके पास उपलब्ध सबसे अच्छा version है।",
      },
    ],
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

        {sections.map((section, si) => (
          <div key={section.label}>
            {/* Section header */}
            <section className="container pb-6 pt-20 text-center md:pb-8 md:pt-28">
              <div className="mx-auto max-w-2xl">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
                  {section.label}
                </p>
                <h2 className="font-display mt-4 text-[28px] font-normal leading-[1.18] tracking-tight md:text-[40px] md:leading-[1.14]">
                  {section.title}
                </h2>
              </div>
            </section>

            {/* Questions in this section */}
            {section.items.map((faq, qi) => {
              const qNum =
                sections
                  .slice(0, si)
                  .reduce((acc, s) => acc + s.items.length, 0) +
                qi +
                1;
              return (
                <section
                  key={faq.question}
                  className="container py-12 text-center md:py-16"
                >
                  <div className="mx-auto max-w-2xl">
                    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
                      Q {String(qNum).padStart(2, "0")}
                    </p>

                    {/* English */}
                    <h3 className="font-display mt-4 text-[22px] font-normal leading-[1.2] tracking-tight md:text-[32px] md:leading-[1.18]">
                      {faq.question}
                    </h3>
                    <p className="muted mx-auto mt-5 max-w-lg text-base leading-[1.75] md:text-lg">
                      {faq.answer}
                    </p>

                    {/* Hindi */}
                    <h4
                      lang="hi"
                      className="font-display mx-auto mt-10 max-w-lg text-[18px] font-normal leading-[1.35] tracking-tight md:text-[24px] md:leading-[1.3]"
                    >
                      {faq.hindiQuestion}
                    </h4>
                    <p
                      lang="hi"
                      className="muted mx-auto mt-4 max-w-lg text-base leading-[1.85] md:text-lg"
                    >
                      {faq.hindiAnswer}
                    </p>
                  </div>
                </section>
              );
            })}
          </div>
        ))}

        {/* CLOSING */}
        <section className="container pb-24 pt-24 text-center md:pb-32 md:pt-32">
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
