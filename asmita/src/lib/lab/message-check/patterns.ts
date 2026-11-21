import { mentionsMinor } from "@/lib/chat-guards";

/*
 * WP93 (docs/lab/beta-spec.md): the code-side pattern rules for the message
 * check tool. Everything here is pure text matching, in code, on purpose: a
 * threatening message is classified the same way with or without the Sarvam
 * key, nothing is stored, and no link in the text is ever followed.
 *
 * Each rule has a stable id; the plain-language explanation for every id is
 * reviewable copy and lives in i18n under lab.message-check.pattern.<id>.
 * The ids never change shape, only new ones may be added. Matches are
 * indicators, never proof — the page says so in fixed copy — and the rules
 * are tuned for the one thing this tool reads: a pasted threatening message.
 * Everyday chat that happens to use the same words can still match, and the
 * page's copy is written so that never reads as a verdict.
 *
 * The patterns read like an abuser's message reads in India: English, mixed
 * Hindi-English and Devanagari. Devanagari alternates are written without
 * \b anchors: \b is ASCII-word based and never matches between two
 * non-ASCII characters.
 */

export const MESSAGE_CHECK_PATTERN_IDS = [
  "paymentDemand",
  "deadline",
  "threatContacts",
  "intimateClaim",
  "moreImages",
  "impersonation",
  "cryptoGiftCard",
  "foreignNumber",
] as const;

export type MessageCheckPatternId = (typeof MESSAGE_CHECK_PATTERN_IDS)[number];

// A demand for money: the core of nearly every sextortion message.
const PAYMENT_DEMAND = [
  /\b(?:pay|payment|repay|transfer|deposit|fee|fine)\b[^.!?]{0,40}\b(?:now|immediately|today|tonight|at\s*once|urgent(?:ly)?)\b/i,
  /\b(?:pay|send|transfer|deposit|give)\b[^.!?]{0,40}\b(?:me|us)\b[^.!?]{0,20}\b(?:money|cash|rupees|amount)\b/i,
  /\b(?:money|cash|payment|amount)\b[^.!?]{0,15}[\d,]{4,}/i,
  /₹\s?\d[\d,]{1,}/,
  /\b\d[\d,]{2,}\s*(?:rupees|inr)\b/i,
  /\brs\.?\s?\d[\d,]{2,}/i,
  /\b(?:rupees|inr)\s?\d[\d,]{1,}/i,
  /\b(?:pay|deposit|transfer|send)\b[^.!?]{0,20}\b(?:amount|fee|fine|payment)\b/i,
  /\bupi\s*id\b/i,
  /\b(?:upi|paytm|phonepe|gpay|google\s*pay)\b[^.!?]{0,30}\b(?:bhejo|bhej|do|dijiye|send|transfer|pay)\w*/i,
  /\b(?:paise|paisa|paison)\b[^.!?]{0,30}\b(?:bhejo|bhej|bhejunga|bhejdunga|do|dijiye|chahiye|lautao|lauta)\w*/i,
  /\b(?:bhejo|bhej|do|dijiye)\s+(?:paise|paisa)\b/i,
  /पैस[ेोई]?\s*(?:भेजो|भेजिए|दो|दीजिए|चाहिए|लौटाओ|लौटाइए)/,
  /रुपय[ेो]?\s*(?:भेजो|भेजिए|दो|दीजिए|देन[ेा]\s*होंगे)/,
];

// A countdown: urgency designed to stop the person thinking or asking anyone.
const DEADLINE = [
  /\b(?:last|final)\s+(?:warning|chance|offer|notice)\b/i,
  /\b(?:you|u)\s+(?:have|get)\s+(?:\d{1,3}|one|two|three)\s*(?:hours?|hrs?|minutes?|mins?|days?|din)\b/i,
  /\b(?:within|in|before)\s+\d{1,3}\s*(?:hours?|hrs?|minutes?|mins?|days?|din)\b/i,
  /\bby\s+(?:midnight|tonight|tomorrow|today|evening|morning|raat)\b/i,
  /\bor\s+else\b/i,
  /\btime\s+(?:is\s+)?(?:up|running\s+out|khatam)\b/i,
  /\bcountdown\b|\bdeadline\b/i,
  /\b(?:\d{1,3}|chobees|chabbis|aththalis)\s*(?:ghante|ghantey|ghant[ea])\b/i,
  /आख़िरी|आखिरी|अंतिम\s*(?:चेतावनी|मौका)/,
  /वक़्त|वक्त\s*(?:खतम|निकल\s*रहा|कम\s*है)/,
];

// The threat to expose: sending the images to family, friends or contacts is
// the pressure that carries the demand.
const THREAT_CONTACTS = [
  /\b(?:send|share|post|forward|show|publish|leak|upload|circulate)\w*\b[^.!?]{0,50}\b(?:your|ur|apni|apne|tumhari)\s*(?:family|families|family\s*members?|parents?|mother|father|mom|dad|maa|papa|friends?|friend\s*list|contacts?|contact\s*list|relatives?|boss|employer|office|colleagues?|classmates?|school|college|teachers?|neighbou?rs?|husband|wife|in\s*laws?|brother|sister|ghar\s*wal[ea]|parivaar|parivar|rishtedaar)\b/i,
  /\b(?:everyone|everybody|all)\s+(?:of\s+)?(?:your|ur|apni)\s+(?:family|friends?|contacts?|relatives?|whatsapp\s*groups?|school|college)\b/i,
  /\b(?:your|ur)\s+(?:family|parents?|relatives?|friends?|contacts?)\s+(?:will|would|shall)\s+(?:see|watch|find\s*out|know|dekh)\w*/i,
  /\b(?:sabko|sab\s*ko|ghar\s*walon\s*ko|ghar\s*wal[oei]\s*ko|family\s*ko|parents\s*ko|rishtedaaron\s*ko|dost[oei]?\s*ko)\b[^.!?]{0,40}\b(?:bhej|send|post|share|dikhao|dikha|forward|upload)\w*/i,
  /\b(?:bhej|send|post|share|forward|upload)\w*\s*d[ou]nga?\b[^.!?]{0,30}\b(?:sabko|sab\s*ko|ghar|family|everyone|sabhi)\b/i,
  /घर\s*वालों\s*को/,
  /सबको\s*(?:भेज|दिखा|सब)\w*/,
  /परिवार\s*(?:को|के\s*सामने)/,
];

// The claim of having intimate material: usually the sender has nothing, or a
// headshot pasted onto another body.
const INTIMATE_CLAIM = [
  /\bi\s+(?:have|had|'ve|got|hav)\b[^.!?]{0,50}\b(?:your|ur|the)\s*(?:nudes?|naked|topless|intimate|private|dirty|bedroom|bathroom|shower|sex(?:y|ual)?)\s*(?:photos?|photographs?|pics?|pictures?|images?|videos?|clips?|recordings?|screenshots?|screen\s*shots?|selfies?|album|collection|files?|content)\b/i,
  /\bi\s+(?:have|had|'ve|got|hav)\b[^.!?]{0,50}\b(?:your|ur)\s*(?:photos?|photographs?|pics?|pictures?|images?|videos?|clips?|recordings?|screenshots?|nudes?|naked|topless|private\s*clip)\b/i,
  /\b(?:photos?|pics?|nudes?|naked\s*photos?|videos?|clips?|recordings?)\s*(?:of|from)\s+(?:you|yourself|u)\b/i,
  /\b(?:mere|mera|meri)\s*paas\b[^.!?]{0,60}\b(?:photos?|photo|pics?|picture|pictures?|images?|video|videos?|clips?|nudes?|nude|nangi|nange|nangiya|recording|recordings?)\b/i,
  /\b(?:tumhari|tumhare|aapki|ter[ei])\s*(?:nude|nangi|naked|topless|private|intimate|bathroom|shower)\s*(?:photos?|photo|pics?|images?|picture|pictures?|video|videos?|clips?|recording)\b/i,
  /मेरे\s*पास[^।.!]{0,60}(?:तुम्हारी|तेरी|आपकी)\s*(?:तस्वीर|तस्वीरें|फोटो|फ़ोटो|वीडियो|क्लिप|रिकॉर्डिंग)/,
  /(?:तुम्हारी|तेरी)\s*(?:नंगी|नग्न|प्राइवेट|नहाती\s*हुई)\s*(?:तस्वीर|फोटो|फ़ोटो|वीडियो)/,
];

// Asking for more images or a video call: never send more — every image is
// new leverage.
const MORE_IMAGES = [
  /\b(?:send|give|share|make)\s*(?:me\s*|us\s*)?(?:one\s*more|a\s*few\s*more|more|another|new|next)\s*(?:nudes?|naked|topless|intimate|private|sexy|dirty|nude)?\s*(?:photos?|photographs?|pics?|pictures?|images?|selfies?|videos?|clips?|video\s*call)\b/i,
  /\bsend\s+(?:nudes?|me\s+nudes?|more\s+(?:photos?|pics?|nudes?|images?))\b/i,
  /\bone\s+more\s+(?:pic|photo|picture|video|selfie)\b/i,
  /\b(?:send|bhejo|bhej)\s*(?:me\s*)?(?:a\s*)?(?:nude|nudes|naked|nangi|topless|nangiya|full\s*nude)\b/i,
  /\b(?:aur|more|ek\s*aur)\s*(?:photos?|photo|pics?|picture|pictures?|nudes?|video|videos?|clips?|selfie|selfies?)\s*(?:bhejo|bhej|send|do|dijiye)\b/i,
  /(?:और|एक\s*और)\s*(?:फोटो|फ़ोटो|तस्वीर|नंगी\s*तस्वीर|वीडियो|सेल्फ़ी|सेल्फी)\s*(?:भेजो|भेजिए|दो|दीजिए)/,
  /(?:नंगी|न्यूड)\s*(?:फोटो|तस्वीर|वीडियो)\s*(?:भेजो|भेजिए|दो|दीजिए)/,
];

// Posing as the police, a government office or a platform: real police never
// demand money over chat; platforms never ask for payments or images this way.
// Only role-claims match — someone writing that they *went to* the police
// must never look like an impersonation.
const IMPERSONATION = [
  /\b(?:delhi\s*police|cyber\s*police|cyber\s*cell|cybercrime\s+(?:police|department|bureau|branch|cell)|cyber\s*crime\s+(?:police|department|bureau|branch|cell)|crime\s*branch|c\.?b\.?i)\b/i,
  /\b(?:this\s+is|i\s+am|speaking|calling|calling\s+you|writing)\b[^.!?]{0,30}\b(?:the\s+)?(?:police|police\s+officer|officer|inspector|sub[-\s]?inspector|constable|policeman|cyber\s*cell|department)\b/i,
  /\bdigital\s*arrest\b|\barrest\s*warrant\b|\bwarrant\s+(?:has\s+been|is|will\s+be)\s+(?:issued|out)\b/i,
  /\byour\s+(?:arrest|detention|summons?)\b/i,
  /\b(?:case|fir|complaint)\s+(?:has\s+been|have\s+been|will\s+be|is\s+being)\s+(?:filed|registered|booked|logged)\b/i,
  /\b(?:whatsapp|instagram|facebook|meta|telegram|snapchat|youtube|google|bank)\s+(?:team|support|security|safety|officials?|verification|verification\s*team|help\s*team)\b/i,
  /\bon\s+behalf\s+of\s+(?:whatsapp|instagram|facebook|meta|telegram|snapchat|youtube|google)\b/i,
  /\b(?:official|security|authorised|authorized)\s+(?:message|notification|notice|alert|warning|communication)\s+from\s+(?:whatsapp|instagram|facebook|meta|telegram|snapchat|youtube|google)\b/i,
  /\b(?:account|profile|number)\s+(?:will\s+be|has\s+been|is\s+going\s+to\s+be)\s+(?:banned|suspended|blocked|terminated|deactivated|permanently\s+(?:blocked|removed))\b/i,
  /\bverification\s+(?:team|is\s+required|required)\b/i,
  /साइबर\s*सेल|साइबर\s*क्राइम/,
  /डिजिटल\s*अरेस्ट|डिजिटल\s*अर्रेस्ट/,
  /गिरफ़्तारी|गिरफ्तारी|गिरफ़्तार|गिरफ्तार/,
  /समन\s*(?:जारी|आया|भेजा)/,
];

// Payment rails chosen because they are hard to trace and impossible to reverse.
const CRYPTO_GIFTCARD = [
  /\b(?:bitcoin|bitcoins|btc|ethereum|eth|usdt|tether|usdc|cryptocurrenc(?:y|ies))\b/i,
  /\bwallet\s*(?:address|id)\b/i,
  /\bgift\s*cards?\b|\bgoogle\s*play\s*(?:cards?|code|gift)?\b|\bitunes\s*(?:card|gift)?\b|\bamazon\s*(?:gift\s*)?(?:card|voucher)\b|\bplay\s*store\s*(?:card|voucher|gift)\b|\bflipkart\s*(?:gift\s*)?(?:card|voucher)\b|\bsteam\s*(?:card|gift)?\b/i,
  /\b(?:pay|payment|send|buy|purchase|load)\b[^.!?]{0,30}\b(?:gift\s*card|google\s*play|bitcoin|btc|usdt|crypto|voucher)\b/i,
  /बिटकॉइन|क्रिप्टो|गिफ्ट\s*कार्ड|गूगल\s*प्ले\s*कार्ड|वाउचर/,
];

// Foreign-number pressure: many campaigns are run from abroad on purpose,
// and a non-Indian country code is part of the act. +91 (India) never matches.
const FOREIGN_NUMBER = [
  /\+\s*(?!91[\s-]?)[1-9]\d{0,2}(?:[\s-]?\d{2,6}){1,4}/,
  /\b00(?!91)\d{9,12}\b/,
  /\b(?:foreign|abroad|overseas)\s+number\b|\b(?:uk|us|usa|dubai|canada|australia)\s+number\b/i,
  /\b(?:whatsapp|call|text|message|msg|contact)\w*\s+(?:me\s+)?(?:on|at)\s*\+\s*(?!91)/i,
  /\b(?:videshi|videsh|bahar|bahar\s*ka|bhar\s*ka)\s*(?:number|phone|call)\b/i,
  /\b(?:bahar|videsh)\s*se\s*(?:call|missed\s*call|message|msg)\b/i,
  /विदेशी\s*नंबर|विदेश\s*से\s*(?:कॉल|मिस्ड\s*कॉल|मैसेज)/,
];

const RULES: ReadonlyArray<{ id: MessageCheckPatternId; patterns: RegExp[] }> = [
  { id: "paymentDemand", patterns: PAYMENT_DEMAND },
  { id: "deadline", patterns: DEADLINE },
  { id: "threatContacts", patterns: THREAT_CONTACTS },
  { id: "intimateClaim", patterns: INTIMATE_CLAIM },
  { id: "moreImages", patterns: MORE_IMAGES },
  { id: "impersonation", patterns: IMPERSONATION },
  { id: "cryptoGiftCard", patterns: CRYPTO_GIFTCARD },
  { id: "foreignNumber", patterns: FOREIGN_NUMBER },
];

/**
 * The matched rule ids, once each, in the canonical order above. Only code
 * runs here: the same message always gives the same result, key or no key.
 */
export function checkMessagePatterns(text: string): MessageCheckPatternId[] {
  return RULES.filter((rule) => rule.patterns.some((pattern) => pattern.test(text))).map((rule) => rule.id);
}

/**
 * The minor pathway (beta-spec WP93): a stated age under 18 anywhere in the
 * pasted text sends the person to /minor-support before anything runs. The
 * detection is the home chat's own minor classifier, so the two tools route
 * exactly the same phrases: a self-report ("I am 15") and a third-person
 * statement about the person shown ("my daughter is 15"). The Lab spec's
 * under-18 rule errs towards the child-safety path, so both count here.
 */
export function routeToMinorSupport(text: string) {
  return mentionsMinor(text);
}
