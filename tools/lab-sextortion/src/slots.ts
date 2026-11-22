import type { SextortionLabel } from "../../../asmita/src/lib/lab/sextortion/taxonomy.ts";

/*
 * WP116 (docs/research/research-tools-spec.md, Track D): the slot pools the
 * synthetic generator composes messages from. Every value exists in three
 * script forms: `dev` (Devanagari), `rom` (romanised Hinglish), `en`
 * (English). A `label` is applied to every row the value lands in — the
 * generator's labels therefore come from what is actually in the text.
 *
 * Content rules (spec rule 3 and the taxonomy doc):
 * - clinical vocabulary only: media nouns (video, clip, photo, recording),
 *   no body words, no acts, no slurs. The Lab never generates sexual content.
 * - no real names, no real phone numbers (98XXXXXX00-style placeholders),
 *   no real abuse URLs. The only addresses are the helplines the site itself
 *   publishes (1930, cybercrime.gov.in) in awareness-style negatives.
 * - a stated age or class appears only as a school/age statement, in
 *   victim-plea and school-chat rows, never in any sexual context.
 */

export interface SlotValue {
  dev: string;
  rom: string;
  en: string;
  label?: SextortionLabel;
}

export type SlotPool = readonly SlotValue[];

export const SLOTS: Record<string, SlotPool> = {
  // The claim of having the recording (CLAIM_HAS_MEDIA).
  claim: [
    { dev: "मेरे पास तुम्हारा वीडियो है", rom: "mere paas tumhara video hai", en: "i have your video", label: "CLAIM_HAS_MEDIA" },
    { dev: "रिकॉर्डिंग मेरे पास है", rom: "recording mere paas hai", en: "the recording is with me", label: "CLAIM_HAS_MEDIA" },
    { dev: "क्लिप सेव हो गई है", rom: "clip saved ho gayi hai", en: "the clip is saved", label: "CLAIM_HAS_MEDIA" },
    { dev: "वीडियो कॉल रिकॉर्ड कर ली है", rom: "video call record kar li hai", en: "i recorded the video call", label: "CLAIM_HAS_MEDIA" },
    { dev: "स्क्रीनशॉट ले लिए हैं", rom: "screenshot le liye hain", en: "i took the screenshots", label: "CLAIM_HAS_MEDIA" },
  ],

  // The expose threat (THREAT_EXPOSE).
  threat: [
    { dev: "वायरल कर दूंगा", rom: "viral kar dunga", en: "make it go viral", label: "THREAT_EXPOSE" },
    { dev: "सबको भेज दूंगा", rom: "sabko bhej dunga", en: "send it", label: "THREAT_EXPOSE" },
    { dev: "अपलोड कर दूंगा", rom: "upload kar dunga", en: "upload it", label: "THREAT_EXPOSE" },
    { dev: "सबको दिखा दूंगा", rom: "sabko dikha dunga", en: "show everyone", label: "THREAT_EXPOSE" },
    { dev: "पोस्ट कर दूंगा", rom: "post kar dunga", en: "post it online", label: "THREAT_EXPOSE" },
    { dev: "लीक कर दूंगा", rom: "leak kar dunga", en: "leak it", label: "THREAT_EXPOSE" },
  ],

  // Where it will be sent. English values carry their own preposition.
  audience: [
    { dev: "घर वालों को", rom: "ghar walon ko", en: "to your family", label: "AUDIENCE_FAMILY" },
    { dev: "परिवार को", rom: "family ko", en: "to your parents", label: "AUDIENCE_FAMILY" },
    { dev: "रिश्तेदारों को", rom: "sab relatives ko", en: "to your relatives", label: "AUDIENCE_FAMILY" },
    { dev: "कॉन्टैक्ट लिस्ट में", rom: "contact list me", en: "to your contact list", label: "AUDIENCE_FAMILY" },
    { dev: "फैमिली ग्रुप में", rom: "family group me", en: "to your family group", label: "AUDIENCE_FAMILY" },
    { dev: "सोशल मीडिया पर", rom: "social media par", en: "on social media", label: "AUDIENCE_PUBLIC" },
    { dev: "यूट्यूब पर", rom: "youtube par", en: "on youtube", label: "AUDIENCE_PUBLIC" },
    { dev: "फेसबुक पर", rom: "facebook par", en: "on facebook", label: "AUDIENCE_PUBLIC" },
    { dev: "इंस्टाग्राम पर", rom: "instagram par", en: "on instagram", label: "AUDIENCE_PUBLIC" },
    { dev: "सबके सामने", rom: "sabke samne", en: "in front of everyone", label: "AUDIENCE_PUBLIC" },
  ],

  // Restricted views of the audience pool, for families that are about one
  // audience only (their base labels say which).
  audFam: [
    { dev: "घर वालों को", rom: "ghar walon ko", en: "to your family", label: "AUDIENCE_FAMILY" },
    { dev: "परिवार को", rom: "family ko", en: "to your parents", label: "AUDIENCE_FAMILY" },
    { dev: "रिश्तेदारों को", rom: "sab relatives ko", en: "to your relatives", label: "AUDIENCE_FAMILY" },
    { dev: "कॉन्टैक्ट लिस्ट में", rom: "contact list me", en: "to your contact list", label: "AUDIENCE_FAMILY" },
    { dev: "फैमिली ग्रुप में", rom: "family group me", en: "to your family group", label: "AUDIENCE_FAMILY" },
  ],
  audPub: [
    { dev: "सोशल मीडिया पर", rom: "social media par", en: "on social media", label: "AUDIENCE_PUBLIC" },
    { dev: "यूट्यूब पर", rom: "youtube par", en: "on youtube", label: "AUDIENCE_PUBLIC" },
    { dev: "फेसबुक पर", rom: "facebook par", en: "on facebook", label: "AUDIENCE_PUBLIC" },
    { dev: "इंस्टाग्राम पर", rom: "instagram par", en: "on instagram", label: "AUDIENCE_PUBLIC" },
    { dev: "सबके सामने", rom: "sabke samne", en: "in front of everyone", label: "AUDIENCE_PUBLIC" },
  ],

  // The money demand (DEMAND_MONEY).
  money: [
    { dev: "पैसे भेजो", rom: "paise bhejo", en: "send the money", label: "DEMAND_MONEY" },
    { dev: "रुपये जमा करो", rom: "rupees jama karo", en: "make the bank deposit", label: "DEMAND_MONEY" },
    { dev: "पैसे ट्रांसफर करो", rom: "paise transfer karo", en: "transfer the money", label: "DEMAND_MONEY" },
    { dev: "यूपीआई कर दो", rom: "upi kar do", en: "send it by upi", label: "DEMAND_MONEY" },
    { dev: "किश्तों में भेजो", rom: "kishto me bhejo", en: "send it in instalments", label: "DEMAND_MONEY" },
  ],

  // Amounts: never carry a label on their own — a loan reminder mentions
  // money without demanding anything.
  amount: [
    { dev: "₹50000", rom: "50000 rupaye", en: "50000 rupees" },
    { dev: "₹20000", rom: "20000 rupaye", en: "20000 rupees" },
    { dev: "₹35000", rom: "35000 rupaye", en: "35000 rupees" },
    { dev: "₹10000", rom: "10000 rupaye", en: "10000 rupees" },
    { dev: "₹70000", rom: "70000 rupaye", en: "70000 rupees" },
    { dev: "₹15000", rom: "15000 rupaye", en: "15000 rupees" },
    { dev: "₹25000", rom: "25000 rupaye", en: "25000 rupees" },
    { dev: "₹5000", rom: "5000 rupaye", en: "5000 rupees" },
  ],

  // The clock (DEADLINE).
  deadline: [
    { dev: "24 घंटे में", rom: "24 ghante me", en: "within 24 hours", label: "DEADLINE" },
    { dev: "आज रात तक", rom: "aaj raat tak", en: "by tonight", label: "DEADLINE" },
    { dev: "अभी के अभी", rom: "abhi ke abhi", en: "right now", label: "DEADLINE" },
    { dev: "आधे घंटे में", rom: "aadhe ghante me", en: "within half an hour", label: "DEADLINE" },
    { dev: "एक घंटे में", rom: "ek ghante me", en: "within an hour", label: "DEADLINE" },
    { dev: "कल सुबह तक", rom: "kal subah tak", en: "by tomorrow morning", label: "DEADLINE" },
  ],

  // Fake authority (AUTHORITY_IMPERSONATION).
  authority: [
    { dev: "दिल्ली पुलिस क्राइम ब्रांच से बात है", rom: "delhi police crime branch se baat hai", en: "the delhi police crime branch is calling", label: "AUTHORITY_IMPERSONATION" },
    { dev: "साइबर सेल से बोल रहा हूँ", rom: "cyber cell se bol raha hoon", en: "calling from the cyber cell", label: "AUTHORITY_IMPERSONATION" },
    { dev: "सीबीआई अधिकारी बात कर रहा है", rom: "cbi officer baat kar raha hai", en: "a cbi officer is speaking", label: "AUTHORITY_IMPERSONATION" },
    { dev: "थानेदार से बात कर रहे हो", rom: "thanedar se baat kar rahe ho", en: "you are speaking to the station officer", label: "AUTHORITY_IMPERSONATION" },
    { dev: "आईपीएस अफसर हूँ", rom: "ips officer hoon", en: "this is an ips officer", label: "AUTHORITY_IMPERSONATION" },
  ],

  // What the fake authority says it will do (AUTHORITY_IMPERSONATION).
  authAct: [
    { dev: "एफआईआर हो जाएगी", rom: "fir ho jayegi", en: "an fir will be filed", label: "AUTHORITY_IMPERSONATION" },
    { dev: "गिरफ्तारी हो जाएगी", rom: "girftari ho jayegi", en: "you will be arrested", label: "AUTHORITY_IMPERSONATION" },
    { dev: "केस बंद करना है", rom: "case band karna hai", en: "the case has to be closed", label: "AUTHORITY_IMPERSONATION" },
    { dev: "वारंट निकल चुका है", rom: "warrant nikal chuka hai", en: "the warrant is already out", label: "AUTHORITY_IMPERSONATION" },
  ],

  // Fake platform accounts (PLATFORM_IMPERSONATION).
  platform: [
    { dev: "यूट्यूब मैनेजर बोल रहा हूँ", rom: "youtube manager bol raha hoon", en: "the youtube manager is messaging", label: "PLATFORM_IMPERSONATION" },
    { dev: "यूट्यूब टीम से मैसेज है", rom: "youtube team se message hai", en: "message from the youtube team", label: "PLATFORM_IMPERSONATION" },
    { dev: "इंस्टाग्राम टीम से बात है", rom: "instagram team se baat hai", en: "this is the instagram team", label: "PLATFORM_IMPERSONATION" },
    { dev: "व्हाट्सएप टीम से हूँ", rom: "whatsapp team se hoon", en: "this is the whatsapp team", label: "PLATFORM_IMPERSONATION" },
  ],

  // The platform-scam "delete fee" (PLATFORM_IMPERSONATION).
  deleteFee: [
    { dev: "वीडियो डिलीट करने की फीस", rom: "video delete karne ki fees", en: "the video deletion fee", label: "PLATFORM_IMPERSONATION" },
    { dev: "डिलीट फीस", rom: "delete fee", en: "the delete fee", label: "PLATFORM_IMPERSONATION" },
  ],

  // Loan-recovery pressure (LOAN_RECOVERY).
  loan: [
    { dev: "लोन की किश्त बाकी है", rom: "loan ki kisht baaki hai", en: "the loan instalment is overdue", label: "LOAN_RECOVERY" },
    { dev: "एमआई भरनी है", rom: "emi bharni hai", en: "the emi has to be paid", label: "LOAN_RECOVERY" },
    { dev: "रिकवरी एजेंट बोल रहा हूँ", rom: "recovery agent bol raha hoon", en: "this is the recovery agent", label: "LOAN_RECOVERY" },
    { dev: "लोन ऐप से कॉल है", rom: "loan app se call hai", en: "calling from the loan app", label: "LOAN_RECOVERY" },
  ],

  // Morphing claims (MORPHING).
  morph: [
    { dev: "फोटो एडिट कर ली है", rom: "photo edit kar li hai", en: "have edited your photos", label: "MORPHING" },
    { dev: "एआई से बना दिया है", rom: "ai se bana diya hai", en: "have made it with ai", label: "MORPHING" },
    { dev: "मॉर्फ कर दिया है", rom: "morph kar diya hai", en: "have morphed it", label: "MORPHING" },
    { dev: "फोटोशॉप कर दी है", rom: "photoshop kar di hai", en: "have photoshopped it", label: "MORPHING" },
  ],

  // Repeat demands (REPEAT_DEMAND).
  repeat: [
    { dev: "जो पहले भेजा वो कम था", rom: "jo pehle bheja wo kam tha", en: "what you sent earlier was not enough", label: "REPEAT_DEMAND" },
    { dev: "और पैसे चाहिए", rom: "aur paise chahiye", en: "i need more money", label: "REPEAT_DEMAND" },
    { dev: "नए नंबर से मैसेज है", rom: "naye number se message hai", en: "messaging from a new number", label: "REPEAT_DEMAND" },
    { dev: "फिर से भेजो", rom: "phir se bhejo", en: "send again", label: "REPEAT_DEMAND" },
  ],

  // The meet-alone / more-media demand (DEMAND_SEXUAL — written without any
  // sexual vocabulary: the pressure is a meeting or more media).
  meetAlone: [
    { dev: "अकेले मिलने आओ", rom: "akela milne aao", en: "meet me alone", label: "DEMAND_SEXUAL" },
    { dev: "अकेले मिलो", rom: "akale milo", en: "come alone", label: "DEMAND_SEXUAL" },
    { dev: "मिलने आ जाओ", rom: "milne aa jao", en: "come and meet me", label: "DEMAND_SEXUAL" },
    { dev: "वीडियो कॉल करो अभी", rom: "video call karo abhi", en: "video call me now", label: "DEMAND_SEXUAL" },
  ],
  morePhotos: [
    { dev: "और तस्वीरें भेजो", rom: "aur tasveeren bhejo", en: "send more photos", label: "DEMAND_SEXUAL" },
    { dev: "एक और फोटो भेजो", rom: "ek aur photo bhejo", en: "send one more photo", label: "DEMAND_SEXUAL" },
    { dev: "वीडियो कॉल उठाओ", rom: "video call uthao", en: "pick up the video call", label: "DEMAND_SEXUAL" },
  ],

  // Bring another person (DEMAND_THIRD_PARTY — adults only, no minors).
  thirdParty: [
    { dev: "अपनी भाभी को मेरे पास लेकर आओ", rom: "apni bhabhi ko mere paas le kar aao", en: "bring your sister-in-law to me", label: "DEMAND_THIRD_PARTY" },
    { dev: "अपनी भाभी को भेजो", rom: "apni bhabhi ko bhejo", en: "send your sister-in-law to me", label: "DEMAND_THIRD_PARTY" },
    { dev: "अपने दोस्त को लेकर आओ", rom: "apne dost ko le kar aao", en: "bring your friend to me", label: "DEMAND_THIRD_PARTY" },
  ],

  // The victim's own plea (VICTIM_PLEA).
  plea: [
    { dev: "वीडियो वायरल मत करना", rom: "video viral mat karna", en: "please do not make the video viral", label: "VICTIM_PLEA" },
    { dev: "भाई प्लीज मत करो", rom: "bhai please mat karo", en: "brother please do not do this", label: "VICTIM_PLEA" },
    { dev: "मेरे पास पैसे नहीं हैं", rom: "mere paas paise nahi hain", en: "i do not have money", label: "VICTIM_PLEA" },
    { dev: "डिलीट कर दो प्लीज", rom: "delete kar do please", en: "please delete it", label: "VICTIM_PLEA" },
  ],

  // A stated age or school context (MINOR_SIGNAL) — never any sexual context;
  // used only in victim-plea and school-chat rows.
  minor: [
    { dev: "मैं कक्षा 9 में पढ़ती हूँ", rom: "main class 9 me padhti hoon", en: "i am in class 9", label: "MINOR_SIGNAL" },
    { dev: "मैं कक्षा 10 की छात्रा हूँ", rom: "main class 10 ki student hoon", en: "i am a class 10 student", label: "MINOR_SIGNAL" },
    { dev: "मैं 16 साल का हूँ", rom: "main 16 saal ka hoon", en: "i am 16 years old", label: "MINOR_SIGNAL" },
    { dev: "स्कूल का छात्र हूँ", rom: "school ka student hoon", en: "i am a school student", label: "MINOR_SIGNAL" },
  ],

  // The delete promise, the bait traded for money or a meeting. No label of
  // its own: the family decides whether it is a payment or a meet demand.
  deletePromise: [
    { dev: "वीडियो डिलीट कर दूंगा", rom: "video delete kar dunga", en: "i will delete the video" },
    { dev: "सब डिलीट कर दूंगा", rom: "sab delete kar dunga", en: "i will delete everything" },
  ],

  // Politeness / pressure seasoning, no label.
  polite: [
    { dev: "प्लीज", rom: "plz", en: "please" },
    { dev: "जल्दी", rom: "jaldi", en: "quickly" },
    { dev: "भाई", rom: "bhai", en: "bro" },
    { dev: "समझ गए", rom: "samajh gaye", en: "understood" },
  ],

  // 98XXXXXX00-style placeholders (spec's format), never a real number.
  phone: [
    { dev: "98XXXXXX00", rom: "98XXXXXX00", en: "98XXXXXX00" },
    { dev: "98XXXXXX21", rom: "98XXXXXX21", en: "98XXXXXX21" },
    { dev: "98XXXXXX67", rom: "98XXXXXX67", en: "98XXXXXX67" },
  ],

  // Synthetic UPI handles (test-domain style, like the WP93 test fixtures).
  upi: [
    { dev: "test@upi", rom: "test@upi", en: "test@upi" },
    { dev: "user@upi", rom: "user@upi", en: "user@upi" },
  ],

  // Formal notice reference numbers, invented (hard-negative variety; the
  // account number is a masked placeholder, never a real one).
  refno: [
    { dev: "संदर्भ CC-2105-08", rom: "reference CC-2105-08", en: "reference CC-2105-08" },
    { dev: "शिकायत संख्या 4521", rom: "complaint number 4521", en: "complaint number 4521" },
    { dev: "टिकट BN-778", rom: "ticket BN-778", en: "ticket BN-778" },
    { dev: "खाता XXXX1234", rom: "account XXXX1234", en: "account XXXX1234" },
    { dev: "रसीद संख्या 901", rom: "receipt 901", en: "receipt 901" },
  ],

  // Chat-register seasoning for the hard-negative families (no labels):
  // optional openers and closers, the way real chat messages vary.
  opener: [
    { dev: "अरे", rom: "arre", en: "oh" },
    { dev: "सुनो", rom: "sun", en: "listen" },
    { dev: "हैलो", rom: "hello", en: "hello" },
    { dev: "नमस्ते", rom: "namaste", en: "namaste" },
    { dev: "देखो", rom: "dekho", en: "look" },
    { dev: "वाह", rom: "wah", en: "wow" },
    { dev: "हाय", rom: "hi", en: "hi" },
    { dev: "अच्छा", rom: "accha", en: "right" },
  ],
  closer: [
    { dev: "प्लीज", rom: "plz", en: "please" },
    { dev: "धन्यवाद", rom: "thanks", en: "thank you" },
    { dev: "ठीक है?", rom: "theek hai?", en: "okay?" },
    { dev: "शुक्रिया", rom: "shukriya", en: "thanks" },
    { dev: "जल्दी", rom: "jaldi", en: "soon" },
    { dev: "ना", rom: "na", en: "alright" },
  ],
};
