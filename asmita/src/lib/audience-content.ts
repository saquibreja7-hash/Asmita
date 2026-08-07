/*
 * Content for the Who We Help section.
 * Audience-segmented, in each reader's own voice (eSafety pattern).
 * Hard guardrail: anything involving a person under 18 is information and
 * safe routing only, never an upload or case intake (POCSO).
 * English now; Hindi + i18n follow.
 */

export type AudiencePoint = { title: string; body: string };

export type Audience = {
  slug: string;
  term: string; // card / nav label
  cardLine: string; // one-sentence line on the hub
  title: string; // page H1, in the reader's voice
  intro: string;
  points: AudiencePoint[];
  callout?: { title: string; body: string }; // safety guardrail box
  cta: { label: string; href: string };
  secondary?: { label: string; href: string };
};

export const audiences: Audience[] = [
  {
    slug: "survivors",
    term: "For survivors",
    cardLine: "You are facing image-based abuse and want to act.",
    title: "You reached the right place.",
    intro:
      "If someone has shared, or is threatening to share, an intimate image of you, none of it is your fault. You do not have to figure this out alone, and you stay in control of every step.",
    points: [
      {
        title: "Report and take it down",
        body: "We help you write a legally grounded takedown notice and send it to the platform. You read it and sign it before anything goes out.",
      },
      {
        title: "Block re-uploads privately",
        body: "You can block matching copies with a fingerprint made on your own device. The image itself never reaches us.",
      },
      {
        title: "Understand a fake image",
        body: "If it is a deepfake or a morphed photo, you can check it and still report it. A fake image is still abuse.",
      },
      {
        title: "Reach real support",
        body: "Helplines, counselling, and practical guides for securing your accounts and collecting evidence safely.",
      },
    ],
    cta: { label: "Get help now", href: "/get-help" },
    secondary: { label: "Understand the issue", href: "/issue" },
  },
  {
    slug: "helping-someone",
    term: "Helping someone",
    cardLine: "You are supporting a friend or family member.",
    title: "Someone you care about needs support.",
    intro:
      "Being the person a survivor turns to matters more than you might think. You do not need to have the answers. You need to listen, believe them, and help them find the right next step.",
    points: [
      {
        title: "Lead with belief, not blame",
        body: "Do not ask why they sent a photo or what they were wearing. Tell them it is not their fault and that you are there.",
      },
      {
        title: "Let them stay in control",
        body: "Do not report or contact anyone on their behalf without asking first. Acting without consent can take away the little control they still have.",
      },
      {
        title: "Help preserve evidence",
        body: "Encourage them to save screenshots, links, and messages before blocking anyone. You can sit with them while they do it.",
      },
      {
        title: "Point them to help",
        body: "Walk through Get Help together, or share a helpline. Sometimes the most useful thing is not leaving them to do it alone.",
      },
    ],
    cta: { label: "See how to get help", href: "/get-help" },
    secondary: { label: "Browse resources", href: "/resources" },
  },
  {
    slug: "parents",
    term: "Parents & families",
    cardLine: "Safe next steps if it involves your child.",
    title: "Something happened to your child, or you are worried it might.",
    intro:
      "Finding out that your child is dealing with this is frightening. Stay calm if you can. Your child needs to know they are safe with you and that they are not in trouble.",
    points: [
      {
        title: "React with support, not anger",
        body: "Anger, even at the person who did it, can make a child shut down. Reassure them first. The details can come later.",
      },
      {
        title: "Do not save or share the image",
        body: "If the image involves someone under 18, do not download, copy, or forward it, even as evidence. That can itself be illegal.",
      },
      {
        title: "Use the child-protection path",
        body: "For anyone under 18, help runs through child-protection services, not the adult report flow. We point you to the right ones.",
      },
      {
        title: "Talk about what comes next",
        body: "Reporting, school, and safety online. You do not have to decide everything at once.",
      },
    ],
    callout: {
      title: "If your child is under 18",
      body: "Do not upload their image anywhere, including here. Use Childline (1098), Take It Down for under-18 content, and the cybercrime portal. Our minor-support page has the direct links.",
    },
    cta: { label: "Go to under-18 support", href: "/minor-support" },
    secondary: { label: "Understand the issue", href: "/issue" },
  },
  {
    slug: "young-people",
    term: "Young people",
    cardLine: "Under 18? Find the right, safe support.",
    title: "If something happened, you are not in trouble.",
    intro:
      "Maybe someone shared a photo, or is pressuring you, or made a fake one. Whatever it is, it is not your fault, and you deserve help. You do not have to deal with it by yourself.",
    points: [
      {
        title: "Tell someone you trust",
        body: "A parent, a teacher, an older sibling, anyone who will listen. Saying it out loud to one safe person makes the next step easier.",
      },
      {
        title: "Do not send more or pay anyone",
        body: "If someone is threatening you, do not send more photos and do not pay. It rarely stops them. Save the messages and get help.",
      },
      {
        title: "Get the content taken down",
        body: "There are free services made for people under 18 that help remove images without you sending the image anywhere.",
      },
    ],
    callout: {
      title: "Made for people under 18",
      body: "Call Childline on 1098, any time, free. Use Take It Down (takeitdown.ncmec.org) to help remove images. You never upload your image to Asmita.",
    },
    cta: { label: "Find the right help", href: "/minor-support" },
  },
  {
    slug: "platforms",
    term: "Platforms & partners",
    cardLine: "How takedowns and fingerprint blocking work with us.",
    title: "Work with us to remove abuse faster.",
    intro:
      "Asmita routes legally grounded takedown notices and privacy-preserving fingerprints to platforms in India. We are built so that acting on a report never requires exposing the survivor's image.",
    points: [
      {
        title: "Legally grounded notices",
        body: "Notices cite the IT Rules and the MeitY NCII SOP, and reach the right grievance channel, so your team gets a clear, actionable request.",
      },
      {
        title: "No media changes hands",
        body: "We never fetch or store intimate content. Reports are text and links; matching uses on-device fingerprints, not the image.",
      },
      {
        title: "Built for real workflows",
        body: "Structured requests, clear reference details, and honest scope, so removals and re-upload blocking fit how your team already works.",
      },
    ],
    cta: { label: "Get in touch", href: "/contact" },
    secondary: { label: "How it works", href: "/how-it-works" },
  },
];

export function getAudience(slug: string): Audience | undefined {
  return audiences.find((a) => a.slug === slug);
}
