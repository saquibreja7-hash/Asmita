/**
 * One-time script: translates FAQ content from English to Hindi via Sarvam AI.
 * Run: node scripts/translate-faq.mjs
 * Requires: SARVAM_API_KEY env var
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HI_JSON = join(__dirname, "../src/i18n/hi.json");

const API_KEY = process.env.SARVAM_API_KEY;
if (!API_KEY) {
  console.error("Set SARVAM_API_KEY env var first.");
  process.exit(1);
}

async function translate(text) {
  const res = await fetch("https://api.sarvam.ai/translate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-subscription-key": API_KEY,
    },
    body: JSON.stringify({
      input: text,
      source_language_code: "en-IN",
      target_language_code: "hi-IN",
      speaker_gender: "Female",
      mode: "formal",
      model: "mayura:v1",
      enable_preprocessing: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sarvam API error ${res.status}: ${body}`);
  }
  const data = await res.json();
  return data.translated_text;
}

const faqKeys = {
  // Section eyebrows & titles
  "faq.s1.eyebrow": "About Asmita",
  "faq.s1.title": "The basics",
  "faq.s2.eyebrow": "About NCII",
  "faq.s2.title": "Non-consensual intimate imagery",
  "faq.s3.eyebrow": "Digital fingerprinting",
  "faq.s3.title": "How image hashing works",
  "faq.s4.eyebrow": "Eligibility & limits",
  "faq.s4.title": "Who can use Asmita, and what it can't do",

  // Section 1
  "faq.s1.q1": "What is Asmita?",
  "faq.s1.a1":
    "Asmita is a privacy-first support platform for adults in India seeking help with non-consensual intimate-image abuse. It helps prepare platform notices under IT Rules 2021, track notice status, and preserve a clear audit trail - all without anyone at Asmita ever seeing your content.",
  "faq.s1.q2": "Does Asmita download or view submitted content?",
  "faq.s1.a2":
    "No. Submitted URLs are treated as text tokens for routing only. The system is architecturally prevented from fetching, downloading, rendering, or displaying intimate content - this is enforced at the code level, not just policy.",
  "faq.s1.q3": "Are notices legally reviewed?",
  "faq.s1.a3":
    "Yes. Live notice templates are reviewed by a legal advisor before activation. Draft legal text in pre-launch builds is marked pending review and must not be treated as legal advice.",
  "faq.s1.q4": "What happens if a platform does not respond?",
  "faq.s1.a4":
    "The system schedules a follow-up at 24 hours and a re-send at 48 hours. If there is still no response after 7 days, Asmita prepares a police-ready FIR package for submission to cybercrime.gov.in.",

  // Section 2
  "faq.s2.q1": "What counts as 'intimate' content?",
  "faq.s2.a1":
    "Intimate images are images or videos showing nudity, underwear, genitals, sexual activity, or sexual poses. Deepfakes and AI-generated images that depict you in these ways are also included.",
  "faq.s2.q2":
    "Someone is threatening to share my images but hasn't posted them yet. Can Asmita help?",
  "faq.s2.a2":
    "Yes - this is called the preemptive or sextortion path, and it is fully supported. You can create a digital fingerprint of your images on your own device. That fingerprint, not the image, is included in legal notices to platforms so they can block the content before it is ever posted. Your images never leave your device.",
  "faq.s2.q3": "Someone else is also in the images. Can I still use Asmita?",
  "faq.s2.a3":
    "Yes. If you are in the image and it was shared without your consent, you can file a case regardless of who else appears in it.",
  "faq.s2.q4": "Is NCII illegal in India?",
  "faq.s2.a4":
    "Yes. Sharing intimate images without consent is a criminal offence under the IT (Amendment) Act 2023 and the Bharatiya Nyaya Sanhita (BNS). Platforms are also required under IT Rules 2021 to respond to takedown notices within 24 hours for such content. Asmita automates that notice process.",

  // Section 3
  "faq.s3.q1": "What is a digital fingerprint?",
  "faq.s3.a1":
    "A digital fingerprint - technically called a hash - is a unique code generated from your image, like a barcode attached to it. Duplicate copies of the same image produce the same hash. Asmita uses this to include in legal notices so platforms can identify and block matching content. The algorithm cannot be run in reverse to recreate your image.",
  "faq.s3.q2": "Can the fingerprint be reversed to reveal my original image?",
  "faq.s3.a2":
    "No. Hashing is a one-way process. The fingerprint cannot be used to reconstruct or view your image by anyone - including Asmita, the platforms, or anyone who intercepts the notice.",
  "faq.s3.q3": "What if the image has been cropped, filtered, or edited?",
  "faq.s3.a3":
    "Each edited version produces a different fingerprint. If the version being circulated is cropped or filtered, you should generate a fingerprint from that version, not just the original. You can create multiple fingerprints - one for each meaningful variation.",
  "faq.s3.q4": "Can I delete the image from my device after the fingerprint is created?",
  "faq.s3.a4":
    "Yes. Once the fingerprint is generated, you can delete the image from your device. The fingerprint persists and will continue to work. It does not require the original image to remain.",
  "faq.s3.q5": "Does it work on deepfakes or AI-generated images?",
  "faq.s3.a5":
    "Yes. If a deepfake or AI-generated image depicts you in an intimate way, you can generate a fingerprint from it. Asmita treats synthetic intimate images the same as real ones.",

  // Section 4
  "faq.s4.q1": "Can minors use Asmita?",
  "faq.s4.a1":
    "No. Minors are routed to CHILDLINE 1098, TakeItDown (NCMEC), and cybercrime.gov.in before any email or URL is collected. No case, session, or record is created. Content depicting anyone under 18 is governed by POCSO, which requires specialised handling that Asmita does not provide.",
  "faq.s4.q2": "Can I file on behalf of someone else?",
  "faq.s4.a2":
    "No - the case must be filed by the person depicted. This rule exists to prevent the tool from being used to target others. If you know someone who needs help, you can share Asmita with them and help them connect with a support organisation such as iCALL (9152987821).",
  "faq.s4.q3": "Does Asmita work for content shared on WhatsApp or Telegram private chats?",
  "faq.s4.a3":
    "No. These platforms use end-to-end encryption, which means content inside private chats cannot be detected or matched by any external tool. Asmita reaches platforms with public-facing content and verified grievance contacts. For encrypted-platform abuse, the National Cybercrime Portal (cybercrime.gov.in) is the right path.",
  "faq.s4.q4": "Does Asmita cover the whole internet?",
  "faq.s4.a4":
    "No. Asmita sends notices to platforms that have a verified grievance contact under IT Rules 2021. Personal websites, obscure hosting services, or platforms that ignore notices are beyond what Asmita can automatically resolve - in those cases the FIR package is the next step.",
  "faq.s4.q5": "I don't have the original image anymore. Can I still file?",
  "faq.s4.a5":
    "For URL takedown, you don't need the image at all - just the link where the content appears. For digital fingerprinting, a high-quality screenshot can work if it is the best version you have access to.",

  // Hero & closing
  "faq.hero.pill": "Questions, answered",
  "faq.hero.title": "Frequently asked questions",
  "faq.hero.sub":
    "Plain-language answers for survivors, supporters, NGOs, and reviewers.",
  "faq.closing.title": "Still have a question?",
  "faq.closing.body":
    "Reach out before you start a case. We answer in English or Hindi - whichever is easier for you.",
  "faq.closing.cta1": "Contact Asmita",
  "faq.closing.cta2": "See support resources",
};

async function main() {
  const hi = JSON.parse(readFileSync(HI_JSON, "utf8"));
  const entries = Object.entries(faqKeys);
  let done = 0;

  for (const [key, english] of entries) {
    process.stdout.write(`[${++done}/${entries.length}] ${key} ... `);
    try {
      hi[key] = await translate(english);
      console.log("ok");
    } catch (err) {
      console.error(`FAILED: ${err.message}`);
      hi[key] = english; // fall back to English so the key exists
    }
    // Small delay to avoid rate limit
    await new Promise((r) => setTimeout(r, 200));
  }

  writeFileSync(HI_JSON, JSON.stringify(hi, null, 2) + "\n", "utf8");
  console.log(`\nDone. Updated ${HI_JSON}`);
}

main();
