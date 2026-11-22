/*
 * The three free stacks (asmita/docs/lab/open-tools-spec.md, Part E):
 * step-by-step combinations of the catalogue's open tools for a specific
 * kind of organisation. Pages render from this data (WP153 and WP154).
 *
 * Every tool reference is a catalogue slug, and the tests check that. The
 * legal sentences in indiaNotes are reused verbatim from the /for-platforms
 * page (the laws array in src/app/(public)/for-platforms/page.tsx), as the
 * spec requires, and every indiaNotes array ends with the spec's
 * not-legal-advice line. No money figures, no promises, no other law.
 */

import type { Stack } from "./types";

export const STACKS: readonly Stack[] = [
  {
    slug: "stop-reuploads",
    title: "Stop intimate images coming back to your platform",
    forWho:
      "A small or medium Indian platform (social, dating, forum, file or image hosting, adult content) with one or two engineers.",
    lede: "When a platform removes an intimate image, the same file usually comes back. This stack stops re-uploads with open hashing tools and a human reviewer, in about a month of part-time work.",
    time: "2 to 4 weeks",
    people: "1 engineer, 1 trained reviewer",
    resources: "Free software; one small server or container for HMA and its Postgres database",
    steps: [
      {
        name: "Write down what you will do with a match",
        tools: [],
        what:
          "Policy comes first: decide what happens when a hash matches. Block the upload outright, hide it until a reviewer looks, or remove it and notify the uploader. Name the reviewer who confirms matches, and decide the clock you work to; the India notes below state the timelines intermediaries in India are expected to meet.",
        why:
          "A hash match is a lead, not proof. Without a written policy, matches either get ignored or get acted on blindly, and both harm people.",
        need: "One page in your policy document, and a named reviewer with time budgeted.",
        doneWhen: "A one-page written policy exists, names the reviewer and the action per match type.",
        mistakes: [
          "Auto-deleting on any match without a person looking first.",
          "Writing a policy no reviewer has read.",
        ],
      },
      {
        name: "Hash every image and video on upload",
        tools: ["pdq", "vpdq"],
        what:
          "Compute a PDQ code for every image and a vPDQ fingerprint for every video at upload time, and store the code and its quality score next to the media record. Ignore codes whose quality is below 50; they are unreliable.",
        why:
          "A code stored once at upload makes every later check a fast comparison instead of a new job.",
        need: "The PDQ and vPDQ implementations from Meta's ThreatExchange repository, and ffmpeg for videos.",
        doneWhen: "Every new upload has a stored code, and a re-uploaded test image produces a match.",
        mistakes: [
          "Hashing a thumbnail or preview instead of the original file.",
          "Forgetting videos, which are half of the problem.",
          "Storing codes with no quality score, so junk codes flood the matcher.",
        ],
      },
      {
        name: "Run a matcher",
        tools: ["hma"],
        what:
          "Run Hasher-Matcher-Actioner with one bank for content you have removed yourself. Send each upload's code to it and get matches back through its API.",
        why:
          "HMA stores the banks, compares codes and returns matches, so you do not build matching infrastructure yourself.",
        need: "A small server or container, and a PostgreSQL database; HMA publishes Docker images.",
        doneWhen: "An image you removed, uploaded again, comes back as a match in HMA.",
        mistakes: [
          "Running HMA with no policy behind it.",
          "Treating a match as a removal order.",
        ],
      },
      {
        name: "Connect outside sources",
        tools: ["stopncii", "asmita-fingerprint-feed", "take-it-down"],
        what:
          "Join StopNCII.org for hashes of adults' intimate images, apply to Asmita's partner programme for survivor-consented fingerprints from India, and use Take It Down for anything involving a person who was under 18.",
        why:
          "Your own bank only knows what you have already removed. Outside sources tell you what survivors have already reported elsewhere.",
        need: "Membership or approval from each programme, which each one provides its own way.",
        doneWhen: "At least one external bank is syncing into your matcher on a schedule.",
        mistakes: [
          "Mixing minor-related hashes into the adult review flow; keep those on a separate, restricted path.",
          "Joining a programme and never matching against its bank.",
        ],
      },
      {
        name: "Review matches",
        tools: ["coop"],
        what:
          "Send each match to a review queue with the content and the reason it matched. A trained reviewer confirms the match and records the decision. Coop gives you queues, a review screen, decisions and appeals without building your own console; your existing admin tool also does if it can record who decided and when.",
        why:
          "A match within distance 31 is a strong lead, not proof. A person must look before anything is removed.",
        need: "A reviewer trained on intimate-image cases, and a queue they can work.",
        doneWhen: "Matches land in a queue and every decision is recorded with who took it and when.",
        mistakes: [
          "Letting the queue grow faster than the reviewer can work it.",
          "No record of who decided what.",
        ],
      },
      {
        name: "Catch edited copies (optional, later)",
        tools: ["sscd"],
        what:
          "Add SSCD as a second layer for reported content or high-risk areas: store a vector per image and compare by similarity, which catches crops, filters, overlays and screenshots that hashes miss.",
        why:
          "Abusers edit images precisely to defeat hashing; a vector match survives edits that a bit-count does not.",
        need: "A PyTorch environment, a vector store, and compute per image; run it only where the volume justifies it.",
        doneWhen: "A cropped copy of a removed image is flagged in a test.",
        mistakes: [
          "Running SSCD on every upload before you need to; it is far heavier than hashing.",
          "Acting on a similarity score without review.",
        ],
      },
      {
        name: "Record outcomes and report back",
        tools: ["asmita-fingerprint-feed"],
        what:
          "Log what you removed and when, and how many re-uploads you blocked. If you are an Asmita partner, report outcomes through the partner API so the survivor sees results on her case.",
        why:
          "Numbers prove the system works and keep the reviewer's workload visible; partner reporting closes the loop for the survivor.",
        need: "A log query or a metrics page, and a partner key if you report to Asmita.",
        doneWhen: "You can say how many re-uploads you blocked last month, from a number, not a guess.",
        mistakes: [
          "Removing quietly and never counting; the case looks stalled to the survivor.",
          "Reporting outcomes without recording them internally first.",
        ],
      },
    ],
    plan: {
      week1: [
        "Write the one-page policy and name the reviewer.",
        "Hash images with PDQ on upload and store the codes.",
        "Get HMA running locally against your own bank.",
      ],
      weeks2to3: [
        "Move HMA to its permanent container with its Postgres database.",
        "Join StopNCII and connect its exchange.",
        "Send matches to the review queue and train the reviewer.",
        "Hash videos with vPDQ if your platform carries them.",
      ],
      month2: [
        "Tune thresholds from review outcomes.",
        "Add SSCD for reported content.",
        "Report monthly numbers, and outcomes to Asmita if you are a partner.",
      ],
    },
    wontCatch: [
      "Images never reported or hashed anywhere; unknown content cannot match.",
      "Heavily edited, cropped or mirrored copies: hashes miss them, and SSCD helps but is not complete.",
      "New AI-made images of a real person that copy no existing image.",
      "Content inside private messages you do not scan.",
      "Links to copies on other sites; your blocks act on your own uploads.",
    ],
    indiaNotes: [
      "Rule 3(2)(b) of the IT Rules, 2021 requires intermediaries to act on a complaint about non-consensual intimate content within 24 hours.",
      "The IT Rules Amendment of 2026 shortens that to two hours for non-consensual nudity.",
      "MeitY's Standard Operating Procedure of November 2025 sets out how intermediaries handle these complaints, including stopping the same content from returning.",
      "Images in India are often forwarded through WhatsApp, which re-compresses them. PDQ usually survives this; test with your own re-compressed samples.",
      "This is a summary for orientation, not legal advice. Check the current rules with your own lawyer.",
    ],
    withAsmita: [
      "Asmita's partner programme gives your platform fingerprint alerts when a survivor agrees to share, crawler monitoring of your public pages with your written permission, one takedown channel for notices, and checks that removed content stays down. Read the For platforms page on this site and apply there.",
      "If a survivor's fingerprint matches content on your platform, report the outcome through the partner API; it shows on her case.",
    ],
  },
  {
    slug: "ai-app-guardrails",
    title: "Stop your AI image or video tool being used to undress people",
    forWho: "A team adding image or video editing or generation to an app.",
    lede: "A prompt-based editor can be misused to undress a photo of a real person. This stack puts a classifier in front of the model, a face check, signed outputs and a report path.",
    time: "1 to 2 weeks for the first guardrails",
    people: "1 engineer, 1 person for review and policy",
    resources: "Free models; a CPU is enough for the prompt classifier; a GPU only if you add a large policy model",
    steps: [
      {
        name: "Write the rule",
        tools: [],
        what:
          "State the policy in plain words: no sexualised edits of real people without proof of consent, no undressing, nothing involving minors, ever. Put it in your terms of service and in the product itself, not only in an internal document.",
        why:
          "A classifier enforces a rule; if the rule is not written down, every block looks arbitrary and every miss looks like policy.",
        need: "Your terms of service, and a product surface for the message.",
        doneWhen: "The rule is in your terms and visible in the product.",
        mistakes: [
          "A rule that lives in a slide deck.",
          "An exception process with no record of who approved what.",
        ],
      },
      {
        name: "Classify every editing prompt before it runs",
        tools: ["ncii-prompt-guard"],
        what:
          "Run the 3-class NCII Prompt Guard model on every prompt before the image model sees it. Block the prompts it scores as block, send the review band to a person or ask the user to rephrase, and allow the rest. Set the thresholds on your own test prompts.",
        why:
          "The classifier is the cheapest place to stop abuse: no image is generated, no user waits, and the CPU cost is small.",
        need: "The transformers library and a CPU in your request path.",
        doneWhen: "A test set of harmful and harmless prompts gives the block rate you chose.",
        mistakes: [
          "Trusting it for Hindi or Hinglish prompts without testing; build your own test set in the languages your users type.",
          "Blocking the review band outright, which throws away the nuance the labels carry.",
        ],
      },
      {
        name: "Handle prompts the classifier is unsure about",
        tools: ["gpt-oss-safeguard"],
        what:
          "For the review band, and only if you have the hardware, run a policy-following model: give it your written rule and the prompt, and it returns a verdict with its reasoning. Optional, and worth it only at volume.",
        why:
          "The middle band is where blunt rules either over-block innocent edits or let abuse through; a reasoning model reads the actual policy.",
        need: "A GPU server for the model, and your policy written as text.",
        doneWhen: "Review-band prompts get a decision with a reason attached.",
        mistakes: [
          "Running a large model on every prompt; it belongs on the hard cases.",
          "Letting the model's verdict act with no human sample check.",
        ],
      },
      {
        name: "Check input images for real faces",
        tools: ["yunet"],
        what:
          "Detect faces in the input image with a lightweight detector such as YuNet. If the input contains a real person's face and the edit the classifier allowed is sexual, refuse it under your rule.",
        why:
          "The prompt alone cannot say whether a real person is in the frame; the face check closes that gap.",
        need: "An OpenCV DNN face detector in your pipeline, CPU only.",
        doneWhen: "The refusal path is tested with a real-faced input and a sexual edit prompt.",
        mistakes: [
          "Running the face check before the prompt check and wasting work.",
          "Silent refusals; tell the user which rule applied.",
        ],
      },
      {
        name: "Sign what you generate",
        tools: ["c2pa"],
        what:
          "Attach a Content Credential to every image and video your app outputs, stating that it was generated or edited by your AI feature.",
        why:
          "A signed credential is evidence later: a platform, a reviewer or the person in the image can see the file was AI-made, and honest tools are distinguishable from ones that hide.",
        need: "The c2pa-rs or c2pa-js SDK in your output path.",
        doneWhen: "An output verifies at the public Content Credentials verify tool.",
        mistakes: [
          "Signing only some outputs.",
          "Forgetting that re-uploads strip credentials; sign anyway, because surviving copies still carry evidence.",
        ],
      },
      {
        name: "Log and review refusals",
        tools: [],
        what:
          "Keep counts of blocked and reviewed prompts, and review samples weekly to tune thresholds. Do not keep prompt text longer than your privacy policy allows.",
        why:
          "Thresholds drift as usage changes; weekly samples catch both over-blocking and new abuse patterns.",
        need: "A counter, a sample log, and half an hour a week.",
        doneWhen: "There is a weekly number for blocked and reviewed prompts.",
        mistakes: [
          "Logging prompt text forever with no retention rule.",
          "Never reading the log you built.",
        ],
      },
      {
        name: "Give a way to report misuse",
        tools: [],
        what:
          "Put a report control on every generated result that reaches a person on your team. Link survivors to help: Asmita's Get help page serves people in India.",
        why:
          "Abuse that gets past every automatic layer still needs a path to a human, and a survivor who finds you should find help too.",
        need: "A monitored inbox or queue, and the link on every result page.",
        doneWhen: "The report link is visible on every generated result page.",
        mistakes: [
          "A report address nobody reads.",
          "Hiding the report control behind a menu.",
        ],
      },
    ],
    plan: {
      week1: [
        "Write the rule into your terms and product.",
        "Add the prompt classifier to the request path.",
        "Set thresholds on a first test set of prompts.",
      ],
      weeks2to3: [
        "Add the face check and the refusal message.",
        "Sign outputs with Content Credentials.",
        "Add the report link and route it to a person.",
      ],
      month2: [
        "Build a multilingual test set in the languages your users type.",
        "Add a policy model for the review band if the volume justifies it.",
        "Tune thresholds from weekly review samples.",
      ],
    },
    wontCatch: [
      "Harmful requests phrased innocently, in words the classifier does not read as risky.",
      "Edits made step by step across several prompts.",
      "Images produced elsewhere and only hosted or shared on your app.",
      "Users who strip Content Credentials from your outputs.",
      "Languages the classifier was not trained on; it was trained mainly on English.",
    ],
    indiaNotes: [
      "Users type prompts in Hindi, Hinglish, Hindi written in the Latin script, and other Indian languages. The prompt classifier was trained mainly on English, so build a test set in the languages your users use before trusting it.",
      "If your app also hosts content, the complaint timelines intermediaries are expected to meet apply to you too: Rule 3(2)(b) of the IT Rules, 2021 requires intermediaries to act on a complaint about non-consensual intimate content within 24 hours.",
      "The IT Rules Amendment of 2026 shortens that to two hours for non-consensual nudity.",
      "This is a summary for orientation, not legal advice. Check the current rules with your own lawyer.",
    ],
    withAsmita: [
      "The AI Lab welcomes test prompts and results in Indian languages; write to the Lab through the site's feedback page.",
      "If a survivor reports content made with your app, Asmita can tell you about it; contact us to discuss how that would work. Nothing on this page promises more than that.",
    ],
  },
  {
    slug: "rules-and-review",
    title: "Run rules and human review at scale",
    forWho: "A platform with a trust-and-safety team and an engineering team, or one growing fast.",
    lede: "Once volumes rise, a shared inbox stops working. This stack puts hash signals, a review console, real-time rules and measured queues under one written policy.",
    time: "1 to 3 months",
    people: "2 or more engineers, a review team",
    resources: "Several servers: Coop needs PostgreSQL, Scylla, ClickHouse and Redis; Osprey needs its own stack",
    steps: [
      {
        name: "Policies and queues first",
        tools: [],
        what:
          "Write policies with concrete examples, and design queues by harm type and urgency. NCII gets its own queue; anything involving minors goes to a separate, restricted path with its own rules. Agree what counts as urgent in each queue, and what the first response to an urgent report is.",
        why:
          "Queues without written policy produce inconsistent decisions; policy without queues is a document nobody follows.",
        need: "Your policy documents and a queue design on paper before any tool is installed.",
        doneWhen: "Every report type maps to exactly one queue.",
        mistakes: [
          "One giant queue for everything; urgent cases drown.",
          "No restricted path for minors.",
        ],
      },
      {
        name: "Hash matching as a signal",
        tools: ["hma", "pdq", "vpdq", "stopncii", "asmita-fingerprint-feed"],
        what:
          "Hash every upload, image and video, and match against banks: your own removals, StopNCII for adults, Asmita's feed for survivor-consented fingerprints if you are a partner. Feed matches into the review queues as signals.",
        why:
          "Hash signals are cheap, precise and already waiting in the programmes survivors use.",
        need: "HMA with its Postgres database, and membership of the programmes you draw from.",
        doneWhen: "Matches arrive as signals attached to items in review.",
        mistakes: [
          "Treating a hash match as a decision rather than a signal.",
          "Forgetting video hashing and finding only images.",
        ],
      },
      {
        name: "Review console",
        tools: ["coop"],
        what:
          "Deploy Coop as the place reviewers work: routing rules place items in queues, the review screen shows content with context, decisions record who and when, and appeals have their own flow. Turn the wellness settings, blur, greyscale and muted video, on for everyone by default. Bulk actions exist for the days one queue floods; use them with the same recording as single decisions.",
        why:
          "A console built for the work, with reviewer safety designed in, beats a ticketing system pressed into service.",
        need: "Servers for Coop and its four databases, and an engineer to run them.",
        doneWhen: "Reviewers work from queues with recorded decisions and appeals.",
        mistakes: [
          "Wellness settings left off because nobody looked at them.",
          "No appeals path; decisions with no recourse erode trust.",
        ],
      },
      {
        name: "Real-time rules",
        tools: ["osprey"],
        what:
          "Stream sign-up, post and message events to Osprey, and write rules for the patterns that matter: new accounts mass-uploading, repeat uploaders of removed content, bursts from one network. Let rules label accounts and send verdicts back to your systems. Start with rules that flag for review rather than act on their own, and promote a rule to enforcement only after its results hold up.",
        why:
          "Patterns across many items are invisible to a reviewer working one item at a time.",
        need: "Osprey running, an event stream from your platform, and someone who can write rules.",
        doneWhen: "A rule labels a planted test pattern within seconds of it appearing.",
        mistakes: [
          "Streaming everything and writing no rules.",
          "Rules that act with no appeal path behind them.",
        ],
      },
      {
        name: "Models as signals, not judges",
        tools: ["gpt-oss-safeguard", "ncii-prompt-guard", "gend", "sscd"],
        what:
          "Where they fit, add model scores next to items in review: a policy-following model for hard text cases, the prompt classifier if you have AI features, a deepfake detector such as GenD for reported videos, and SSCD vectors for edited copies. Document the threshold for each.",
        why:
          "Model scores prioritise reviewer time; they do not replace the decision.",
        need: "The models' hardware, and thresholds documented per signal.",
        doneWhen: "Model scores appear next to items in review, with thresholds documented.",
        mistakes: [
          "Auto-enforcing on a model score.",
          "Undocumented thresholds nobody can explain later.",
        ],
      },
      {
        name: "Measure",
        tools: [],
        what:
          "Track time to first review, handle time, re-uploads blocked and appeal overturn rate, and publish them weekly to the team. Reviewer workload and queue depth belong in the same report, because a queue that grows for three weeks is a staffing answer waiting to be read.",
        why:
          "Numbers show where the queue is thin and which rules work; without them every staffing debate is an opinion.",
        need: "Coop's metrics plus a weekly report.",
        doneWhen: "A weekly report exists and is read.",
        mistakes: [
          "Measuring volume only; speed and overturn rate matter as much.",
          "Publishing numbers nobody acts on.",
        ],
      },
    ],
    plan: {
      week1: [
        "Write the policies with examples, and design the queues.",
        "Stand up HMA with its Postgres and your own bank.",
        "Hash uploads, images and video, and light up the first signals.",
      ],
      weeks2to3: [
        "Deploy Coop with routing rules and wellness defaults.",
        "Train reviewers on queues, decisions and appeals.",
        "Connect StopNCII and, if you are a partner, Asmita's feed.",
      ],
      month2: [
        "Stream events to Osprey and write the first rules.",
        "Add model signals with documented thresholds.",
        "Start the weekly metrics report.",
      ],
    },
    wontCatch: [
      "Anything outside the events you send; Osprey sees only your stream.",
      "New abuse patterns until someone writes a rule for them.",
      "Model blind spots: Indian languages and compressed images score worse than English and clean files.",
      "Content on platforms that never joined your programmes.",
    ],
    indiaNotes: [
      "Rule 3(2)(b) of the IT Rules, 2021 requires intermediaries to act on a complaint about non-consensual intimate content within 24 hours.",
      "The IT Rules Amendment of 2026 shortens that to two hours for non-consensual nudity.",
      "MeitY's Standard Operating Procedure of November 2025 sets out how intermediaries handle these complaints, including stopping the same content from returning.",
      "Significant social media intermediaries have further duties under the IT Rules; check them with your lawyer.",
      "This is a summary for orientation, not legal advice. Check the current rules with your own lawyer.",
    ],
    withAsmita: [
      "The partner programme, as in the re-uploads stack: fingerprint alerts when survivors agree to share, crawler monitoring of your public pages with your written permission, one takedown channel and stay-down checks. Read the For platforms page on this site.",
      "Report outcomes through the partner API so survivors see results on their cases.",
    ],
  },
];

/** Slug lookup for the stack pages (WP153 and WP154). */
export const STACK_BY_SLUG: ReadonlyMap<string, Stack> = new Map(
  STACKS.map((stack) => [stack.slug, stack]),
);

export function getStack(slug: string): Stack | undefined {
  return STACK_BY_SLUG.get(slug);
}

/**
 * The stacks whose steps use one catalogue tool, in STACKS order. The tool
 * pages' closing band links to these (spec Part C3, WP152): a platform that
 * has read about one tool can jump straight to the guide that uses it.
 */
export function stacksUsingTool(slug: string): readonly Stack[] {
  return STACKS.filter((stack) =>
    stack.steps.some((step) => step.tools.includes(slug)),
  );
}
