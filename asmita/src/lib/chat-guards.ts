import { containsUrlLikeText } from "@/lib/url-like-text";
import { PROMPT_CANARY } from "@/lib/chat-knowledge";

/*
 * Code-side guards for the home page chat (/api/chat). Everything here runs
 * BEFORE Sarvam's model is called, so routing decisions about minors, crisis,
 * misuse, personal data and links are made by code, not by the model. The
 * replies themselves live in i18n (chat.reply.*) and the route picks them.
 *
 * Detection is deliberately layered:
 * - SELF patterns are anchored to first-person words ("I am 15", "meri umar
 *   15 saal"). A missed phrase still reaches the model, whose instructions
 *   carry the same pathways.
 * - Third-person patterns fire when the under-18 signal attaches to someone
 *   else ("my daughter is 15"), so a parent or friend is answered as such
 *   and never shown the adult self-filing flow.
 */

export type ChatGuard =
  | "crisis"
  | "minor-self"
  | "minor-other"
  | "misuse"
  | "personal-data"
  | "link";

/*
 * Allowlist for what model output may keep: only the pages and numbers the
 * site itself publishes (the get-help page, the i18n copy and the Saathi
 * knowledge base). Everything else is stripped before a reply reaches her.
 */
const ALLOWED_REPLY_HOSTS = ["meriasmita.org", "takeitdown.ncmec.org", "cybercrime.gov.in", "nalsa.gov.in", "stopncii.org"];

// CHILDLINE 1098, emergency 112, women 181, cyber 1930, iCALL 9152987821,
// Asmita's own helpline +91 80654 80788 (with and without the country code).
const ALLOWED_REPLY_NUMBERS = ["1098", "112", "181", "1930", "9152987821", "8065480788", "918065480788"];

function digitsOnly(value: string) {
  return value.replace(/\D+/g, "");
}

function isAllowedNumber(value: string) {
  return ALLOWED_REPLY_NUMBERS.includes(digitsOnly(value));
}

// ---------------------------------------------------------------- crisis ----

// Self-harm and suicide mentions, answered in code with the helpline numbers
// the site already publishes (iCALL 9152987821, 112). Negative lookbehinds
// keep plain denials ("I do not want to die") from triggering.
const CRISIS = [
  /\bsuicid\w*/i,
  /(?<!n['’]t\s)(?<!not\s)\b(?:kill|hurt|harm)\s+myself\b/i,
  /(?<!n['’]t\s)(?<!not\s)\bend(?:ing)?\s+(?:my|my\s+own)\s+life\b/i,
  /\b(?:take|taking)\s+my\s+own\s+life\b/i,
  /(?<!n['’]t\s)(?<!not\s)\bwant\s+to\s+die\b/i,
  /\bfeel\s+like\s+dying\b/i,
  /\b(?:don['’]t|do\s+not|dont)\s+want\s+to\s+(?:live|be\s+here|be\s+alive|go\s+on)\b/i,
  /\bno\s+(?:reason|point)\s+(?:to|in)\s+(?:living|life|being\s+alive)\b/i,
  /\bnot\s+worth\s+living\b/i,
  /\bself[-\s]?h(?:arm|urt)\b/i,
  /आत्महत्या/,
  /खुदकुशी/,
  /खुद\s*को\s*(?:मारना|मारने|खत्म)/,
  /जान\s*देना\s*(?:चाहती|चाहता|चाहते|की\s*सोच)/,
  /जीना\s*नहीं\s*(?:चाहती|चाहता|चाहते)/,
  /जीने\s*का\s*मन\s*नहीं/,
  /(?<!नहीं\s)(?<!नहीं\s*)मरन[ाे]?\s*(?:चाहती|चाहता|चाहते)/,
  /\b(?:aatmahatya|aatmhatya|khudkushi|khudkushi)\b/i,
  /\bkhud\s*ko\s*(?:kuch\s+kar|maar|marna)\b/i,
  /(?<!nahi\s)(?<!nai\s)\bmarna\s*(?:ka\s*mann|chahti|chahta|chahte)\b/i,
  /\bjeena\s+nahi\b/i,
];

export function mentionsCrisis(text: string) {
  return CRISIS.some((pattern) => pattern.test(text));
}

// ---------------------------------------------------------------- minors ----

// Words that can attach the age to another person ("my daughter", "uski
// beti"). The plural "students" is included but the singular is not, so a
// self-report like "class 9 student hoon" is not mistaken for one.
const THIRD_PERSON_WORDS =
  /\b(?:daughters?|sons?|children|child|kids?|students|girl|woman|boy|man|friend|friends|sisters?|brothers?|nieces?|nephews?|cousins?|wives|wife|husbands?|ex|girlfriends?|boyfriends?|granddaughters?|grandsons?|neighbou?rs?|classmates?|beti|beta|bachche|bachcha|bachchi|ladki|ladka|dost|behen|bhai|bahan|bhaiya|bhatije|bhatiji)\b/i;
const THIRD_PERSON_WORDS_HI = /(?:बेटी|बेटा|बच्चा|बच्ची|बच्चों|लड़की|लड़का|दोस्त|बहन|भाई|भतीजा|भतीजी|पोता|पोती|छात्रा|छात्र)/;

function mentionsSomeoneElse(text: string) {
  return THIRD_PERSON_WORDS.test(text) || THIRD_PERSON_WORDS_HI.test(text);
}

// First-person-anchored under-18 signals: safe to trust even when the
// message also names someone else.
const UNDER_18_SELF_ANCHORED = [
  // "I am 17 so...", "I'm 15", "my age is 14": any number under 18 after
  // these words, unless what follows shows it is not an age ("5 minutes").
  /\b(?:i\s+am|i['’]m|im|my\s+age\s+is)\s*(?:1[0-7]|[5-9])(?!\d)(?![.,]\d)(?!\s*(?:minutes?|mins?|hours?|hrs?|days?|weeks?|months?|km|kms|kg|kgs|feet|ft|cm|rupees|rs|%|th|st|nd|rd|am|pm|o['’]clock)\b)/i,
  /\b(?:i\s+am|i['’]m|im)\s*(?:a\s*)?(?:1[0-7]|[5-9])\s*(?:years?|yrs?)\s*old\b/i,
  /\bi\s*(?:just\s+)?(?:turned|turning)\s*(?:1[0-7]|[5-9])\b/i,
  // A school student speaking: "I am a school student", "I go to school",
  // "my school" (but not "my school days" from an adult), "school mein
  // padhti hoon", "मैं स्कूल जाती हूँ", "मेरा स्कूल".
  /\b(?:i\s+am|i['’]m|im)\s*(?:a\s*)?school\s+(?:student|girl|boy|kid)\b/i,
  /\bmy\s+school\b(?!\s*(?:days['’]?|time|years?|life|fees?))/i,
  /\bmera\s+school\b/i,
  /मेरा\s*स्कूल/,
  /\b(?:i|we)\s+(?:go|goes|am\s+going|are\s+going)\s+to\s+school\b/i,
  /\bschool\s+(?:me|mein)\s+padh\w*\s+(?:hoon|hun)\b/i,
  /मैं\s*स्कूल/,
  /स्कूल\s*में\s*(?:पढ़ती|पढ़ता|पढ़\s*रही|पढ़\s*रहा)\s*हूँ/,
  /\b(?:i\s+am\s+in|i['’]m\s+in|im\s+in|i\s+study\s+in|i['’]m\s+studying\s+in)\s*(?:[5-9]|1[0-2])th\s*(?:class|std|standard|grade)\b/i,
  /\b(?:i\s+am|i['’]m|im|i\s+study|i['’]m\s+studying)\s*(?:in\s*)?(?:class|std|standard|grade)\s*(?:[5-9]|1[0-2])(?:th)?\b/i,
  /(?:मैं|मेरी\s*उम्र)\s*(?:1[0-7]|[5-9])\s*(?:साल|वर्ष)/,
  /\b(?:main|mai|meri\s*umar|meri\s*umr)\s*(?:1[0-7]|[5-9])\s*(?:saal|sal|varsh)\b/i,
];

// Subjectless under-18 signals: only trusted when the message names nobody
// else, so "my daughter is aged 15" can never become a self-report.
const UNDER_18_SELF_BARE = [
  /\baged\s*(?:1[0-7]|[5-9])\b/i,
  /\bstudying\s*(?:in\s*)?(?:class|std|standard|grade)\s*(?:[5-9]|1[0-2])(?:th)?\b/i,
  /\bstudying\s+in\s*(?:[5-9]|1[0-2])th\s*(?:class|std|standard|grade)\b/i,
  /\b(?:class|std|standard|grade)\s*(?:[5-9]|1[0-2])(?:th)?\s*(?:student|mein|me|main)\b/i,
  /\b(?:[5-9]|1[0-2])\s*th\s*(?:class|std|standard|grade)\s*(?:ki|ka|me|mein)?\s*(?:student|hoon|hun|padh\w*)\b/i,
  /(?:कक्षा|क्लास)\s*(?:[5-9]|1[0-2])\s*(?:में|की|का)/,
  /उम्र\s*(?:1[0-7]|[5-9])\s*(?:साल|वर्ष)/,
  /\b(?:umar|umr)\s*(?:1[0-7]|[5-9])\s*(?:saal|sal|varsh)\b/i,
  /स्कूल\s*में\s*(?:पढ़ती|पढ़ता|पढ़\s*रही|पढ़\s*रहा)/,
];

function statesUnder18Self(text: string, mentionsSomeone: boolean) {
  const patterns = mentionsSomeone ? UNDER_18_SELF_ANCHORED : [...UNDER_18_SELF_ANCHORED, ...UNDER_18_SELF_BARE];
  return patterns.some((pattern) => pattern.test(text));
}

// The under-18 signal attached to someone else: "my daughter is 15",
// "uski beti class 9 mein", "the girl in the photos is only 14".
const OTHER_MINOR_AGE =
  /\b(?:is|are|aged|turns?|turned)\s*(?:only\s+|just\s+|about\s+)?(?:1[0-7]|[5-9])\b|\b(?:1[0-7]|[5-9])\s*(?:years?|yrs?|saal|sal)\b|उम्र\s*(?:1[0-7]|[5-9])|\b(?:umar|umr|age)\s*(?:1[0-7]|[5-9])\b|(?:1[0-7]|[5-9])\s*(?:साल|वर्ष)/i;
const OTHER_MINOR_SCHOOL =
  /\b(?:class|std|standard|grade)\s*(?:[5-9]|1[0-2])(?:th)?\b|\b(?:[5-9]|1[0-2])\s*th\s*(?:class|std|standard|grade)\b|(?:कक्षा|क्लास)\s*(?:[5-9]|1[0-2])|\bschool\s+student\b|\bschool\s+(?:me|mein)\s+padh\w*|स्कूल\s*में\s*(?:पढ़ती|पढ़ता|पढ़\s*रही|पढ़\s*रहा)/i;

function mentionsOtherMinor(text: string) {
  return mentionsSomeoneElse(text) && (OTHER_MINOR_AGE.test(text) || OTHER_MINOR_SCHOOL.test(text));
}

export function statesUnder18(text: string) {
  return statesUnder18Self(text, mentionsSomeoneElse(text));
}

export function mentionsMinor(text: string) {
  return statesUnder18(text) || mentionsOtherMinor(text);
}

// ---------------------------------------------------------------- misuse ----

// An abuser's asks: spread or make someone's intimate images, find or locate
// a person, remove lawful content about someone else, get around platform
// rules. All are request-shaped (a request prefix plus a verb) and need a
// third-person target, so a survivor describing what was done to her
// ("someone is threatening to post my photos") never matches.
const MISUSE_REQUEST_PREFIX =
  /\b(?:how\s+(?:do|can|could|should|to)\s+(?:i|we)|where\s+(?:can|do|should)\s+(?:i|we)|help\s+me|i\s+(?:want|need)\s+to|i['’]d\s+(?:like|love)\s+to|show\s+me\s+how|let\s+me)\b/i;
const MISUSE_SPREAD_VERB =
  /\b(?:post|share|spread|upload|send|publish|leak|circulate|forward|make|create|generate|edit|fake|morph|photoshop)\b/i;
const MISUSE_TARGET =
  /\b(?:hers?|his|their|him|someone|somebody|my\s+ex|ex['’]s?|ex\s*[-\s](?:girlfriend|wife|boyfriend|husband)|(?:this|that|the)\s+(?:girl|woman|boy|man)|uski|uska)\b|उसकी|उसका/i;
const MISUSE_IMAGE_WORDS =
  /\b(?:photos?|photographs?|pics?|pictures?|images?|videos?|clips?|nudes?|naked|topless|private|deepfake|deep\s*fakes?|intimate)\b/i;
const MISUSE_LOCATE_VERB = /\b(?:find|locate|track|trace|identify|dox|reveal|nikalo|nikaal\w*|dhundh\w*|dhoondh\w*|khojo)\b|ढूंढ|खोजो|निकालो|तलाश/i;
const MISUSE_LOCATE_TARGET =
  /\b(?:(?:her|his|their|my\s+ex['’]?s?|ex['’]?s?|uska|uski)\s*[^.!?]{0,20}\s*(?:address|addresses|location|house|home|phone|number|account|profile|photos?|pics?|images?|nudes?|videos?|identity)|where\s+(?:she|he|they)\s+(?:lives?|stays?)|uska\s+pata)\b|उसका\s*पता|उसकी\s*(?:लोकेशन|तस्वीरें|तस्वीर|फ़ोटो|फोटो|वीडियो)|\b(?:this|that|the)\s+(?:girl|woman|boy|man)\b/i;
const MISUSE_LAWFUL_CONTENT =
  /\b(?:take\s*down|remove|delete|unpublish)\b[^.!?]{0,60}\b(?:criticis\w*|review|opinion|defamation|expos\w*|truth|truthful)\b[^.!?]{0,40}\b(?:about|of|on|against)\s+(?:him|her|them|my\s+friend|my\s+ex|us|me)\b/i;
const MISUSE_RULES =
  /\b(?:bypass|evade|get\s+around|circumvent|cheat|trick|fool|beat)\b[^.!?]{0,50}\b(?:platform|report|reporting|ban|moderation|rules|policy|policies|filters?|detection|blocking|moderation)\b/i;

function requestsMisuse(text: string) {
  if (MISUSE_LAWFUL_CONTENT.test(text) || MISUSE_RULES.test(text)) return true;
  if (MISUSE_LOCATE_VERB.test(text) && MISUSE_LOCATE_TARGET.test(text)) return true;
  return MISUSE_REQUEST_PREFIX.test(text) && MISUSE_SPREAD_VERB.test(text) && MISUSE_TARGET.test(text) && MISUSE_IMAGE_WORDS.test(text);
}

// ---------------------------------------------------------- personal data ----

// She should never be asked for identity documents, and a gentle code reply
// stops her from typing them here, where they would only travel onward.
const AADHAAR = /\b(?:aadhaar|aadhar|adhaar|adhar)\b|आधार/i;
const PAN_WORDS = /\b(?:my\s+)?pan\s+(?:card|number|no)\b/i;
const PAN_SHAPED = /\b[A-Z]{5}\d{4}[A-Z]\b/;
const ADDRESS =
  /\b(?:my\s+address\s+(?:is|hai)|i\s+live\s+at|mera\s+pata\s*(?:hai|he))\b|मेरा\s*पता\s*(?:है|:)/i;
const MOBILE_NUMBER = /\b[6-9]\d{9}\b/g;
const TWELVE_DIGITS = /(?<!\d)\d{4}[\s-]?\d{4}[\s-]?\d{4}(?!\d)/g;

function sharesPersonalData(text: string) {
  if (AADHAAR.test(text) || ADDRESS.test(text)) return true;
  if (PAN_WORDS.test(text) || PAN_SHAPED.test(text)) return true;
  const mobiles = text.match(MOBILE_NUMBER) ?? [];
  if (mobiles.some((number) => !isAllowedNumber(number))) return true;
  const twelve = text.match(TWELVE_DIGITS) ?? [];
  return twelve.some((number) => !isAllowedNumber(number));
}

// ------------------------------------------------------ output sanitising ----

// The whole-system prompt leak check plus the output scrubber. The model may
// only pass on links and numbers that are already on this site's own pages.
export function leaksInstructions(reply: string) {
  return reply.includes(PROMPT_CANARY) || /# (Who you are|Safety rules|How to write|Support directory)|Never break these/i.test(reply);
}

const URL_TOKEN = /https?:\/\/\S+|www\.\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|org|net|in|co|io|me|site|xyz)\b(?:\/\S*)?/gi;
const PHONE_TOKEN = /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)|\+91[\s-]?\d{10}(?!\d)/g;

function hostAllowed(token: string) {
  const cleaned = token.replace(/[.,;:!?)\]]+$/, "");
  const withProtocol = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
  try {
    const host = new URL(withProtocol).hostname.toLowerCase().replace(/^www\./, "");
    return ALLOWED_REPLY_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

export function sanitizeModelReply(reply: string) {
  // Data URLs never reach her, from the model or anywhere else.
  let text = reply.replace(/data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/gi, "");
  text = text.replace(URL_TOKEN, (token) => (hostAllowed(token) ? token : ""));
  text = text.replace(PHONE_TOKEN, (token) => (isAllowedNumber(token) ? token : ""));
  // Close the gaps the stripped tokens leave behind, then cap the length.
  return text.replace(/[ \t]{2,}/g, " ").trim().slice(0, 1500);
}

// ------------------------------------------------------------ classifier ----

export function classifyChatRisk(text: string): ChatGuard | null {
  if (mentionsCrisis(text)) return "crisis";
  if (statesUnder18Self(text, mentionsSomeoneElse(text))) return "minor-self";
  if (mentionsOtherMinor(text)) return "minor-other";
  if (requestsMisuse(text)) return "misuse";
  if (sharesPersonalData(text)) return "personal-data";
  if (containsUrlLikeText(text)) return "link";
  return null;
}
