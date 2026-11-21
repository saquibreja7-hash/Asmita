import { SEXTORTION_LABELS, type SextortionLabel } from "@/lib/lab/sextortion/taxonomy";

/*
 * WP116 (docs/research/research-tools-spec.md, Track D): the sextortion
 * lexicon, per taxonomy label.
 *
 * Every term is matched as a substring against the NORMALISED views of a
 * pasted message (see normalise.ts):
 * - script "devanagari" terms are searched in the original-script view;
 * - script "romanised" and "english" terms are searched in the latin views
 *   (a Devanagari message never contains them; its own script view is
 *   covered by its Devanagari terms).
 *
 * Sources: the `source` field names the coverage entry in
 * docs/research/2026-11-sources.md §D that documents the pattern the term
 * belongs to (ids like "patrika-2023-sirohi"). The sources file notes that
 * its quotes were extracted by a summarising fetch and must be checked
 * against the article before user-facing use: a source tag here therefore
 * means "this pattern is documented by this coverage", not "verified
 * verbatim". Devanagari entries not quoted in any source, every English
 * entry we worded ourselves, and EVERY romanised (Hinglish) entry — no
 * verbatim romanised threat text exists in an authoritative source — are
 * tagged "derived": our rendering, written for this classifier, reviewable
 * here.
 *
 * No real people, phone numbers or URLs appear in these terms. Platform
 * names (YouTube, WhatsApp, UPI...) appear because the owner-approved spec
 * documents them as part of the impersonation and payment patterns itself.
 */

export type LexiconScript = "devanagari" | "romanised" | "english";

/** A source id from docs/research/2026-11-sources.md §D, or "derived". */
export type LexiconSource =
  | "aljazeera-2022"
  | "theprint-2022-mewat"
  | "patrika-2023-sirohi"
  | "tribune-2025"
  | "fpj-2023-cbi"
  | "amarujala-2025-bhopal"
  | "amarujala-2026-agra"
  | "amarujala-2025-gorakhpur"
  | "quint-2025-loanapp"
  | "lokmat-loanapp"
  | "dh-loanapp"
  | "aajtak-2025"
  | "derived";

export interface LexiconEntry {
  /** The surface form, lowercase for latin scripts. */
  term: string;
  script: LexiconScript;
  source: LexiconSource;
}

export type LexiconLabel = Exclude<SextortionLabel, "NOT_THREAT">;

/** Every label except NOT_THREAT has terms; NOT_THREAT is the absence of them. */
export const SEXTORTION_LEXICON: Readonly<Record<LexiconLabel, readonly LexiconEntry[]>> = {
  THREAT_EXPOSE: [
    { term: "वायरल कर दूंगा", script: "devanagari", source: "amarujala-2026-agra" },
    { term: "वायरल करने की धमकी", script: "devanagari", source: "patrika-2023-sirohi" },
    { term: "सबको भेज दूंगा", script: "devanagari", source: "derived" },
    { term: "सबको दिखा दूंगा", script: "devanagari", source: "derived" },
    { term: "अपलोड कर दूंगा", script: "devanagari", source: "derived" },
    { term: "सबको भेज दूँगा", script: "devanagari", source: "derived" },
    { term: "viral kar dunga", script: "romanised", source: "derived" },
    { term: "viral kar doonga", script: "romanised", source: "derived" },
    { term: "viral kar denge", script: "romanised", source: "derived" },
    { term: "viral kar raha hoon", script: "romanised", source: "derived" },
    { term: "viral kar diya", script: "romanised", source: "derived" },
    { term: "viral karwa dunga", script: "romanised", source: "derived" },
    { term: "sabko bhej dunga", script: "romanised", source: "derived" },
    { term: "sabko bhejdunga", script: "romanised", source: "derived" },
    { term: "sabko dikha dunga", script: "romanised", source: "derived" },
    { term: "sabko dikha doonga", script: "romanised", source: "derived" },
    { term: "upload kar dunga", script: "romanised", source: "derived" },
    { term: "post kar dunga", script: "romanised", source: "derived" },
    { term: "forward kar dunga", script: "romanised", source: "derived" },
    { term: "will make it viral", script: "english", source: "derived" },
    { term: "make it viral", script: "english", source: "derived" },
    { term: "will send it to everyone", script: "english", source: "derived" },
    { term: "will upload it", script: "english", source: "derived" },
    { term: "will share it with everyone", script: "english", source: "derived" },
    { term: "will leak it", script: "english", source: "derived" },
    { term: "goes viral", script: "english", source: "derived" },
  ],
  AUDIENCE_FAMILY: [
    { term: "घर वालों को", script: "devanagari", source: "derived" },
    { term: "घर वालो को", script: "devanagari", source: "derived" },
    { term: "परिवार को", script: "devanagari", source: "derived" },
    { term: "रिश्तेदारों को", script: "devanagari", source: "derived" },
    { term: "फैमिली ग्रुप में", script: "devanagari", source: "derived" },
    { term: "माँ पापा को", script: "devanagari", source: "derived" },
    { term: "ghar walon ko", script: "romanised", source: "derived" },
    { term: "gharwalon", script: "romanised", source: "derived" },
    { term: "ghar walo ko", script: "romanised", source: "derived" },
    { term: "ghar vale ko", script: "romanised", source: "derived" },
    { term: "family ko", script: "romanised", source: "derived" },
    { term: "family group me", script: "romanised", source: "derived" },
    { term: "sab relatives ko", script: "romanised", source: "derived" },
    { term: "contact list", script: "romanised", source: "derived" },
    { term: "contacts ko bhej", script: "romanised", source: "derived" },
    { term: "your family", script: "english", source: "derived" },
    { term: "your relatives", script: "english", source: "derived" },
    { term: "your contacts", script: "english", source: "derived" },
    { term: "your contact list", script: "english", source: "derived" },
    { term: "family group", script: "english", source: "derived" },
    { term: "your parents", script: "english", source: "derived" },
  ],
  AUDIENCE_PUBLIC: [
    { term: "सोशल मीडिया पर", script: "devanagari", source: "amarujala-2026-agra" },
    { term: "यूट्यूब पर", script: "devanagari", source: "derived" },
    { term: "फेसबुक पर", script: "devanagari", source: "derived" },
    { term: "इंस्टाग्राम पर", script: "devanagari", source: "derived" },
    { term: "सबके सामने", script: "devanagari", source: "derived" },
    { term: "social media par", script: "romanised", source: "derived" },
    { term: "social media pe", script: "romanised", source: "derived" },
    { term: "youtube par", script: "romanised", source: "derived" },
    { term: "youtube pe", script: "romanised", source: "derived" },
    { term: "facebook par", script: "romanised", source: "derived" },
    { term: "instagram par", script: "romanised", source: "derived" },
    { term: "sabke samne", script: "romanised", source: "derived" },
    { term: "duniya bhar me", script: "romanised", source: "derived" },
    { term: "on social media", script: "english", source: "derived" },
    { term: "on youtube", script: "english", source: "derived" },
    { term: "on facebook", script: "english", source: "derived" },
    { term: "on instagram", script: "english", source: "derived" },
    { term: "in public", script: "english", source: "derived" },
    { term: "everyone will see", script: "english", source: "derived" },
    { term: "post it online", script: "english", source: "derived" },
  ],
  DEMAND_MONEY: [
    { term: "पैसे भेजो", script: "devanagari", source: "derived" },
    { term: "पैसे भेज दो", script: "devanagari", source: "derived" },
    { term: "रुपये जमा करो", script: "devanagari", source: "derived" },
    { term: "अलग-अलग किश्तों में", script: "devanagari", source: "patrika-2023-sirohi" },
    { term: "पैसे ट्रांसफर करो", script: "devanagari", source: "derived" },
    { term: "पैसे मंगाता हूँ", script: "devanagari", source: "derived" },
    { term: "paise bhejo", script: "romanised", source: "derived" },
    { term: "paise bhej", script: "romanised", source: "derived" },
    { term: "paisa bhej do", script: "romanised", source: "derived" },
    { term: "paison ki zarurat", script: "romanised", source: "derived" },
    { term: "upi kar", script: "romanised", source: "derived" },
    { term: "upi kar do", script: "romanised", source: "derived" },
    { term: "amount transfer karo", script: "romanised", source: "derived" },
    { term: "paise jama karo", script: "romanised", source: "derived" },
    { term: "kishto me bhejo", script: "romanised", source: "derived" },
    { term: "rupees bhejo", script: "romanised", source: "derived" },
    { term: "phonepe kar do", script: "romanised", source: "derived" },
    { term: "gpay kar do", script: "romanised", source: "derived" },
    { term: "send money", script: "english", source: "derived" },
    { term: "transfer the money", script: "english", source: "derived" },
    { term: "bank deposit", script: "english", source: "aljazeera-2022" },
    { term: "pay the amount", script: "english", source: "derived" },
    { term: "in instalments", script: "english", source: "patrika-2023-sirohi" },
    { term: "send the payment", script: "english", source: "derived" },
  ],
  DEMAND_SEXUAL: [
    { term: "अकेले मिलने आओ", script: "devanagari", source: "amarujala-2025-bhopal" },
    { term: "वीडियो डिलीट कर दूंगा", script: "devanagari", source: "amarujala-2025-bhopal" },
    { term: "अकेले मिलो", script: "devanagari", source: "derived" },
    { term: "अकेली मिलने आओ", script: "devanagari", source: "derived" },
    { term: "वीडियो कॉल करो", script: "devanagari", source: "derived" },
    { term: "और तस्वीरें भेजो", script: "devanagari", source: "derived" },
    { term: "akela milne aao", script: "romanised", source: "derived" },
    { term: "video delete kar dunga", script: "romanised", source: "derived" },
    { term: "milne aao to delete kar dunga", script: "romanised", source: "derived" },
    { term: "akale milne aa", script: "romanised", source: "derived" },
    { term: "akeli milne aao", script: "romanised", source: "derived" },
    { term: "milne aao", script: "romanised", source: "derived" },
    { term: "video call karo", script: "romanised", source: "derived" },
    { term: "video call karlo", script: "romanised", source: "derived" },
    { term: "aur photo bhejo", script: "romanised", source: "derived" },
    { term: "ek aur photo bhejo", script: "romanised", source: "derived" },
    { term: "meet me alone", script: "english", source: "derived" },
    { term: "come alone", script: "english", source: "derived" },
    { term: "come and meet me", script: "english", source: "derived" },
    { term: "send more photos", script: "english", source: "derived" },
    { term: "one more photo", script: "english", source: "derived" },
    { term: "video call me", script: "english", source: "derived" },
  ],
  DEMAND_THIRD_PARTY: [
    { term: "अपनी भाभी को मेरे पास लेकर आओ", script: "devanagari", source: "amarujala-2026-agra" },
    { term: "अपनी भाभी को भेजो", script: "devanagari", source: "derived" },
    { term: "अपने दोस्त को लेकर आओ", script: "devanagari", source: "derived" },
    { term: "अपनी बहन को लाओ", script: "devanagari", source: "derived" },
    { term: "bhabhi ko le kar aao", script: "romanised", source: "derived" },
    { term: "bhabhi ko mere paas lao", script: "romanised", source: "derived" },
    { term: "apni bhabhi ko le kar aao", script: "romanised", source: "derived" },
    { term: "apni bhabhi ko mere paas", script: "romanised", source: "derived" },
    { term: "apni bhabhi ko bhejo", script: "romanised", source: "derived" },
    { term: "dost ko le kar aao", script: "romanised", source: "derived" },
    { term: "friend ko mere paas bhejo", script: "romanised", source: "derived" },
    { term: "bring your sister-in-law", script: "english", source: "derived" },
    { term: "bring her to me", script: "english", source: "derived" },
    { term: "send your friend to me", script: "english", source: "derived" },
    { term: "bring your friend along", script: "english", source: "derived" },
  ],
  DEADLINE: [
    { term: "24 घंटे", script: "devanagari", source: "derived" },
    { term: "आज रात तक", script: "devanagari", source: "derived" },
    { term: "अभी के अभी", script: "devanagari", source: "derived" },
    { term: "आधे घंटे में", script: "devanagari", source: "derived" },
    { term: "अंतिम चेतावनी", script: "devanagari", source: "derived" },
    { term: "24 ghante", script: "romanised", source: "derived" },
    { term: "24 ghante me", script: "romanised", source: "derived" },
    { term: "ghante ke andar", script: "romanised", source: "derived" },
    { term: "ghantey ke ghantey", script: "romanised", source: "derived" },
    { term: "aadhe ghante me", script: "romanised", source: "derived" },
    { term: "aaj raat tak", script: "romanised", source: "derived" },
    { term: "abhi ke abhi", script: "romanised", source: "derived" },
    { term: "kal subah tak", script: "romanised", source: "derived" },
    { term: "within 24 hours", script: "english", source: "aljazeera-2022" },
    { term: "within half an hour", script: "english", source: "amarujala-2025-gorakhpur" },
    { term: "by tonight", script: "english", source: "derived" },
    { term: "right now", script: "english", source: "derived" },
    { term: "last warning", script: "english", source: "derived" },
    { term: "or else", script: "english", source: "derived" },
    { term: "final warning", script: "english", source: "derived" },
  ],
  AUTHORITY_IMPERSONATION: [
    { term: "थानेदार", script: "devanagari", source: "patrika-2023-sirohi" },
    { term: "साइबर सेल", script: "devanagari", source: "derived" },
    { term: "साइबर क्राइम", script: "devanagari", source: "derived" },
    { term: "सीबीआई अधिकारी", script: "devanagari", source: "derived" },
    { term: "एफआईआर हो जाएगी", script: "devanagari", source: "derived" },
    { term: "गिरफ्तारी हो जाएगी", script: "devanagari", source: "derived" },
    { term: "केस बंद", script: "devanagari", source: "derived" },
    { term: "दिल्ली पुलिस", script: "devanagari", source: "derived" },
    { term: "वारंट निकल गया", script: "devanagari", source: "derived" },
    { term: "thanedar", script: "romanised", source: "derived" },
    { term: "thaneedar", script: "romanised", source: "derived" },
    { term: "cyber cell se", script: "romanised", source: "derived" },
    { term: "crime branch se", script: "romanised", source: "derived" },
    { term: "cbi officer", script: "romanised", source: "derived" },
    { term: "ips officer", script: "romanised", source: "derived" },
    { term: "fir ho jayegi", script: "romanised", source: "derived" },
    { term: "girftari ho jayegi", script: "romanised", source: "derived" },
    { term: "case band", script: "romanised", source: "derived" },
    { term: "delhi police crime branch", script: "romanised", source: "derived" },
    { term: "arrest warrant", script: "romanised", source: "derived" },
    { term: "cyber cell", script: "english", source: "theprint-2022-mewat" },
    { term: "cbi officer", script: "english", source: "fpj-2023-cbi" },
    { term: "delhi police", script: "english", source: "tribune-2025" },
    { term: "crime branch", script: "english", source: "derived" },
    { term: "you will be arrested", script: "english", source: "derived" },
    { term: "an fir will be filed", script: "english", source: "derived" },
    { term: "arrest warrant", script: "english", source: "derived" },
  ],
  PLATFORM_IMPERSONATION: [
    { term: "यूट्यूब मैनेजर", script: "devanagari", source: "patrika-2023-sirohi" },
    { term: "यूट्यूब टीम से", script: "devanagari", source: "derived" },
    { term: "इंस्टाग्राम टीम", script: "devanagari", source: "derived" },
    { term: "व्हाट्सएप टीम", script: "devanagari", source: "derived" },
    { term: "यूट्यूब कर्मचारी", script: "devanagari", source: "derived" },
    { term: "youtube manager se", script: "romanised", source: "derived" },
    { term: "youtube team se", script: "romanised", source: "derived" },
    { term: "instagram team se", script: "romanised", source: "derived" },
    { term: "whatsapp team se", script: "romanised", source: "derived" },
    { term: "delete fee", script: "romanised", source: "derived" },
    { term: "delete karne ka charge", script: "romanised", source: "derived" },
    { term: "verification team", script: "romanised", source: "derived" },
    { term: "account band ho jayega", script: "romanised", source: "derived" },
    { term: "youtube employee", script: "english", source: "tribune-2025" },
    { term: "youtube manager", script: "english", source: "patrika-2023-sirohi" },
    { term: "delete fee", script: "english", source: "fpj-2023-cbi" },
    { term: "the youtube team", script: "english", source: "derived" },
    { term: "instagram support team", script: "english", source: "derived" },
    { term: "whatsapp official", script: "english", source: "derived" },
    { term: "to delete the video", script: "english", source: "fpj-2023-cbi" },
  ],
  LOAN_RECOVERY: [
    { term: "लोन की किश्त", script: "devanagari", source: "derived" },
    { term: "रिकवरी एजेंट", script: "devanagari", source: "derived" },
    { term: "क़र्ज़ चुकाओ", script: "devanagari", source: "derived" },
    { term: "एमआई बाकी है", script: "devanagari", source: "derived" },
    { term: "लोन ऐप से", script: "devanagari", source: "derived" },
    { term: "loan ki kisht", script: "romanised", source: "derived" },
    { term: "emi baaki hai", script: "romanised", source: "derived" },
    { term: "recovery agent", script: "romanised", source: "derived" },
    { term: "loan app se", script: "romanised", source: "derived" },
    { term: "due amount bhejo", script: "romanised", source: "derived" },
    { term: "loan repayment karo", script: "romanised", source: "derived" },
    { term: "emi jama karo", script: "romanised", source: "derived" },
    { term: "loan app", script: "english", source: "quint-2025-loanapp" },
    { term: "recovery agent", script: "english", source: "dh-loanapp" },
    { term: "your emi is overdue", script: "english", source: "derived" },
    { term: "repay the loan", script: "english", source: "derived" },
    { term: "overdue amount", script: "english", source: "derived" },
    { term: "loan repayment", script: "english", source: "derived" },
  ],
  CLAIM_HAS_MEDIA: [
    { term: "मेरे पास तुम्हारा वीडियो है", script: "devanagari", source: "derived" },
    { term: "मेरे पास तुम्हारी तस्वीरें हैं", script: "devanagari", source: "derived" },
    { term: "रिकॉर्डिंग मेरे पास है", script: "devanagari", source: "derived" },
    { term: "क्लिप मेरे पास है", script: "devanagari", source: "derived" },
    { term: "वीडियो रिकॉर्ड हो गया", script: "devanagari", source: "derived" },
    { term: "स्क्रीनशॉट ले लिए", script: "devanagari", source: "derived" },
    { term: "mere paas tumhara video hai", script: "romanised", source: "derived" },
    { term: "mere paas tumhari video hai", script: "romanised", source: "derived" },
    { term: "recording mere paas hai", script: "romanised", source: "derived" },
    { term: "clip saved hai", script: "romanised", source: "derived" },
    { term: "screenshot le liya", script: "romanised", source: "derived" },
    { term: "video record ho gaya", script: "romanised", source: "derived" },
    { term: "video mere paas hai", script: "romanised", source: "derived" },
    { term: "i have your video", script: "english", source: "derived" },
    { term: "the recording is with me", script: "english", source: "derived" },
    { term: "i have the clip", script: "english", source: "derived" },
    { term: "i have the screenshots", script: "english", source: "derived" },
    { term: "i have proof", script: "english", source: "aajtak-2025" },
    { term: "the clip is saved", script: "english", source: "derived" },
  ],
  MORPHING: [
    { term: "फोटो एडिट कर दी", script: "devanagari", source: "derived" },
    { term: "मॉर्फ कर दिया", script: "devanagari", source: "derived" },
    { term: "एआई से बनाई", script: "devanagari", source: "derived" },
    { term: "फोटो एडिट करके", script: "devanagari", source: "derived" },
    { term: "photo edit kar di", script: "romanised", source: "derived" },
    { term: "photo edit karke", script: "romanised", source: "derived" },
    { term: "morph kar dunga", script: "romanised", source: "derived" },
    { term: "morph kar diya", script: "romanised", source: "derived" },
    { term: "ai se photo bana", script: "romanised", source: "derived" },
    { term: "photoshop kar diya", script: "romanised", source: "derived" },
    { term: "photo shopped", script: "english", source: "derived" },
    { term: "morphed photo", script: "english", source: "dh-loanapp" },
    { term: "edited your photo", script: "english", source: "derived" },
    { term: "made with ai", script: "english", source: "derived" },
    { term: "deepfake", script: "english", source: "derived" },
  ],
  REPEAT_DEMAND: [
    { term: "और पैसे चाहिए", script: "devanagari", source: "derived" },
    { term: "जो पहले भेजा वो कम था", script: "devanagari", source: "derived" },
    { term: "फिर से भेजो", script: "devanagari", source: "derived" },
    { term: "नए नंबर से", script: "devanagari", source: "derived" },
    { term: "aur paise chahiye", script: "romanised", source: "derived" },
    { term: "aur paisa bhejo", script: "romanised", source: "derived" },
    { term: "jo pehle bheja wo kam tha", script: "romanised", source: "derived" },
    { term: "phir se bhejo", script: "romanised", source: "derived" },
    { term: "abhi aur bhejo", script: "romanised", source: "derived" },
    { term: "naye number se message", script: "romanised", source: "derived" },
    { term: "naya number se", script: "romanised", source: "derived" },
    { term: "send more", script: "english", source: "derived" },
    { term: "that was not enough", script: "english", source: "derived" },
    { term: "the last payment was too little", script: "english", source: "derived" },
    { term: "i need more money", script: "english", source: "derived" },
    { term: "paying again", script: "english", source: "derived" },
  ],
  VICTIM_PLEA: [
    { term: "वीडियो वायरल मत करना", script: "devanagari", source: "amarujala-2025-gorakhpur" },
    { term: "भाई प्लीज", script: "devanagari", source: "amarujala-2025-gorakhpur" },
    { term: "प्लीज मत करो", script: "devanagari", source: "derived" },
    { term: "मेरे पास पैसे नहीं हैं", script: "devanagari", source: "derived" },
    { term: "डिलीट कर दो प्लीज", script: "devanagari", source: "derived" },
    { term: "कृपया वीडियो हटा दो", script: "devanagari", source: "derived" },
    { term: "viral mat karna", script: "romanised", source: "derived" },
    { term: "video viral mat karna", script: "romanised", source: "derived" },
    { term: "bhai please", script: "romanised", source: "derived" },
    { term: "please mat karo", script: "romanised", source: "derived" },
    { term: "please delete kar do", script: "romanised", source: "derived" },
    { term: "mere paas paise nahi hain", script: "romanised", source: "derived" },
    { term: "please do not share it", script: "english", source: "derived" },
    { term: "please do not send it", script: "english", source: "derived" },
    { term: "i do not have money", script: "english", source: "derived" },
    { term: "please delete it", script: "english", source: "derived" },
  ],
  MINOR_SIGNAL: [
    { term: "मैं कक्षा 9 में पढ़ती हूँ", script: "devanagari", source: "derived" },
    { term: "मैं कक्षा 9 में पढ़ता हूँ", script: "devanagari", source: "derived" },
    { term: "स्कूल की छात्रा हूँ", script: "devanagari", source: "derived" },
    { term: "मैं 15 साल की हूँ", script: "devanagari", source: "derived" },
    { term: "मैं 16 साल का हूँ", script: "devanagari", source: "derived" },
    { term: "main class 9 me padhti hoon", script: "romanised", source: "derived" },
    { term: "main class 9 me padhta hoon", script: "romanised", source: "derived" },
    { term: "school ka student hoon", script: "romanised", source: "derived" },
    { term: "school ki student hoon", script: "romanised", source: "derived" },
    { term: "main 15 saal ki hoon", script: "romanised", source: "derived" },
    { term: "main 16 saal ka hoon", script: "romanised", source: "derived" },
    { term: "i am in class 9", script: "english", source: "derived" },
    { term: "i am a school student", script: "english", source: "derived" },
    { term: "i am 15", script: "english", source: "derived" },
    { term: "i am 16 years old", script: "english", source: "derived" },
    { term: "i am 17", script: "english", source: "derived" },
  ],
};

/** The lexicon's labels, in canonical order (every label except NOT_THREAT). */
export const LEXICON_LABELS: readonly LexiconLabel[] = SEXTORTION_LABELS.filter(
  (label): label is LexiconLabel => label !== "NOT_THREAT",
);

/*
 * Which labels have at least one term present in the normalised views of a
 * message. Devanagari terms are looked up in the original-script view,
 * romanised and english terms in the latin views (for a latin-only message
 * the two views coincide). A hit is a feature and a sentence for "What we
 * noticed", never a verdict on its own (WP117 requires a core label plus a
 * supporting one before anything is called a likely threat).
 */
export function lexiconHits(views: { normalised: string; romanised: string }): LexiconLabel[] {
  const hits: LexiconLabel[] = [];
  for (const label of LEXICON_LABELS) {
    const present = SEXTORTION_LEXICON[label].some((entry) =>
      entry.script === "devanagari" ? views.normalised.includes(entry.term) : views.romanised.includes(entry.term),
    );
    if (present) hits.push(label);
  }
  return hits;
}
