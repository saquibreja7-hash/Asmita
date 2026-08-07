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
      "Take screenshots of the post, the profile, and the web address (URL).",
      "Note the date, time, and the username or account handle.",
      "Save any threatening messages and any demands for money, including payment details.",
      "Keep a simple, dated list of what happened and when.",
      "Block the person only after you have saved everything, not before.",
    ],
    note: "One firm rule: never save, download, or forward an intimate image of anyone under 18, even as evidence. For anyone under 18, use the child-protection path instead.",
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
      { name: "Women's helpline", what: "Support for women, any time.", tel: "181", note: "24 hours" },
      { name: "Childline", what: "For anyone under 18.", tel: "1098", note: "Free, 24 hours" },
      { name: "Cyber financial fraud helpline", what: "If money has been taken or demanded.", tel: "1930" },
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
    group: "NGO support",
    items: [
      {
        name: "CyberPeace Foundation",
        what: "Helpline and guidance on cybercrime and online harm.",
        href: "https://cyberpeace.org/",
        tel: "9152987821",
      },
    ],
  },
];

export type LegalSection = { title: string; body: string };

export const legalSections: LegalSection[] = [
  {
    title: "Platforms must act on non-consensual intimate content",
    body: "Under the IT Rules, 2021 (Rule 3(2)(b)), online platforms in India must remove non-consensual intimate content after a valid complaint, within the timeframe the rules set. A takedown notice puts your complaint on that legal footing.",
  },
  {
    title: "There is a government procedure for NCII",
    body: "The Ministry of Electronics and IT (MeitY) has issued a standard operating procedure for handling non-consensual intimate imagery. It sets out how complaints should be received and acted on.",
  },
  {
    title: "You can report it as a crime",
    body: "The National Cyber Crime Reporting Portal (cybercrime.gov.in) lets you report online, with a dedicated path for crimes against women and children. You can report anonymously if you choose.",
  },
  {
    title: "If a platform ignores you, you can escalate",
    body: "Every platform must name a grievance officer to handle complaints. If they do not act, you can take it to the Grievance Appellate Committee (GAC), and to the police.",
  },
  {
    title: "You can get free legal help",
    body: "Free legal aid is available through NALSA and District Legal Services Authorities. One Stop Centres can help you with police and legal steps in person.",
  },
  {
    title: "Different rules protect anyone under 18",
    body: "Content involving a person under 18 is handled under POCSO and child-protection processes, not the adult flow. Do not save or share such an image, even as evidence.",
  },
];
