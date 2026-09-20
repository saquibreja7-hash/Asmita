/*
 * Content for The Issue section and the Glossary.
 * Plain-language, India-specific educational content.
 * Sources: our own domain knowledge + framing patterns from eSafety and Thorn.
 * These are education explainers, not legal advice.
 */

export type IssueTopic = {
  slug: string;
  term: string; // short label for cards / nav
  title: string; // page heading
  short: string; // one-sentence definition for the hub grid
  definition: string; // opening paragraph on the topic page
  looksLike: string[]; // concrete, India-specific examples
  whatToDo: string; // short guidance, links to Get Help
};

export const issueTopics: IssueTopic[] = [
  {
    slug: "ncii",
    term: "Non-consensual intimate images",
    title: "Non-consensual intimate images (NCII)",
    short: "Someone shares, or threatens to share, an intimate image or video of you without your consent.",
    definition:
      "Non-consensual intimate imagery, or NCII, is when someone shares an intimate photo or video of you, or threatens to, without your permission. It does not matter if you took the photo yourself or sent it to someone you trusted. Sharing it without your consent is the abuse.",
    looksLike: [
      "An ex-partner posts private photos after a break-up.",
      "Images from a hacked phone or cloud account end up on a website.",
      "A private video is forwarded into a family or college WhatsApp group.",
      "Someone threatens to send your photos to your relatives unless you do what they say.",
    ],
    whatToDo:
      "Keep the post URL as text and preserve related messages. Adults can prepare a takedown notice and generate a fingerprint on their device. Sending waits for verified platform contacts and templates; blocking depends on the platform.",
  },
  {
    slug: "deepfakes",
    term: "Deepfakes and AI-made images",
    title: "Deepfakes and AI-made images",
    short: "A fake image or video made by AI to look like you, including nudes you never took.",
    definition:
      "A deepfake is an image or video made or altered by AI to look like you. That includes so-called nudify apps that turn an ordinary photo into a fake nude, and tools that swap your face onto explicit content. The image is not real, but the harm is, and it can be removed.",
    looksLike: [
      "A nudify app turns a normal photo of you into a fake nude.",
      "Your face is swapped onto a pornographic video.",
      "A fake image spreads with a caption claiming it is really you.",
    ],
    whatToDo:
      "A fake image is still image-based abuse. Use its post URL to prepare a report. The image checker can read provenance signals locally; a deeper check sends the image only with your consent.",
  },
  {
    slug: "morphing",
    term: "Morphed and edited images",
    title: "Morphed and edited images",
    short: "An ordinary photo of you edited to look sexual or compromising.",
    definition:
      "Morphing is when an ordinary photo of you is edited to look sexual or compromising. It is common when someone takes a picture from a public social media profile and alters it. Like a deepfake, it is fake, and like a deepfake, it counts as abuse.",
    looksLike: [
      "A photo from your Instagram is edited to look explicit.",
      "Your face is pasted onto another person's body.",
      "A group photo is cropped and altered to target you.",
    ],
    whatToDo:
      "Report the post URL without uploading the image to Asmita. If you already have related messages or the original photo, ask a trusted support service how to preserve them safely; do not forward intimate media.",
  },
  {
    slug: "sextortion",
    term: "Sextortion and blackmail",
    title: "Sextortion and blackmail",
    short: "Someone threatens to leak your images unless you pay money or send more.",
    definition:
      "Sextortion is when someone threatens to share your intimate images unless you pay money or send more content. It often starts with a stranger on a dating app or social media, or with a claim that they have hacked your device. The threats can escalate fast.",
    looksLike: [
      "A new online contact quickly pushes to move to a private chat and asks for a nude.",
      "Someone claims they hacked your account and have your photos.",
      "After you send one image, the demands for money or more images begin.",
    ],
    whatToDo:
      "Do not pay. Do not send anything more. Paying rarely stops it and often invites more demands. Save the messages and any payment details, stop contact, and report it. If you are in danger, call 112.",
  },
  {
    slug: "doxxing",
    term: "Doxxing and impersonation",
    title: "Doxxing and impersonation",
    short: "Your private details posted to harass you, or a fake profile pretending to be you.",
    definition:
      "Doxxing is when someone posts your private details, like your phone number, address, or workplace, to harass or endanger you. Impersonation is when someone makes a fake profile pretending to be you. The two often happen alongside image-based abuse.",
    looksLike: [
      "Your phone number or address is posted publicly to invite harassment.",
      "A fake account uses your photos and name to message people.",
      "Your private details are shared in a group to shame or threaten you.",
    ],
    whatToDo:
      "Report the fake profile or post to the platform, and ask search engines to remove results that expose your details. Our resources walk you through securing your accounts.",
  },
];

export function getIssueTopic(slug: string): IssueTopic | undefined {
  return issueTopics.find((t) => t.slug === slug);
}

export type GlossaryEntry = { term: string; definition: string };

export const glossary: GlossaryEntry[] = [
  {
    term: "NCII (non-consensual intimate imagery)",
    definition:
      "Sharing, or threatening to share, an intimate image or video of a person without their consent.",
  },
  {
    term: "Consent",
    definition:
      "A clear, freely given yes. Sending an image to one person is not consent for anyone to share it further.",
  },
  {
    term: "Deepfake",
    definition:
      "An image or video made or altered by AI to look like a real person, including fake nudes.",
  },
  {
    term: "Morphing",
    definition:
      "Editing an ordinary photo of someone to look sexual or compromising.",
  },
  {
    term: "Sextortion",
    definition:
      "Threatening to share someone's intimate images unless they pay money or send more content.",
  },
  {
    term: "Doxxing",
    definition:
      "Publishing someone's private details, such as their address or phone number, to harass or endanger them.",
  },
  {
    term: "Impersonation",
    definition: "Creating a fake account or profile that pretends to be someone else.",
  },
  {
    term: "Hash or fingerprint (PDQ)",
    definition:
      "A short code that can represent an image without being the image. Adults can generate a fingerprint on their device and submit it with a case; matching depends on participating platforms.",
  },
  {
    term: "Takedown notice",
    definition:
      "A formal request asking a platform to remove specific content, with the legal basis for it.",
  },
  {
    term: "Intermediary",
    definition:
      "A company that hosts or carries other people's content, such as a social media platform or website host.",
  },
  {
    term: "Grievance officer",
    definition:
      "The person an Indian platform must name to receive and act on complaints from users.",
  },
  {
    term: "IT Rules 2021, Rule 3(2)(b)",
    definition:
      "The Indian rule that requires platforms to act on complaints about non-consensual intimate content within a set time.",
  },
  {
    term: "MeitY NCII SOP",
    definition:
      "A government standard operating procedure that sets out how NCII complaints should be handled in India.",
  },
  {
    term: "NCRP",
    definition:
      "The National Cyber Crime Reporting Portal (cybercrime.gov.in), where you can report cybercrime, including a dedicated path for crimes against women and children.",
  },
  {
    term: "De-indexing",
    definition:
      "Asking a search engine to stop showing a page in its results. The page may still exist, but it becomes far harder to find.",
  },
  {
    term: "POCSO",
    definition:
      "The Indian law protecting children from sexual offences. Anything involving a person under 18 follows this path, not the adult flow.",
  },
];
