import type { SextortionLabel } from "../../../asmita/src/lib/lab/sextortion/taxonomy.ts";

/*
 * WP116 (docs/research/research-tools-spec.md, Track D): the template
 * families the synthetic generator composes messages from.
 *
 * A template is a sentence frame with `{slot}` markers. `{slot?}` is
 * optional: the row RNG resolves it to a value or to nothing (50/50), and a
 * skipped optional slot contributes no label either. Labels therefore always
 * describe what is actually in the generated text.
 *
 * Scripts: `devanagari` templates are filled with the Devanagari slot
 * forms, `romanised` with the romanised forms, `english` with the English
 * forms. `mixed` reuses the romanised frames and flips each filled slot to
 * its Devanagari form half the time — that is how code-mixed chat actually
 * looks ("paise bhejo warna video वायरल कर दूंगा").
 *
 * Every frame and slot value is invented, clinical, name-free, and free of
 * real numbers (98XXXXXX00-style placeholders only). See slots.ts.
 */

export type ScriptTag = "devanagari" | "romanised" | "mixed" | "english";
export const SCRIPT_TAGS: readonly ScriptTag[] = ["devanagari", "romanised", "mixed", "english"];

export interface Family {
  id: string;
  kind: "threat" | "negative";
  /** Rows per family; split across the four scripts as evenly as possible. */
  quota: number;
  baseLabels: SextortionLabel[];
  templates: Record<"devanagari" | "romanised" | "english", string[]>;
}

export const FAMILIES: readonly Family[] = [
  // ------------------------------------------------------- positives ----
  {
    id: "threatCore",
    kind: "threat",
    quota: 1300,
    baseLabels: ["THREAT_EXPOSE"],
    templates: {
      devanagari: [
        "{claim}। {audience} {threat}। {money} {amount} {deadline?}।",
        "सुनो, {claim}। {audience} {threat}, {money} {amount} {polite}।",
        "{claim} और {threat}। {money} {amount} {deadline?}, वरना सब देख लेंगे।",
      ],
      romanised: [
        "{claim}. {audience} {threat}. {money} {amount} {deadline?}.",
        "sun, {claim}. {audience} {threat}, {money} {amount} {polite}.",
        "{claim} and {threat}. {money} {amount} {deadline?}, warna sab dekh lenge.",
      ],
      english: [
        "{claim}. i will {threat} {audience}. {money} {amount} {deadline?}.",
        "listen, {claim}. i will {threat} {audience} unless you {money} {amount} {polite}.",
        "{claim} and i will {threat}. {money} {amount} {deadline?}, or everyone sees it.",
      ],
    },
  },
  {
    id: "threatFamily",
    kind: "threat",
    quota: 700,
    baseLabels: ["THREAT_EXPOSE", "AUDIENCE_FAMILY"],
    templates: {
      devanagari: [
        "{claim}। {audFam} {threat}। {money} {amount} {deadline?}।",
        "सब कुछ {audFam} चला जाएगा। {money} {amount}, वरना {threat}।",
      ],
      romanised: [
        "{claim}. {audFam} {threat}. {money} {amount} {deadline?}.",
        "sab kuch {audFam} chala jayega. {money} {amount}, warna {threat}.",
      ],
      english: [
        "{claim}. i will {threat} {audFam}. {money} {amount} {deadline?}.",
        "everything will go {audFam}. {money} {amount}, or i will {threat}.",
      ],
    },
  },
  {
    id: "threatPublic",
    kind: "threat",
    quota: 700,
    baseLabels: ["THREAT_EXPOSE", "AUDIENCE_PUBLIC"],
    templates: {
      devanagari: [
        "{claim}। {audPub} {threat}। {deadline?}।",
        "वीडियो {audPub} वायरल हो जाएगा। {money} {amount} {deadline?}।",
      ],
      romanised: [
        "{claim}. {audPub} {threat}. {deadline?}.",
        "video {audPub} viral ho jayega. {money} {amount} {deadline?}.",
      ],
      english: [
        "{claim}. it goes viral {audPub} {deadline?} unless you {money} {amount}.",
        "the video will be everywhere {audPub} {deadline?}. {money} {amount}.",
      ],
    },
  },
  {
    id: "authority",
    kind: "threat",
    quota: 600,
    baseLabels: ["AUTHORITY_IMPERSONATION"],
    templates: {
      devanagari: [
        "{authority}। {authAct} अगर {money} {amount} नहीं भेजे। {deadline?}।",
        "{authority}। केस बंद करने का चार्ज {amount} है। {money} {deadline?}।",
        "{authority}, वीडियो डिलीट करने का काम चल रहा है। {money} {amount} {deadline?}।",
      ],
      romanised: [
        "{authority}. {authAct} if you do not {money} {amount}. {deadline?}.",
        "{authority}. case band karne ka charge {amount} hai. {money} {deadline?}.",
        "{authority}, video delete karne ka kaam chal raha hai. {money} {amount} {deadline?}.",
      ],
      english: [
        "{authority}. {authAct} unless you {money} {amount} {deadline?}.",
        "{authority}. the case-closure charge is {amount}. {money} {deadline?}.",
        "{authority}. the video-deletion process has started. {money} {amount} {deadline?}.",
      ],
    },
  },
  {
    id: "platform",
    kind: "threat",
    quota: 500,
    baseLabels: ["PLATFORM_IMPERSONATION"],
    templates: {
      devanagari: [
        "{platform}। आपका वीडियो फ्लैग हो गया है। {deleteFee} {amount} है, {money}। {deadline?}।",
        "{platform}, पॉलिसी के हिसाब से वीडियो डिलीट हो जाएगा। {deleteFee}: {amount}। {money} {upi} पर {deadline?}।",
      ],
      romanised: [
        "{platform}. your video has been flagged. {deleteFee} is {amount}, {money}. {deadline?}.",
        "{platform}, policy ke hisab se video delete ho jayega. {deleteFee}: {amount}. {money} {upi} par {deadline?}.",
      ],
      english: [
        "{platform}. your video has been flagged. the deletion fee is {amount}. {money} {deadline?}.",
        "{platform}. per policy the video comes down once the fee is paid: {amount}. {money} {deadline?}.",
      ],
    },
  },
  {
    id: "loanRecovery",
    kind: "threat",
    quota: 500,
    baseLabels: ["LOAN_RECOVERY", "THREAT_EXPOSE"],
    templates: {
      devanagari: [
        "{loan}। {morph}, अगर भुगतान नहीं हुआ तो {audience} भेज दूंगा। {deadline?}।",
        "{loan}, {money} {amount} {deadline?}, वरना {morph} और {audience} सबको भेज देंगे।",
      ],
      romanised: [
        "{loan}. {morph}, will send it {audience} if you do not pay. {deadline?}.",
        "{loan}. {money} {amount} {deadline?}, warna {morph} aur {audience} sabko bhej denge.",
      ],
      english: [
        "{loan}. i {morph}, and they go {audience} unless you pay. {deadline?}.",
        "{loan}. {money} {amount} {deadline?}, or i {morph} and they go {audience}.",
      ],
    },
  },
  {
    id: "repeatDemand",
    kind: "threat",
    quota: 500,
    baseLabels: ["REPEAT_DEMAND", "THREAT_EXPOSE"],
    templates: {
      devanagari: [
        "{repeat}। {claim}, {audience} {threat}। {money} {amount} और चाहिए {deadline?}।",
        "फिर से {money} {amount}। {repeat}, वरना {audience} {threat}।",
      ],
      romanised: [
        "{repeat}. {claim}, {audience} {threat}. need another {amount} {deadline?}.",
        "{money} {amount} again. {repeat}, warna {audience} {threat}.",
      ],
      english: [
        "{repeat}. {claim} and i will {threat} {audience}. send another {amount} {deadline?}.",
        "another {amount}, now. {repeat}, or i will {threat} {audience}.",
      ],
    },
  },
  {
    id: "meetAlone",
    kind: "threat",
    quota: 400,
    baseLabels: ["DEMAND_SEXUAL"],
    templates: {
      devanagari: [
        "{claim}। {meetAlone}, {deletePromise}।",
        "{meetAlone} प्लीज, {deletePromise}, वरना {audience} {threat}।",
        "{morePhotos}, फिर {deletePromise}।",
      ],
      romanised: [
        "{claim}. {meetAlone}, {deletePromise}.",
        "{meetAlone} please, {deletePromise}, warna {audience} {threat}.",
        "{morePhotos}, phir {deletePromise}.",
      ],
      english: [
        "{claim}. {meetAlone} and {deletePromise}.",
        "{meetAlone}, {deletePromise}, or i will {threat} {audience}.",
        "{morePhotos} and i will {deletePromise}.",
      ],
    },
  },
  {
    id: "thirdParty",
    kind: "threat",
    quota: 350,
    baseLabels: ["DEMAND_THIRD_PARTY", "THREAT_EXPOSE"],
    templates: {
      devanagari: [
        "{claim}। {thirdParty}, वरना {audience} {threat}।",
        "{thirdParty} {deadline?}, फिर {deletePromise}।",
      ],
      romanised: [
        "{claim}. {thirdParty}, warna {audience} {threat}.",
        "{thirdParty} {deadline?}, then {deletePromise}.",
      ],
      english: [
        "{claim}. {thirdParty} or i will {threat} {audience}.",
        "{thirdParty} {deadline?} and then {deletePromise}.",
      ],
    },
  },
  {
    id: "claimOnly",
    kind: "threat",
    quota: 250,
    baseLabels: ["CLAIM_HAS_MEDIA"],
    templates: {
      devanagari: [
        "हाँ तो, {claim}। सोच लेना।",
        "{claim}। बात करनी है तो {phone} पर मैसेज करो।",
        "{claim}, वीडियो कॉल की थी ना, सब रिकॉर्ड है।",
      ],
      romanised: [
        "haan to, {claim}. soch lena.",
        "{claim}. baat karni hai to {phone} par message karo.",
        "{claim}, video call ki thi na, sab record hai.",
      ],
      english: [
        "so, {claim}. think about it.",
        "{claim}. message me at {phone} if you want to talk.",
        "{claim}. the video call, remember? it is all on record.",
      ],
    },
  },
  {
    id: "victimPlea",
    kind: "threat",
    quota: 150,
    baseLabels: ["VICTIM_PLEA"],
    templates: {
      devanagari: [
        "भाई प्लीज, {plea}।",
        "{plea}। {minor?}",
        "प्लीज भाई, {plea}, सब बर्बाद हो जाएगा।",
      ],
      romanised: [
        "bhai please, {plea}.",
        "{plea}. {minor?}",
        "please bhai, {plea}, sab barbaad ho jayega.",
      ],
      english: [
        "brother please, {plea}.",
        "{plea}. {minor?}",
        "i beg you, {plea}.",
      ],
    },
  },
  {
    id: "morphClaim",
    kind: "threat",
    quota: 50,
    baseLabels: ["MORPHING", "CLAIM_HAS_MEDIA"],
    templates: {
      devanagari: [
        "{claim}, असल में {morph}। देखो कैसी बनी है।",
        "{morph} तुम्हारी फोटो की। {money} {amount} तो {deletePromise}।",
      ],
      romanised: [
        "{claim}, actually {morph}. dekho kaisi bani hai.",
        "{morph} tumhari photo ki. {money} {amount} to {deletePromise}.",
      ],
      english: [
        "{claim} — actually i {morph}. see how well it turned out.",
        "i {morph} your photo. {money} {amount} and i will {deletePromise}.",
      ],
    },
  },

  // ------------------------------------------------------- negatives ----
  {
    id: "familyChat",
    kind: "negative",
    quota: 1400,
    baseLabels: ["NOT_THREAT"],
    templates: {
      devanagari: [
        "{opener?} शादी की वीडियो भेज दो ना {closer?}।",
        "{opener?} बेटा, घर की तस्वीरें भेजो {closer?}।",
        "{opener?} दीदी की सगाई की फोटो आ गईं? भेजो ना {closer?}।",
        "{opener?} कल के फंक्शन का वीडियो ग्रुप में डालो {closer?}।",
      ],
      romanised: [
        "{opener?} shaadi ki video bhej do na {closer?}.",
        "{opener?} beta, ghar ki photos bhejo {closer?}.",
        "{opener?} didi ki sagai ki photo aa gayi? bhejo na {closer?}.",
        "{opener?} kal ke function ka video group me daalo {closer?}.",
        "{opener?} family group me purani photos share karo na {closer?}.",
      ],
      english: [
        "{opener?} please send the wedding video {closer?}.",
        "{opener?} send the photos from the function at home {closer?}.",
        "{opener?} did the engagement photos come out? share them {closer?}.",
        "{opener?} post the video in the family group {closer?}.",
      ],
    },
  },
  {
    id: "policeNotice",
    kind: "negative",
    quota: 700,
    baseLabels: ["NOT_THREAT"],
    templates: {
      devanagari: [
        "आपकी शिकायत दर्ज हो गई है ({refno?})। स्टेटस के लिए 1930 पर कॉल करें।",
        "साइबर क्राइम शाखा से पत्र ({refno?}): आपके मामले की जांच जारी है।",
        "थाने में फॉर्म भरना है ({refno?}), कल आ जाइए।",
      ],
      romanised: [
        "aapki complaint register ho gayi hai ({refno?}). status ke liye 1930 par call karein.",
        "cyber cell se update ({refno?}): aapke case ki jaanch jaari hai.",
        "police station se form bharna hai ({refno?}), kal aa jaiye.",
      ],
      english: [
        "your complaint has been registered ({refno?}). call the 1930 helpline for the status.",
        "update from the cyber cell ({refno?}): the inquiry into your case is ongoing.",
        "the station needs a form filled in ({refno?}); please come by tomorrow.",
      ],
    },
  },
  {
    id: "bankNotice",
    kind: "negative",
    quota: 700,
    baseLabels: ["NOT_THREAT"],
    templates: {
      devanagari: [
        "आपका KYC अपडेट बाकी है ({refno?}), ब्रांच आकर अपडेट कराएँ।",
        "खाते का विवरण संलग्न है ({refno?})। OTP किसी को न दें।",
        "ब्रांच का समय सोमवार से बदल गया है ({refno?}), नोट कर लें।",
      ],
      romanised: [
        "aapka KYC update baaki hai ({refno?}), branch aakar update karayein.",
        "account statement attached hai ({refno?}). OTP kisi ko na dein.",
        "branch timing monday se badal gayi hai ({refno?}), note kar lo.",
      ],
      english: [
        "your KYC update is pending ({refno?}); please visit the branch.",
        "your account statement is attached ({refno?}). never share your OTP with anyone.",
        "the branch timings change from monday ({refno?}), please note.",
      ],
    },
  },
  {
    id: "loanReminder",
    kind: "negative",
    quota: 700,
    baseLabels: ["NOT_THREAT"],
    templates: {
      devanagari: [
        "आपकी EMI 5 तारीख को देय है ({refno?})। समय पर भुगतान करें।",
        "आपका लोन खाता सामान्य है। अगली किश्त {amount} है।",
      ],
      romanised: [
        "aapki EMI 5 tareek ko due hai ({refno?}). time par payment karein.",
        "loan account normal hai. agli kisht {amount} hai.",
        "EMI reminder: {amount} jama karein is month.",
      ],
      english: [
        "your EMI of {amount} is due on the 5th ({refno?}). please pay on time.",
        "friendly reminder: your loan instalment of {amount} is due this month.",
      ],
    },
  },
  {
    id: "flirtChat",
    kind: "negative",
    quota: 700,
    baseLabels: ["NOT_THREAT"],
    templates: {
      devanagari: [
        "{opener?} कॉफी पी चलेंगे कल? आपकी हँसी अच्छी लगी {closer?}।",
        "{opener?} आज बात करना अच्छा लगा, कल फिर {closer?}?",
      ],
      romanised: [
        "{opener?} coffee pe chalein kal? aapki hasi achi lagi {closer?}.",
        "{opener?} aaj baat karna acha laga, kal phir {closer?}?",
        "{opener?} coffee pe milte hain shaam ko {closer?}?",
      ],
      english: [
        "{opener?} shall we have coffee tomorrow? i liked your smile {closer?}.",
        "{opener?} it was lovely talking to you today {closer?}.",
        "{opener?} coffee this evening {closer?}?",
      ],
    },
  },
  {
    id: "newsText",
    kind: "negative",
    quota: 700,
    baseLabels: ["NOT_THREAT"],
    templates: {
      devanagari: [
        "पुलिस ने बताया कि सेक्सटॉर्शन गैंग वीडियो कॉल रिकॉर्ड कर पैसे मांगते हैं।",
        "साइबर सेल ने तीन लोगों को गिरफ्तार किया, मामला वायरल वीडियो का था।",
        "रिपोर्ट: अजनबी नंबर से वीडियो कॉल न लें, धोखे से बचें।",
      ],
      romanised: [
        "police ne bataya ki sextortion gang video call record karke paise maangta hai.",
        "cyber cell ne teen logon ko girftar kiya, maamla viral video ka tha.",
        "news: ajnabi number se video call na lein, dhoke se bachhein.",
      ],
      english: [
        "police said the gang records video calls and then demands money.",
        "the cyber cell arrested three people in the sextortion case.",
        "reports advise never taking video calls from unknown numbers.",
      ],
    },
  },
  {
    id: "awareness",
    kind: "negative",
    quota: 700,
    baseLabels: ["NOT_THREAT"],
    templates: {
      devanagari: [
        "अजनबी नंबर से वीडियो कॉल न लें। धमकी मिले तो 1930 पर रिपोर्ट करें।",
        "कभी पैसे न भेजें, यह स्कैम है, रिपोर्ट करें।",
      ],
      romanised: [
        "ajnabi number se video call na lein. dhamki mile to 1930 par report karein.",
        "kabhi paise na bhejein, yeh scam hai. report karo turant.",
        "sextortion me paise mat bhejo, block karo aur report karo.",
      ],
      english: [
        "never take video calls from unknown numbers. report threats at 1930.",
        "do not pay a sextortionist; block and report it.",
        "awareness: the scam starts with a video call and ends with a demand. report it.",
      ],
    },
  },
  {
    id: "workDeadline",
    kind: "negative",
    quota: 200,
    baseLabels: ["NOT_THREAT"],
    templates: {
      devanagari: [
        "रिपोर्ट आज शाम 5 बजे तक भेजो, रिव्यू मीटिंग है।",
        "क्लाइंट को प्रपोज़ल कल सुबह तक भेजना है, डेडलाइन है।",
      ],
      romanised: [
        "report aaj shaam 5 baje tak bhejo, review meeting hai.",
        "client ko proposal kal subah tak bhejna hai, deadline hai.",
      ],
      english: [
        "please send the report by 5 pm today, the review meeting is at 6.",
        "the client proposal is due tomorrow morning, do not miss the deadline.",
      ],
    },
  },
  {
    id: "schoolMinor",
    kind: "negative",
    quota: 200,
    baseLabels: ["NOT_THREAT", "MINOR_SIGNAL"],
    templates: {
      devanagari: [
        "मैं कक्षा 9 में पढ़ती हूँ, कल मैथ टेस्ट है।",
        "हमारी कक्षा 10 की साइंस फेयर अगले महीने है।",
        "मैं कक्षा 8 का छात्र हूँ, गृहकार्य में मदद चाहिए।",
      ],
      romanised: [
        "main class 9 me padhti hoon, kal math test hai.",
        "hamari class 10 ki science fair agle mahine hai.",
        "main class 8 ka student hoon, homework me madad chahiye.",
      ],
      english: [
        "i am in class 9 and have a math test tomorrow.",
        "our class 10 science fair is next month.",
        "i am a class 8 student and need homework help.",
      ],
    },
  },
];
