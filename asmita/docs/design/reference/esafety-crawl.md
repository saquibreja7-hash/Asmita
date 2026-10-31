# esafety.gov.au crawl — 2026-08-05

Australia's eSafety Commissioner. A government regulator that is also the country's front-door
support service for image-based abuse. The closest structural analogue to what Meri Asmita is
becoming, and the only one with a live statutory takedown flow.

Scoped crawl, not a full site sweep. Collected: navigation and audience menus, the image-based
abuse cluster, the report flow, three audience landing pages, evidence and sextortion guidance
(structure only), plus the homepage "Learn about online harm" and "Quick links" blocks.

Method note: WebFetch and curl both time out against this host from our environment, so this was
collected through the browser pane, reading the live DOM and same-origin fetches. Not gathered:
the report form list at `/report/forms` (rendered client-side, returns only chrome to a fetch),
and no sitemap enumeration, so page counts below are from nav trees rather than a full index.

## 1. Navigation and hubs

Two nav bars. The utility row carries the organisation, the main row carries the audiences.

```
About us | Key topics | Research | Newsroom
Educators | Parents | Young people | Kids | Women | Seniors | First Nations |
Communities | LGBTIQ+ | Industry                                    [Report online harm]
```

Ten audience segments as first-class top-level routes. Not tabs inside a page, not a dropdown:
ten separate site sections, each with its own landing page, tone, and reading level.
`Report online harm` sits outside the nav as a persistent button, and `Report abuse` repeats at
every single level of the mobile nav tree, which is why it showed up dozens of times when
scraping it.

`/key-topics` is a **filterable index**, not a curated hub. One card per topic with a one-line
definition, a topic filter, and pagination. Topics seen: Distressing content, Pornography, Young
men and boys hub, Image-based abuse, Domestic violence, Adult cyber abuse, Sexting and sending
nudes, Illegal and restricted online content, Cyberbullying, Technology-facilitated abuse,
Consent, Dealing with sexual extortion.

Key topic branches (partial, relevant ones only):

```
/key-topics/image-based-abuse            <- the main cluster, see section 2
/key-topics/illegal-restricted-content/  child-sexual-abuse-online, distressing-content,
                                         how-esafety-can-help, managing-the-impacts
/key-topics/domestic-family-violence/    coercive-control, collecting-evidence-safely,
                                         online-safety-checklist, technology-checkup-quiz,
                                         how-to-get-police-and-legal-help, video-library,
                                         support-service-resources/stories/<10 first names>
/key-topics/staying-safe/                consent, sending-nudes-sexting, cyberstalking,
                                         catfishing, digital-reputation, identity-theft,
                                         online-scams, unwanted-contact, pornography
/key-topics/tech-based-abuse/            i-may-be-experiencing-it, frontline-workers,
                                         about-tech-based-family-domestic-sexual-violence
/key-topics/esafety-guide                per-platform directory: how to report and lock down
                                         each social app
/key-topics/gendered-violence  /key-topics/sexual-violence
/key-topics/workplace-bullying-and-harassment/{workers,employers}
```

Note `/key-topics/tech-based-abuse/i-may-be-experiencing-it`. The URL is written in the
survivor's own uncertain voice.

## 2. Image-based abuse cluster

`/key-topics/image-based-abuse` is the hub. Page title carries the search terms survivors
actually type: "Image-base abuse (including revenge porn, sextortion and nude image blackmail)".
The typo in "Image-base" is theirs, and it has been live long enough to suggest nobody audits
titles.

Definition first, in one sentence: "Image-based abuse, sometimes called 'revenge porn', is when
someone shares, or threatens to share, an intimate image or video of a person without their
consent."

Hub page structure:

```
H1  Image-based abuse
    What is image-based abuse or 'revenge porn'?
      Consent / Revenge porn / Sextortion            <- three sub-definitions
      WATCH: What is image-based abuse?
    Social media age restrictions for under-16s
    What is an 'intimate' image or video?             <- scope definition
    What are some examples of image-based abuse?      <- concrete cases
    Anna's story                                     <- one survivor story inline
    Find out more
    Download an image-based abuse quick guide         <- PDF takeaway
```

Children of the hub:

```
/report-image-based-abuse                                  the report flow
/deal-with-sextortion                                      blackmail-specific
/managing-the-impacts-of-image-based-abuse                 wellbeing
/police-and-legal-help
/how-to-help-someone-deal-with-image-based-abuse           for supporters
/what-to-do-if-you-shared-someones-intimate-image-or-video for perpetrators
/faq-about-image-based-abuse
/getting-help-outside-australia
/stories/{anna, ariba, daniel, emily, jess, kate, luca, may, michael,
          min-jun, mitch, priya, sam, steven}             14 first-name stories
```

Two things worth copying. There is a page **for the person who did it**, framed without
absolution: "There are no excuses for image-based abuse. It doesn't matter if you felt hurt
after a relationship break-up, or you thought it would be funny." And the story set is
deliberately diverse by name and gender: Ariba, Min-jun, Priya, Luca, Daniel, Michael, Mitch,
Steven. Men and boys are visible survivors, not an afterthought.

## 3. The report flow

Reporting is layered across three pages, each one wider than the last.

`/report` is a decision gate, not a form. Its whole job is triage:

```
Immediate danger -> Triple Zero (000), stated before anything else
What you can report to eSafety      -> /report/what-you-can-report-to-esafety
What you need to know first         -> privacy and collection notice
Report now                          -> /report/forms
Staying Safe                        -> 1800RESPECT, Kids Helpline, Lifeline
```

`/report/how-to-report-serious-online-abuse-illegal-restricted-content` is the how-to layer:
how eSafety can help, what to do, filling out a report form, **what happens next** including
"Possible outcomes of an investigation". Setting expectations about outcomes before the survivor
submits, not after.

`/key-topics/image-based-abuse/report-image-based-abuse` is the survivor-facing flow. Sequence:

```
What you can report to eSafety
Who can report image-based abuse?      <- eligibility up front
How eSafety can respond                <- powers and limits, before asking for anything
  + Support in your language
  + Support for hearing or speech impairment
Steps to take
  1. Collect evidence
  2. Report image-based abuse
  3. Stop further contact, tighten security and prevent sharing
       -> Prevent the image or video being shared
  4. Get more help
Contacting the online platform yourself
  Finding contact details to report abuse
  Reporting abuse to an online platform or service
  Request removal of intimate images from search engine results
Reporting to the police
If you're not in Australia
Stay safe
```

**The four steps, close to verbatim.** This is the part most directly transferable to Asmita.

Before the steps, a softener: "You don't have to cope on your own. It's a good idea to tell a
friend, family member, co-worker or someone else you trust." Then: "Then follow these steps…"

*1. Collect evidence.* Opens by telling you what the form will ask, so evidence gathering has a
purpose: "what has happened, where and when it happened, what proof you have." Then the record
to keep: contact from the person including username, account handle or platform ID; where they
contacted you, with example platforms named; when, with dates and times; any reports already
made to the platform or police. Then the hard limit, stated inside the helpful instruction:
"Taking screenshots, photos or recordings of your device's screen is a quick and easy way to
collect evidence. But don't save or share nudes or sexual images or videos of anyone under 18 or
any other illegal or restricted content."

*2. Report image-based abuse.* "Fill out the report form to make sure we have the most important
information about your case right from the start. This allows us to assess your complaint
quickly and decide if we can help remove the content or support you in any other way." Then:
"If you're reporting on behalf of someone else, first make sure they have given you consent."

*3. Stop further contact, tighten security and prevent sharing.* Stop all contact. Mute or hide
first, **block only after collecting evidence** ("to take away their power to harass you").
Update privacy settings. Then the sub-step that matters most to us:

> "You can block your intimate image or video from being uploaded to specific platforms. You
> need a copy of the image or video, but you don't need to send it to the platform, you can use
> an online tool to create a digital 'fingerprint' (or 'hash') instead."

Under 18 goes to `takeitdown.ncmec.org`, 18+ goes to `StopNCII.org`, each with the participating
platforms listed by name (Facebook, Instagram, TikTok, Bumble, OnlyFans, Reddit for StopNCII).

*4. Get more help.* "What you're going through is not easy. Even when it's over, you may need
more support." Counselling, then the managing-the-impacts page.

Below the steps: privacy policy link, and a pointer out to the sextortion page for blackmail
cases.

## 4. Evidence and sextortion, structure only

`/key-topics/domestic-family-violence/collecting-evidence-safely`

```
Stay safe                              <- safety warning precedes the instructions
Why it's important to collect evidence <- motivation before method
What evidence to collect
Ways to collect evidence
  Take screenshots, photos and recordings
  Record the URL and source information
  Save voice recordings
  Take note of repeated behaviours
  Search your details online
  Download chat logs or account activity
  Note any monitoring or stalking
Collecting evidence for criminal charges   <- different bar, called out separately
Storing evidence
```

Opening line worth keeping: "Remember that if you're experiencing abuse, it's not your fault,
you have the right to be believed, and help is available."

Platform-specific screenshot guides live under `/report/how-to-collect-evidence/`: Mac, Windows,
iPad or iPhone, Android. Four separate pages for one trivial task, because at that moment it is
not trivial.

`/key-topics/image-based-abuse/deal-with-sextortion`

```
24/7 helplines - free and confidential     <- first thing on the page
What are the warning signs?
How you can be blackmailed
  Someone hooks you with a fake profile or 'catfishes' you
  Someone claims to have hacked your device or account
  Someone threatens you with a fake image or video
  Someone 'grooms' you
  Someone close is trying to control you
What should I do if I'm being blackmailed?
  1. Collect evidence
  2. Report sexual extortion
  3. Stop further contact, tighten security and prevent sharing
       Prevent the image or video being shared
  4. Get more help
What if I've already paid the blackmailer?  <- no shame framing
More information
```

Same four-step spine as the report page. The steps are a **reusable pattern across the whole
site**, not written fresh per page.

Opening copy names the escalation in the survivor's own timeline: "It starts with something that
seems casual, a DM, flirty chat, someone asking you to move to a private app and to share a nude
or sexual photo. Then things can change quickly. What felt casual can suddenly turn into
pressure, threats and panic."

The one instruction repeated in bold across every image-based abuse page: if you are being
blackmailed, do not pay and do not send more, stop all contact.

## 5. Audience landing pages

**`/young-people`** is a filterable card grid, no hero, no H1 in the main region. Titles are
written in first person as the thought the reader arrived with:

```
I need help: Something has happened online
My nudes have been shared
I'm being pressured to send nudes
Someone is threatening to share my nudes
Receiving unwanted nudes
I've been called out
```

Four separate pages for four states of the same problem. A survivor never has to work out which
category they fall into, the page title matches their sentence.

`/young-people/i-need-help` is a single triage page covering seven harm types, each with the same
three-part block: **The quick facts** / **How to report** or **How can I get help?** / links.
Ends with "Tips for building your online resilience", including "8 steps to help you
problem-solve" and "Map your wellbeing network".

`/young-people/my-nudes-have-been-shared` opens with a content warning: "Heads up: This page
discusses nudes, consent, dating and pressure, which may be distressing for some people." Then
the definition, stretched deliberately wide: "It's still image-based abuse if it's a screenshot
or recording of a live chat (sometimes known as capping), or a meme, or even a fake or deepfake
that has been edited to look like you." Then the four steps, prefixed by **"Before you do
anything else"**.

Then the device that is the single best thing on this site. A **"Something has happened"**
section of scenarios written as quoted speech, each ending in the same four words:

- "There's a fake nude of me online, what do I do?"
- "One of my mates got into my phone and shared a topless shot my girlfriend sent me, what do I do?"
- "Someone shared a picture of me without my hijab, what do I do?"
- "A guy at school is upset that I started going out with someone new. He says he's going to
  share the selfies we took in bed so my family finds out I'm gay, what do I do?"
- "I was dating someone from the café where I work and now they're threatening to share my nudes
  unless I hook up with them again, what do I do?"

Scenarios, not categories. Covers a deepfake, a friend's betrayal, a hijab photo, outing, and
coercion for sex rather than money. The hijab scenario appears on both nudes pages, treating
religious modesty as image-based abuse in its own right, which matters directly for India.

**`/parents`** leads with "In focus: child sexual abuse online" and splits by the child's age
rather than by harm: talking with 0 to 12, talking with 13 to 18, focus on under 5s. Practical
artefacts over advice: family tech agreement, gift guide, picture books, an online safety book.
Translated into 13 languages including Hindi, Punjabi, Tamil, Nepali, Bengali-adjacent scripts,
at `/parents/resources/online-safety-for-every-family/<language>`.

**`/women`** is the thinnest of the three, a small link hub:

```
Online risks for women
Tech-based domestic and family violence   /women/reduce-technology-facilitated-abuse
Women In The Spotlight/                   about, what is online abuse?, taking action,
                                          managing the impacts
```

"Women In The Spotlight" is a distinct sub-brand for women with public profiles: journalists,
politicians, creators. Its four-page shape is: what it is, take action, manage the impact, about.

## 6. Homepage "Learn about online harm" and "Quick links"

**Learn about online harm.** Exactly four cards, each a one-sentence plain-language definition
and a CTA. Note the CTA verbs are deliberately not uniform.

| Card | Definition | CTA |
|---|---|---|
| Cyberbullying | "when someone uses the internet to be mean to a child or young person so they feel bad or upset" | LEARN MORE |
| Adult cyber abuse | "when the internet is used to send, post or share content that is harmful to the physical or mental health of someone who is 18 or older" | READ MORE |
| Image-based abuse | "sharing, or threatening to share, an intimate image or video of a person without their consent" | FIND OUT HOW |
| Illegal and restricted online content | "material that shows or encourages child sexual abuse, terrorism or other extreme violence" | LEARN MORE |

Four harms, four sentences, no jargon, no statistics. The definitions are pitched at roughly a
grade 6 reading level and each one is a single clause. Image-based abuse gets "FIND OUT HOW",
because for that harm the reader wants an action, not information.

**Quick links.** Twenty links, no grouping, no headings. This is the site's honest list of what
people actually search for:

```
Sexting                     /key-topics/staying-safe/sending-nudes-sexting
Online dating               /key-topics/staying-safe/online-dating
Child grooming              /parents/issues-and-advice/grooming-or-unwanted-contact
Sending nudes               /parents/issues-and-advice/sending-nudes-sexting
Child sexual abuse online   /key-topics/illegal-restricted-content/child-sexual-abuse-online
Trolling                    /young-people/trolling
Deepfakes                   /industry/tech-trends-and-challenges/deepfakes
Catfishing                  /key-topics/staying-safe/catfishing
Manosphere                  /newsroom/blogs/the-manosphere-what-it-is-and-what-parents-...
Sextortion                  /key-issues/image-based-abuse/take-action/deal-with-sextortion
Parental controls           /parents/issues-and-advice/parental-controls
Doxing                      /industry/tech-trends-and-challenges/doxing
Coercive control            /key-topics/domestic-family-violence/coercive-control
Consent                     /key-topics/staying-safe/consent
Echo chambers               /young-people/echo-chambers-and-your-feed
Being neurodivergent        /young-people/using-your-neurodivergent-mind-to-thrive-online
Basic Online Safety Expectations
Teacher Professional Learning
Industry codes complaints   /industry/codes/complaints
Trusted eSafety Providers   /educators/trusted-providers
```

The list cuts straight across the audience silos. A quick link points wherever the answer lives,
even if that is buried three levels into a different section. Search intent beats IA purity.

The Sextortion link still uses the old `/key-issues/` prefix, so they renamed the whole section
to `/key-topics/` and left redirects rather than break inbound links. Worth planning for if
Asmita's IA changes after launch.

Also on the homepage, above the harm cards: a "Helpful information" row (The eSafety Guide,
community education and training, webinars, tech trends) and a research block. Advisories,
media releases and research get homepage space, so the regulator's authority is on display
without crowding out the help.

## Notable for Asmita

**The four-step spine is the whole product.** Collect evidence, report, stop contact and lock
down, get more help. It repeats across the report page, the sextortion page, the young people's
nudes pages, and the generic how-to-report page. Same four steps, retold in the vocabulary of
each audience. Asmita has the same underlying flow and should name it once and reuse it.

**Hash submission is presented as harm reduction, not technology.** "You need a copy of the image
or video, but you don't need to send it to the platform, you can use an online tool to create a
digital 'fingerprint' (or 'hash') instead." One sentence, the reassurance ("you don't need to
send it") placed before the mechanism. That is the sentence Asmita's hash flow should be
measured against. Also: eSafety sends people to StopNCII and NCMEC rather than building its own,
and lists the participating platforms by name so the survivor can judge whether it is worth
doing.

**Safety warnings precede instructions, every time.** Triple Zero before the report options.
"Stay safe" before evidence collection. Helplines at the top of the sextortion page, not the
bottom. Asmita's equivalents are the Indian helplines and the POCSO path.

**Page titles in the survivor's voice.** "My nudes have been shared", "Someone is threatening to
share my nudes", "I may be experiencing it", "I need help: Something has happened to me online".
No page is titled after a legal category. Worth auditing Asmita's routes against this.

**Scenario copy beats category copy.** The "what do I do?" quoted scenarios are the highest-value
pattern on the site and cost nothing but writing. An Indian set would need its own scenarios:
family honour and exposure to relatives, a marriage prospect being sent images, a partner
threatening to post to a community WhatsApp group, morphed images from public social photos.

**Evidence guidance carries its own safety limit.** They tell you to screenshot, then immediately
forbid saving material involving under-18s. Asmita has a stricter version of this constraint (no
media reaches the server at all) and the same obligation to state it inside the instruction
rather than in a policy page.

**Block only after collecting evidence.** Small, and easy to get wrong. Survivor instinct is to
block immediately, which destroys the record.

**A page for the person who did it.** `/what-to-do-if-you-shared-someones-intimate-image-or-video`
gives concrete steps to limit spread while refusing to excuse the act. Reduces harm through the
one person who can act fastest.

**Survivor stories are first-name, diverse, and never illustrated.** Fourteen stories under
`/key-topics/image-based-abuse/stories/`, deliberately spanning genders and cultural
backgrounds. No images anywhere near the abuse content, same constraint as Thorn.

**Outcomes are stated before submission.** "How eSafety can respond" and "Possible outcomes of an
investigation" both sit ahead of the form. Asmita should say plainly what a notice can and cannot
achieve before a survivor signs one.

**Ten audiences as top-level routes.** Ambitious for our stage. But it confirms the axis: split
by who the reader is, then repeat the same core flow in their language. Thorn splits the same
way. For Asmita the plausible first cut is survivor, someone helping a survivor, and parent or
guardian, with the POCSO path branching out of the last two.
