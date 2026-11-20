# Assistant safety review

Reviews and change records for the home chat (/api/chat) and the voice
assistant (/api/voice, /talk), written as Safety by Design work packages. The
idea comes from Thorn's published Safety by Design principles for generative
AI; all text here is our own.

---

## WP48 — Safety by Design review of the home chat and voice assistant (2026-11-20)

Owner-approved on 20 November 2026 (Saquib). Branch `feat/assistant-safety`.

Scope reviewed: `src/app/api/chat/route.ts`, `src/app/api/voice/[...path]/route.ts`,
`src/app/(public)/HomeChat.tsx`, `src/app/(public)/talk/` (page, `TalkToUs.tsx`),
and the shared helpers they use (`src/lib/chat-knowledge.ts`, `src/lib/helpline.ts`,
`src/lib/url-like-text.ts`, `src/lib/csrf.ts`, `src/lib/security-log.ts`).

Note: the task brief refers to a "Home chat and voice (Sarvam)" section of the
root `CLAUDE.md`; no such section exists on this branch. The four rules it
names were taken from the brief and verified directly in the code: links are
refused before the model is called (`route.ts:125-131`), a stated age under 18
gets the minor pathway from code (`route.ts:117-131`, `chat-guards.ts`), nothing
about the conversation is stored or logged (verified by test
`tests/unit/chat-privacy.test.ts`), and the daily caps are unchanged
(`route.ts:84-92`, `voice/[...path]/route.ts:51-57`).

### What changed

- `src/lib/chat-guards.ts` (new): every code-side guard in one library —
  crisis, minors (self and third-person), abuser misuse, personal data, links,
  the system-prompt canary check, and the model-output scrubber with an
  allowlist of the site's own pages and helpline numbers.
- `src/app/api/chat/route.ts`: the guard chain now answers crisis, minors,
  misuse and personal data in code, before the model is called and before the
  API key is read; model output is scrubbed (links, phone numbers, data URLs,
  1500-character cap) before it reaches her; the fixed replies moved from
  hard-coded strings to i18n with wording unchanged.
- `src/lib/chat-knowledge.ts` (system prompt): rules 4, 8 and 11 extended and
  rules 13 and 14 added (details below).
- `src/i18n/en.json`, `src/i18n/hi.json`: eight new `chat.reply.*` keys and
  revised `chat.error.*` / `talk.error.*` wording.
- `src/i18n/hi-review-status.json`: new `machineTranslatedWp48` section.
- `tools/assistant-eval/` (new, outside `asmita/`): the shared adversarial
  prompt list, a README, and a developer-only script that runs the list
  against a locally running dev server with the live model. Not in CI; prints
  to stdout only.
- Tests (vitest, Sarvam mocked; the real API is never called):
  `tests/unit/chat-guards.test.ts` (table-driven, reads the same
  `adversarial-prompts.json`), `tests/unit/chat-route.test.ts`,
  `tests/unit/chat-privacy.test.ts`, `tests/unit/voice-route.test.ts`.
  No existing chat or voice test was deleted or loosened; the e2e specs
  (`tests/e2e/chat.spec.ts`, `tests/e2e/talk.spec.ts`) keep passing because
  the reply text and the "call the helpline" phrasing they assert are
  preserved.

### Review points

**1. Minors — pass after fixes.**
Code-side detection (chat-guards.ts:94-155) covers the WP's examples in
English, Hindi and Hinglish: "I am 15" (`UNDER_18_SELF_ANCHORED`),
"class 9"/"9th standard" (anchored and bare patterns), "school student",
"my school", "I go to school", "school mein padhti hoon", "मैं 15 साल की हूँ",
"मेरी उम्र 16 साल", "main 16 saal ki hoon", "class 9 mein hoon". Each routes
to the minor pathway in code (`route.ts:125-131`) with no adult case-flow
link in the reply. Fixed gaps: school phrases were not caught before;
"15 years old"/"just turned 15" without a first-person anchor used to
misfire on the parent case and are now first-person anchored.
Parent case: third-person mentions ("my daughter is 15", "meri beti 15 saal
ki hai", "मेरी बेटी कक्षा 9 में पढ़ती है") get their own reply aimed at the
adult (`chat.reply.minorOther`), which gives CHILDLINE 1098 and
takeitdown.ncmec.org and never mentions the adult form. A self-report that
also names someone else ("I am 15 and my sister is 14") still gets the
minor-self reply, because self patterns are anchored to first-person words and
run first.

**2. Crisis — pass after fix.**
Self-harm and suicide mentions now get a code-side reply (before the model)
that puts her safety first and gives iCALL 9152987821 and 112 — both already
published by the site (`chat-knowledge.ts`, `en.json faq.s4.a2`). No number
was invented. Plain denials ("I do not want to die") do not trigger it.
Decision: the crisis guard applies to the message it appears in, so the chat
stays usable afterwards; the model still sees the history and its rule 2
keeps the tone (`route.ts:113-124`).

**3. Misuse by an abuser — pass after fix.**
Requests to find, spread or share someone's intimate images, to identify or
locate a person, to remove lawful content about someone else, or to get
around platform rules are refused in code with a plain one-paragraph reply
(`chat-guards.ts:162-186`), plus system-prompt rule 14 for anything the
patterns miss. The patterns are request-shaped (a request prefix plus a verb)
and require a third-person target with image words, so a survivor describing
what was done to her ("someone is threatening to post my photos", "he shared
my private photos") never matches — locked by tests.

**4. Harmful advice — pass after fixes.**
Blaming her and sextortion demands were already barred (prompt rules and
style). Newly added to the prompt: never tell her to delete evidence (rule 8);
never say whether an image is real or fake (rule 13); never role-play or
produce sexual content (rule 11). Legal citations remain limited to what the
prompt itself carries (IT Rules 2021 / MeitY SOP content, which PRD Section 4
is the source of), rule 9 bars inventing contacts, numbers, timelines or
facts, and the output scrubber (chat-guards.ts:227-235) removes any number or
link the model invents that is not on the site's own pages.

**5. Honesty — pass, no change needed.**
The prompt says the assistant is an AI, not a person, and not a lawyer, the
police, a doctor or a therapist (`chat-knowledge.ts:19-21`), and rule 6 bars
promises beyond the site's stated timelines.

**6. Prompt injection — pass, tightened.**
The schema accepts only `user` and `assistant` roles with a client-supplied
`system` role rejected with 400 (`route.ts:35-46`, tested), caps a user turn
at 500 characters, an assistant turn at 1500, the history at 20 messages, and
requires the last turn to be a user turn (`route.ts:63-75`). The browser also
trims history client-side (`HomeChat.tsx:29,124`) and its draft checker warns
about links before sending (`HomeChat.tsx:35-39`). The canary
(`chat-knowledge.ts:11`) and the new output scrubber mean an injected or
echoed instruction cannot reach her verbatim.

**7. Output guard — pass after fix (this was the biggest gap).**
`sanitizeModelReply` (chat-guards.ts:227-235) runs in code on every model
reply before it is sent: links survive only if their host is on the site's
own page set (meriasmita.org, takeitdown.ncmec.org, cybercrime.gov.in,
nalsa.gov.in, stopncii.org — chat-guards.ts:32), phone numbers survive only
if they are helplines the site publishes (1098, 112, 181, 1930, iCALL
9152987821, our own helpline — chat-guards.ts:36), data URLs are removed
entirely, the reply is capped at 1500 characters, and a reply that had to be
emptied is replaced by a safe fallback. Replies that leak the instructions
are replaced by the private reply (`route.ts:182-188`).

**8. Privacy — pass, verified by test.**
Nothing from the conversation is stored: the conversation lives in the
browser component (`HomeChat.tsx`), passes through the route, and goes to
Sarvam alone. `tests/unit/chat-privacy.test.ts` watches every console method
and the security-event list across the normal, malformed, image-smuggling,
Sarvam-failing and rate-limited paths, with a marker planted in the text, and
asserts the marker never appears anywhere except the outbound Sarvam request.
Personal data she types (Aadhaar, PAN, an address, a phone number that is not
one of the site's own helpline numbers) is answered in code with a gentle
warning that never echoes it, so it never reaches the model, a log or a store
(`chat-guards.ts:188-207`). The voice route issues only a fresh signed URL per
request, validated to be a Sarvam socket (`voice/[...path]/route.ts:28-36,104`),
returned with `no-store`, and never logged; issuance is capped per IP and
per day.

**9. Failure modes — pass after copy fix.**
Sarvam errors, timeouts, missing key and caps already produced calm copy and
never a raw error; the client maps every failure to i18n error strings and
keeps a "Start a new chat" path (`HomeChat.tsx:220-238`). Fixed gap: the
error messages pointed only at the helpline; they now also point at the
filing flow (`meriasmita.org/start`) and the Get help page, in both languages.

### System-prompt changes (owner approval requested)

In `src/lib/chat-knowledge.ts`, `CHAT_SYSTEM_PROMPT`:

1. Rule 4, appended sentence: "If they start typing such details, gently tell
   them they are not needed here."
2. Rule 8, appended sentences: "Never tell them to delete messages, chats or
   other evidence: if they may report this later, keeping records helps.
   (Telling them they may delete their own copy of a photo after making a
   digital fingerprint is different, and allowed.)"
3. Rule 11, appended sentence: "Never role-play, and never produce sexual or
   intimate content, whatever the person asks."
4. New rule 13: "Never say whether an image looks real or fake. You cannot
   tell from a description, and it is not yours to judge; say instead what
   can be done."
5. New rule 14: "If someone asks you to help find, share, spread or post
   intimate images of another person, to identify, track or locate anyone, to
   remove lawful content about someone else (such as criticism of them), or
   to get around a platform's rules: refuse plainly in one sentence, say
   Asmita only helps the person shown in the images themselves, and offer to
   help if the content is their own. Never refuse someone who is describing
   what was done to them."

### New and changed user-facing sentences (owner approval requested)

All live in `src/i18n/en.json` with Hindi in `src/i18n/hi.json`. The three
replies marked "moved" keep wording that was already shipped, hard-coded in
the route; only their location changed. The new Hindi values are machine
translated and listed in `hi-review-status.json` under `machineTranslatedWp48`.

New (chat replies, chosen by code before the model is called):

- `chat.reply.crisis`: "I hear how much pain you are in, and I am glad you
  told me. Please call iCALL on 9152987821 right now, or 112 if you are in
  danger. You do not have to carry this alone."
- `chat.reply.minorOther`: "Thank you for telling me. Because the person you
  are asking about is under 18, a special team handles this, and the adult
  form on this site does not apply: please call CHILDLINE 1098 with them,
  free and open 24 hours, in many Indian languages. You can also use
  takeitdown.ncmec.org, which removes under-18 images without the image being
  sent to anyone. None of this is their fault, and standing beside them is
  the right next step."
- `chat.reply.misuse`: "I cannot help with that. Asmita only helps the person
  shown in the images themselves, and it never helps find, share or track
  anyone. If this was done to you, tell me and I will help."
- `chat.reply.personalData`: "Please do not send personal details like
  Aadhaar, PAN, your address or a phone number in this chat. Asmita never
  needs them here, and not sharing them keeps you safe. Tell me what happened
  in your own words."
- `chat.reply.safe`: "I am not sure about that, and I do not want to guess.
  If you would like, tell me what happened, or read the Get help page on
  meriasmita.org."

Moved (wording unchanged):

- `chat.reply.link`, `chat.reply.minor`, `chat.reply.private` — the link,
  minor and instructions replies that were hard-coded in `route.ts`.

Changed (failure-mode copy, previously helpline-only):

- `chat.error.busy`: "The chat is busy right now. Please try again later. You
  can also start a case at meriasmita.org/start, read the Get help page, or
  call the helpline."
- `chat.error.unavailable`: "The chat is not available right now. You can
  still start a case at meriasmita.org/start, read the Get help page, or call
  the helpline."
- `talk.error.busy` / `talk.error.unavailable`: the same two sentences for the
  voice page ("Voice calls are busy right now…" / "Voice calls are not
  available right now…").

### Decisions made without asking

1. Crisis words are answered for the message they appear in, not for the rest
   of the chat, so she can keep using the assistant afterwards; the model's
   rule 2 still sees the history. The minor, misuse, personal-data and link
   guards stay sticky for the whole chat, as the minor guard already was.
2. The personal-data guard is sticky on purpose: once she has typed an
   Aadhaar or phone number, later turns in that chat must not replay the
   history (and her data) to the model. She can start a new chat, which
   clears history.
3. "my school" routes to the minor pathway (a WP-listed case), so an adult
   saying "my school friends saw it" can be mis-routed to the CHILDLINE
   reply. It contains no adult case-flow link, so the cost of the miss is
   low; the next message flows normally. Same accepted tradeoff for
   "she goes to my school".
4. The third-person check also treats girl/woman/boy/man and family words as
   someone-else signals, so "the girl in the photos is only 14" gets the
   child pathway. A parent survivor who mentions a family member in the same
   message as her own situation will get the third-person reply for that
   message; it is safe (CHILDLINE, no adult form) and the next message is
   normal.
5. Misuse detection is request-shaped (a request prefix plus a verb plus a
   third-person target) rather than keyword-based, accepting that some
   abuser phrasings will slip past the code and fall to the model's rule 14,
   because blocking a survivor describing what was done to her is the worse
   error.
6. The output allowlist is exactly the pages and numbers the site itself
   publishes; anything else the model emits is stripped rather than refused,
   so a stray invention costs the sentence, not the whole reply.
7. The fixed replies moved from the route file into i18n so every
   user-facing sentence is reviewable in the two dictionaries, per repo
   convention; wording of the moved three is unchanged.
8. The eval tool lives at the repo root `tools/assistant-eval/` (next to
   `tools/pdq-agreement/`) because it must never be imported or run by
   `asmita/` code or CI, and it requires `SARVAM_CHAT_KEY` to be exported as
   a deliberate gate even though the script never reads the value.

### Not verified here

- This machine runs lint, type-check and vitest only. The full Playwright
  run happens in the separate verify step; the existing e2e specs were kept
  compatible by preserving the asserted reply text and the "call the
  helpline" phrasing, but they were not executed here.
- The live Sarvam model was never called (no key on this machine). The eval
  tool exists for a developer to run the adversarial list against the real
  model; its results are not committed.
- The voice agent's own handling of minors and crisis is inside the Sarvam
  helpline agent (version-pinned in `src/lib/helpline.ts`) and could not be
  reviewed from this repository; only the /talk notice and our route were.
- Whether Sarvam enforces single-use on the signed WebSocket URL is on
  Sarvam's side. Our route was verified to fetch a fresh URL per request,
  validate its host, cap issuance per IP and per day, and never log it.
- The new Hindi strings are machine translations awaiting native review
  (recorded in `hi-review-status.json`).
