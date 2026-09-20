/*
 * Content for the Resources section: practical guides, a verified support
 * directory, and legal rights in India.
 * Only real, verifiable organisations and contacts. Nothing invented.
 * Not legal advice. English now; Hindi + i18n follow.
 */

export type Guide = {
  slug: string;
  title: string;
  intro: string;
  steps: string[];
  note?: string;
};

export const guides: Guide[] = [
  {
    slug: "secure-accounts",
    title: "Secure your accounts",
    intro:
      "If someone has your images, they may also have, or want, access to your accounts. Tightening them makes it harder for the abuse to continue.",
    steps: [
      "Change the password on your main email first. Everything else can be reset from there.",
      "Turn on two-factor authentication (2FA) on email and social accounts.",
      "Review active sessions and logged-in devices, and log out anything you do not recognise.",
      "Check your recovery email and phone number are still yours.",
      "Review which apps are connected to your accounts and remove ones you do not use.",
      "Limit who can see your profile, photos, and friend or contact list.",
      "Remove your public phone number and address where you can.",
    ],
    note: "If the person may have physical access to your phone, changing settings can alert them. If you are unsure, get support first, from a trusted person or a helpline, before making changes.",
  },
  {
    slug: "collect-evidence",
    title: "Collect evidence safely",
    intro:
      "Evidence disappears when content is deleted or accounts go private. Saving it early helps with platform reports, the police, and any legal step later.",
    steps: [
      "Keep the post URL as text and note the public account handle. Avoid screenshots that include intimate media.",
      "Note the date, time, and the username or account handle.",
      "Save any threatening messages and any demands for money, including payment details.",
      "Keep a simple, dated list of what happened and when.",
      "If it is safe for you, preserve related messages and account details before blocking the person. Seek help first if blocking could increase danger.",
    ],
    note: "Do not download or forward intimate images as evidence. Never save, download, or forward an intimate image of anyone under 18. For anyone under 18, use the child-protection path instead.",
  },
  {
    slug: "report-to-platform",
    title: "Report to a platform yourself",
    intro:
      "Alongside a formal notice, you can report content directly to the platform. Doing both can be faster.",
    steps: [
      "Find the platform's report or safety page (most have a specific option for non-consensual intimate images).",
      "Report the exact post, and the account if it is impersonating you.",
      "Save any case or reference number the platform gives you.",
      "Ask a search engine to remove the result so it is harder to find, even if the page stays up.",
    ],
    note: "Removing a page from search is separate from removing it from the website. It can help to do both.",
  },
];

export function getGuide(slug: string): Guide | undefined {
  return guides.find((g) => g.slug === slug);
}

export type DirectoryItem = {
  name: string;
  what: string;
  tel?: string;
  href?: string;
  note?: string;
};

export type DirectoryGroup = { group: string; items: DirectoryItem[] };

export const directory: DirectoryGroup[] = [
  {
    group: "Emergency and helplines",
    items: [
      { name: "Emergency", what: "Immediate danger to your safety.", tel: "112" },
      { name: "Women's helpline", what: "Support for women. Availability varies by location; the national scheme is not currently operational in West Bengal. If you are in immediate danger, call 112.", tel: "181", note: "Check local availability" },
      { name: "Childline", what: "For anyone under 18.", tel: "1098", note: "Free, 24 hours" },
      { name: "Cyber financial fraud helpline", what: "For urgent reporting of cyber financial fraud or a payment already made. For threats without a payment, use the cybercrime portal or local police.", tel: "1930" },
    ],
  },
  {
    group: "Report a crime",
    items: [
      {
        name: "National Cyber Crime Reporting Portal",
        what: "Report cybercrime, with a dedicated path for crimes against women and children.",
        href: "https://cybercrime.gov.in/",
      },
    ],
  },
  {
    group: "Remove images and block re-uploads",
    items: [
      {
        name: "StopNCII.org",
        what: "For adults. Creates a fingerprint on your own device so partner platforms can block matching images. Your image never leaves your device.",
        href: "https://stopncii.org/",
      },
      {
        name: "Take It Down (NCMEC)",
        what: "For images taken when the person was under 18. Also works on-device.",
        href: "https://takeitdown.ncmec.org/",
      },
    ],
  },
  {
    group: "Legal aid and rights",
    items: [
      {
        name: "NALSA and District Legal Services Authorities",
        what: "Free legal aid across India. Use the directory to find your nearest office.",
        href: "https://nalsa.gov.in/directory/",
      },
      {
        name: "One Stop Centres (Sakhi)",
        what: "Government support for women facing violence, including help with police and legal steps. Call 181 to find your nearest centre.",
        tel: "181",
      },
    ],
  },
  {
    group: "Counselling and NGO support",
    items: [
      {
        name: "iCall (TISS)",
        what: "Psychosocial counselling by trained professionals at TISS. Check the service site for current hours; it is not a 24-hour crisis line.",
        tel: "9152987821",
        href: "https://icallhelpline.org/",
      },
      {
        name: "CyberPeace Foundation",
        what: "Guidance and resources on cybercrime and online harm.",
        href: "https://cyberpeace.org/",
      },
    ],
  },
];

/* Date this directory underwent a complete source-by-source verification. */
export const directoryLastVerified = "12 May 2026";

export type LegalSection = { title: string; body: string };

export const legalSections: LegalSection[] = [
  {
    title: "Platforms must act on non-consensual intimate content",
    body: "Under the IT Rules, 2021 (Rule 3(2)(b)), intermediaries must take reasonable and practicable measures to remove or disable access to qualifying intimate content within 24 hours of receiving a complaint from the affected person or an authorised representative. The rule has conditions; a notice can state the grounds for a qualifying complaint.",
  },
  {
    title: "There is a government procedure for NCII",
    body: "The Ministry of Electronics and IT (MeitY) has issued a standard operating procedure for handling non-consensual intimate imagery. It sets out how complaints should be received and acted on.",
  },
  {
    title: "You can report it as a crime",
    body: "The National Cyber Crime Reporting Portal (cybercrime.gov.in) accepts online cybercrime complaints. Its women-and-children section offers an anonymous option for certain sexual-content complaints; other reports may require your details.",
  },
  {
    title: "If a platform ignores you, you can escalate",
    body: "Intermediaries must publish a grievance mechanism. After contacting the relevant officer, a user who is dissatisfied with the decision, or receives no response within the prescribed period, may be able to appeal to the Grievance Appellate Committee. Cybercrime can also be reported to the police or cybercrime portal; GAC is not a cybercrime investigation body.",
  },
  {
    title: "You can get free legal help",
    body: "People who meet the eligibility rules can apply for free legal aid through NALSA and local Legal Services Authorities. One Stop Centres may also help women facing violence with police and legal steps.",
  },
  {
    title: "Different rules protect anyone under 18",
    body: "Content involving a person under 18 is handled under POCSO and child-protection processes, not the adult flow. Do not save or share such an image, even as evidence.",
  },
];
