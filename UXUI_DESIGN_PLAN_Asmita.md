# Asmita — UI/UX Design Plan
**Version:** 0.1
**Date:** 2026-05-12
**Status:** Pre-development
**Derived from:** PRD v0.2 · TRD v0.1 · Implementation Plan v0.1

> This document defines the complete design system, screen flows, and component inventory for Asmita's Phase 1 web application. Every design decision here was made through a deliberate conversation about the platform's audience, tone, and technical constraints. Designers and developers should treat this as the source of truth for visual and interaction decisions.

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Design Tokens](#2-design-tokens)
3. [Typography](#3-typography)
4. [Spacing & Layout](#4-spacing--layout)
5. [Component Library](#5-component-library)
6. [Information Architecture](#6-information-architecture)
7. [Landing Page — Section by Section](#7-landing-page--section-by-section)
8. [Victim Flow — One Screen at a Time](#8-victim-flow--one-screen-at-a-time)
9. [Case Dashboard](#9-case-dashboard)
10. [Support Resources Page](#10-support-resources-page)
11. [Minor Pathway](#11-minor-pathway)
12. [Error & Empty States](#12-error--empty-states)
13. [Responsive Strategy](#13-responsive-strategy)
14. [Accessibility](#14-accessibility)
15. [Copy & Tone Guidelines](#15-copy--tone-guidelines)
16. [Developer Handoff Notes](#16-developer-handoff-notes)

---

## 1. Design Philosophy

### The Reference Point
Stripe's structural confidence + Notion's warmth and breathing room. Neither is copied directly — Asmita has a specific audience and purpose that both reference points were not designed for. What carries over: the typographic discipline, the whitespace generosity, the single-CTA-per-view principle, and the trust built through clarity rather than decoration.

### The Audience Constraint
Many users arrive in distress — on a mobile phone, possibly with shaking hands, possibly being watched. Every design decision is tested against this scenario: *can someone in acute distress on a small screen complete this task without getting lost?*

This is why:
- One thing per screen in the victim flow
- No competing CTAs
- No modal dialogs that interrupt flow
- Status language is plain, never technical
- Support resources are always one tap away

### What This Platform Is Not
- Not a government portal — no dense tables, no bureaucratic forms, no paragraph-heavy pages
- Not a mental health app — no pastel gradients, no "safe space" imagery, no infantilising softness
- Not a SaaS dashboard — no left nav, no notification bells, no feature menus

### The Register
**Design says:** We are competent and trustworthy.
**Copy says:** We understand this is hard.

The visual language is calm and serious. The words are direct and human. Neither tries to do the other's job.

---

## 2. Design Tokens

These are the only colours permitted on the platform. No additions without a documented reason.

### Colour

```
/* Core */
--color-hero-bg:        #0D1F1E;   /* Near-black, teal undertone — hero sections */
--color-accent:         #0A5E5A;   /* Deep teal — buttons, active states, links */
--color-accent-hover:   #085250;   /* Teal darkened 8% — button hover */
--color-accent-light:   #E6F4F3;   /* 5% teal tint — card highlights, step active bg */
--color-surface:        #F8F7F5;   /* Warm off-white — main page background */
--color-surface-white:  #FFFFFF;   /* Pure white — card backgrounds */
--color-border:         #E5E7EB;   /* Neutral border — cards, inputs default */
--color-border-focus:   #0A5E5A;   /* Teal — input focus ring */

/* Text */
--color-text:           #111111;   /* Near-black — all body text */
--color-text-muted:     #6B7280;   /* Grey — labels, captions, secondary info */
--color-text-on-dark:   #FFFFFF;   /* White — text on hero-bg */
--color-text-on-dark-muted: #A1B5B4; /* Muted white — secondary on dark sections */

/* Status */
--color-status-queued:  #9CA3AF;   /* Grey — notice queued / awaiting review */
--color-status-sent:    #0A5E5A;   /* Teal — notice sent */
--color-status-escalated:#D97706;  /* Amber — escalated */
--color-status-removed: #16A34A;   /* Green — content removed */
--color-status-error:   #DC2626;   /* Red — errors only */

/* Never use red except for actual errors. Never use green except for confirmed removal. */
```

### Border Radius

```
--radius-sm:   6px;    /* Badges, small chips */
--radius-md:   8px;    /* Buttons */
--radius-lg:   12px;   /* Cards */
--radius-xl:   16px;   /* Large containers */
--radius-full: 9999px; /* Pills / status badges */
```

### Elevation

No box shadows on victim-facing pages. Cards use border only (`1px solid var(--color-border)`). This is a deliberate Notion-style choice — clean edges, no depth tricks.

The only exception: the primary CTA button on the landing page hero gets a subtle `0 4px 24px rgba(10, 94, 90, 0.3)` teal glow on hover — a single, purposeful elevation moment.

---

## 3. Typography

### Typeface Stack

```css
/* Latin */
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

/* Devanagari (Hindi) — loaded alongside Inter */
font-family: 'Noto Sans Devanagari', 'Inter', sans-serif;
```

Both loaded from self-hosted assets (not Google Fonts CDN in production — victim IP must not be shared with third parties). See TRD I18N-03.

### Type Scale

| Token | Size | Weight | Line Height | Use |
|-------|------|--------|-------------|-----|
| `display` | 48px | 700 | 1.1 | Hero heading |
| `h1` | 36px | 700 | 1.2 | Page title |
| `h2` | 24px | 600 | 1.3 | Section heading |
| `h3` | 18px | 600 | 1.4 | Card title, step label |
| `body-lg` | 18px | 400 | 1.7 | Lead paragraphs |
| `body` | 16px | 400 | 1.6 | All body copy |
| `body-sm` | 14px | 400 | 1.5 | Captions, secondary text |
| `label` | 13px | 500 | 1.4 | Form labels, badges |
| `micro` | 11px | 500 | 1.3 | Legal fine print only |

Mobile: `display` scales to 36px. `h1` scales to 28px. Everything else stays the same.

---

## 4. Spacing & Layout

### Spacing Scale (8-point grid)

```
--space-1:   4px
--space-2:   8px
--space-3:   12px
--space-4:   16px
--space-5:   20px
--space-6:   24px
--space-8:   32px
--space-10:  40px
--space-12:  48px
--space-16:  64px
--space-20:  80px
--space-24:  96px
```

All spacing decisions use this scale. No arbitrary pixel values.

### Layout Widths

```
--width-content:  640px;   /* Victim flow forms — single column, centred */
--width-text:     720px;   /* Landing page text blocks */
--width-wide:     960px;   /* Dashboard, landing page sections */
--width-max:     1200px;   /* Absolute maximum — landing page full sections */
```

### Page Structure

```
┌──────────────────────────────────────┐
│ NAVBAR (fixed, 64px height)          │
├──────────────────────────────────────┤
│ SUPPORT BAR (static, 36px, on all    │
│ victim-flow pages) ← always visible  │
├──────────────────────────────────────┤
│                                      │
│  CONTENT                             │
│  (centred, max-width per context)    │
│                                      │
├──────────────────────────────────────┤
│ FOOTER                               │
└──────────────────────────────────────┘
```

---

## 5. Component Library

### 5.1 Navbar

**Desktop:**
```
[Asmita  अस्मिता]                    [HI | EN]  [Start Your Case →]
```
- Logo: wordmark only — "Asmita" in Inter 600, "अस्मिता" in Noto Sans Devanagari 400, slightly muted, beside it
- No navigation links in the navbar on victim-facing pages
- Language toggle: text, not a dropdown. "HI" and "EN" separated by a pipe. Active language in teal, inactive muted.
- CTA button: primary teal, 40px height, appears only on landing page. Hidden inside victim flow (no distractions).
- Background: `#FFFFFF` with `1px solid var(--color-border)` bottom border. Not sticky on landing page. Sticky on victim flow and dashboard pages.

**Mobile:**
- Logo left, hamburger right — but hamburger only opens: Language toggle + CHILDLINE helpline number + link to Support page. Nothing else. Not a full menu.

### 5.2 Support Bar

Present on all victim-flow pages (registration through dashboard). Not on landing page.

```
┌─────────────────────────────────────────────────────┐
│  Need help right now?  CHILDLINE: 1098  |  iCall: 9152987821  │
└─────────────────────────────────────────────────────┘
```

- Background: `#E6F4F3` (accent-light)
- Text: `body-sm`, `color-text-muted`
- Helpline numbers: `color-accent`, `font-weight: 600`
- 36px height. Full width. Not dismissible.

### 5.3 Buttons

**Primary Button**
```
Background:    var(--color-accent)         #0A5E5A
Text:          white, Inter 500, 15px
Height:        48px desktop / 52px mobile
Padding:       0 24px
Border-radius: var(--radius-md)            8px
Hover:         var(--color-accent-hover)   #085250
Focus:         2px offset ring, #0A5E5A
Disabled:      50% opacity, cursor: not-allowed
```

**Secondary Button**
```
Background:    transparent
Border:        1.5px solid var(--color-accent)
Text:          var(--color-accent), Inter 500, 15px
Height:        48px desktop / 52px mobile
Hover:         Background var(--color-accent-light)
```

**Destructive / Warning** (account deletion only)
```
Background:    transparent
Border:        1.5px solid #DC2626
Text:          #DC2626
Hover:         Background #FEF2F2
```

Rule: **one primary button per screen**. Secondary buttons are for back/cancel only. Never two primary buttons in view simultaneously.

### 5.4 Form Inputs

```
Label:
  font-size: 13px (--label)
  font-weight: 500
  color: var(--color-text-muted)
  margin-bottom: 6px
  display: block

Input:
  height: 52px
  border: 1.5px solid var(--color-border)    #E5E7EB
  border-radius: var(--radius-md)            8px
  padding: 0 16px
  font-size: 16px (prevents iOS zoom)
  font-family: Inter
  background: #FFFFFF
  color: var(--color-text)

  :focus
    border-color: var(--color-accent)        #0A5E5A
    outline: none
    box-shadow: 0 0 0 3px rgba(10,94,90,0.12)

  :error
    border-color: var(--color-status-error)  #DC2626

Error message (below input):
  font-size: 14px
  color: #DC2626
  margin-top: 4px
  display: flex
  align-items: center
  gap: 4px
  (small warning icon + text)
```

No red backgrounds. Error is communicated through border colour and a small inline message below the field. Nothing alarming. Nothing full-screen.

### 5.5 Progress Indicator (Victim Flow)

At the top of every victim-flow screen. Shows the current step and total steps.

```
① Register  ──  ② Declare  ──  ③ Submit  ──  ④ Done
   [filled]       [active]      [empty]      [empty]
```

- Steps shown as numbered circles (28px diameter)
- Completed: filled teal circle, white checkmark
- Active: teal border, teal number, teal label
- Future: grey border, grey number, grey label
- Connector line: solid teal for completed segments, dashed grey for future
- Labels: `body-sm`, below each circle
- On mobile: step number only (no labels), centred row

### 5.6 Status Badges

Pill-shaped. Used in the case dashboard for per-URL status.

```
[● Queued]       bg: #F3F4F6  text: #6B7280
[● Notice Sent]  bg: #E6F4F3  text: #0A5E5A
[● Escalated]    bg: #FEF3C7  text: #D97706
[● Removed]      bg: #DCFCE7  text: #16A34A
[● Awaiting Review] bg: #F3F4F6  text: #6B7280
[● Legal Package Ready] bg: #FEF3C7  text: #D97706
```

Dot before label matches text colour. Border-radius: `--radius-full`. Height 24px. Padding 0 10px. Font: `label` (13px, 500).

### 5.7 Cards

Used in the dashboard (one card per submitted URL) and in the landing page (How It Works section).

```
Background:    #FFFFFF
Border:        1px solid var(--color-border)
Border-radius: var(--radius-lg)              12px
Padding:       20px 24px (desktop) / 16px (mobile)
No box-shadow.
```

**URL Status Card (Dashboard):**
```
┌─────────────────────────────────────────────────┐
│  [Platform icon 20px]  twitter.com/user/...     │
│  Truncated URL — max 60 chars, then ellipsis    │
│                                                 │
│  [● Notice Sent]           12 May · 10:34 IST  │
│                                    [View detail →]│
└─────────────────────────────────────────────────┘
```

### 5.8 Step Screen Container (Victim Flow)

Every victim-flow screen uses this container:

```
max-width: 640px
margin: 0 auto
padding: 48px 24px (desktop) / 32px 16px (mobile)

┌─────────────────────────────┐
│  Progress indicator         │
│                             │
│  Step label (body-sm, muted)│
│  "Step 2 of 4"              │
│                             │
│  Heading (h1)               │
│  "Confirm your identity"    │
│                             │
│  Supporting text (body-lg,  │
│  muted, 1–2 lines max)      │
│                             │
│  [CONTENT — form / text]    │
│                             │
│  [Primary CTA Button]       │
│  [← Back link — plain text] │
└─────────────────────────────┘
```

Back navigation: plain text link with left arrow, `color-text-muted`, below the primary button. Never a secondary button — it should feel less prominent than moving forward.

---

## 6. Information Architecture

```
/                           Landing page
/start                      Age attestation (entry to victim flow)
/start/minor                Minor pathway (if under 18)
/register                   Email registration
/verify                     OTP verification
/declare                    Digital declaration
/verify-identity            Aadhaar / DigiLocker (optional — can skip)
/submit                     URL submission
/submitted                  Confirmation screen
/case/[ref]                 Case dashboard (authenticated)
/case/[ref]/url/[id]        URL detail + notice timeline
/resources                  Support resources (public, no auth required)
/about                      About Asmita (public)
/faq                        FAQ (public)
/privacy                    Privacy policy (public)
/legal                      Legal notices / DMCA info (public)

Admin (separate subdomain: admin.asmita.org):
/admin/login
/admin/queue
/admin/platforms
/admin/templates
/admin/metrics
```

All victim-flow pages (`/start` through `/submitted`) are a **linear, forward-only flow**. Back navigation returns to the previous step but never jumps. No step is reachable by direct URL without the session state that precedes it.

---

## 7. Landing Page — Section by Section

### Section 1 — Navbar

```
Background: #FFFFFF, 1px border-bottom
[Asmita  अस्मिता]              [HI | EN]  [Start Your Case →]
```

Not sticky on the landing page (content takes precedence). Becomes sticky on scroll past the hero.

### Section 2 — Hero (Dark)

```
Background: #0D1F1E (near-black, teal undertone)
Padding: 120px 0 (desktop) / 80px 0 (mobile)
Content: centred, max-width 720px
```

**Content structure:**
```
[Small label, ALL CAPS, teal, letter-spaced]
FREE · CONFIDENTIAL · INDIA

[Display heading, white, 48px]
"You don't have to
face this alone."

[Body-lg, muted white, #A1B5B4, max-width 520px]
"If intimate images of you have been shared without
your consent, Asmita sends legal takedown notices
on your behalf — grounded in Indian law."

[Primary CTA button — white label, teal background]
"Start Your Case →"

[Micro text, muted white]
"No images are ever uploaded. No lawyers needed.
Works across Instagram, YouTube, Telegram, and more."
```

No background imagery. No gradients. No decorative elements. The words do the work.

### Section 3 — What Asmita Does (White)

```
Background: #FFFFFF
Padding: 80px 0
Max-width: 960px, centred
```

**Three cards in a row (desktop) / stacked (mobile):**

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   [Icon]     │  │   [Icon]     │  │   [Icon]     │
│              │  │              │  │              │
│  Submit the  │  │  We send the │  │  Track every │
│  URL         │  │  legal notice│  │  platform    │
│              │  │              │  │              │
│  Paste the   │  │  Automatic,  │  │  One dashboard│
│  link. That's│  │  platform-   │  │  for all your│
│  all we need.│  │  specific,   │  │  notices and │
│              │  │  legally     │  │  removals.   │
│              │  │  grounded.   │  │              │
└──────────────┘  └──────────────┘  └──────────────┘
```

Icons: line-style, 32px, teal. No filled icons. No illustrations.

### Section 4 — How It Works (Warm Off-White)

```
Background: #F8F7F5
Padding: 80px 0
Max-width: 720px, centred
```

**Numbered steps, left-aligned, vertical on all viewports:**

```
  ①  Register privately
     Only your email. No ID required to start.
     ─────────────────────────────────────────────
  ②  Submit the URL
     Paste the link where the content appears.
     We never open, download, or view the content.
     ─────────────────────────────────────────────
  ③  We send the legal notice
     A takedown notice is sent directly to the
     platform's Grievance Officer — citing Indian
     law that requires a response within 24 hours.
     ─────────────────────────────────────────────
  ④  Track removal
     Log in any time with your case number to see
     the status. We escalate automatically if a
     platform doesn't respond.
```

Step numbers: 32px circle, teal border, teal number, Inter 700. Connector: dashed vertical line between circles.

### Section 5 — The Law Is On Your Side (White)

```
Background: #FFFFFF
Padding: 80px 0
Max-width: 720px, centred
Two columns: text left (60%) / trust signals right (40%)
```

**Left column:**
Heading (h2): *"Platforms are legally required to respond."*

Body: Plain-language explanation of IT Rules 2021 Rule 3(2)(b). Two short paragraphs. No legal jargon. Ends with: *"You don't need a lawyer or a court order. Asmita does this for you."*

**Right column (trust signals):**
```
┌───────────────────────────────┐
│  ✓ Notice templates reviewed  │
│    by IFF / SFLC.in           │
│                               │
│  ✓ Grounded in IT Act 2000,   │
│    BNS 2023, IT Rules 2021    │
│                               │
│  ✓ Platforms must respond     │
│    within 24 hours by law     │
│                               │
│  ✓ Free. Always.              │
└───────────────────────────────┘
```

Checkmarks in teal. Card border `#E5E7EB`. No background colour on the trust card.

### Section 6 — Your Privacy (Teal-Tinted)

```
Background: #E6F4F3 (accent-light)
Padding: 64px 0
Max-width: 720px, centred
```

Heading (h2): *"We never see your content."*

Three short lines with icon:
- `[Lock icon]` Your images and videos are never uploaded to Asmita.
- `[Link icon]` We only use the URL — treated as a text string, nothing more.
- `[Shield icon]` Your email is encrypted. Your case is yours alone.

### Section 7 — Support Is Here (White)

```
Background: #FFFFFF
Padding: 64px 0
Max-width: 960px, centred
```

Heading (h2): *"You're not alone in this."*

Three NGO partner cards in a row — name, one-line description, helpline number. Minimal. Not the hero of the page.

```
┌────────────────┐  ┌────────────────┐  ┌────────────────┐
│  iCall (TISS)  │  │ Cyber Peace    │  │ Red Dot        │
│                │  │ Foundation     │  │ Foundation     │
│ 9152987821     │  │ cyberpeace.org │  │ reddotfoundation│
└────────────────┘  └────────────────┘  └────────────────┘
```

### Section 8 — Final CTA (Dark, mirrors hero)

```
Background: #0D1F1E
Padding: 96px 0
Content: centred
```

Heading (h2, white): *"Ready when you are."*
Body (muted white): *"It's free. Confidential. Takes about 10 minutes."*
Primary button: *"Start Your Case →"*

### Section 9 — Footer

```
Background: #0D1F1E  (continues from CTA section, no visual break)
Border-top: 1px solid rgba(255,255,255,0.1)
Padding: 40px 0
```

**Left:** Asmita wordmark (white) + one-line description.
**Centre:** CHILDLINE: **1098** (prominent, white, large) — this is the only large-text element in the footer.
**Right:** Links — About · FAQ · Privacy · Legal · Contact

Bottom strip: `body-sm`, muted white — *"Asmita is an independent non-profit platform. Not affiliated with any government body."*

---

## 8. Victim Flow — One Screen at a Time

Every screen follows the Step Screen Container (§5.8). Progress indicator persists at the top. Support bar persists just below the navbar.

### Screen F-01 — Age Attestation

**Route:** `/start`

```
Step: — of 4   (no step highlighted yet — pre-flow)

Heading:   "Before we begin"

Body:      "This service is for adults 18 and older.
            If you are under 18, we'll direct you to
            the right support."

[  ] I am 18 or older         [  ] I am under 18

[Continue →]  (disabled until one option selected)
```

Selecting "I am under 18" changes the CTA to "Show me where to go →" and routes to `/start/minor`. No ambiguity. No shared flow.

### Screen F-02 — Minor Pathway

**Route:** `/start/minor`
See §11 for full minor pathway screen design.

### Screen F-03 — Email Registration

**Route:** `/register`
**Step:** 1 of 4

```
Step label:  "Step 1 of 4"
Heading:     "Your email address"
Body:        "This is the only thing we need to start.
              We'll send you a one-time code to confirm."

[Label] Email address
[Input — type: email, placeholder: you@example.com]

[Send Code →]

──────────────────────────────
Below input, very small muted text:
"We only use your email to send case updates.
 It is encrypted and never shared."
```

No name, no phone, no other fields on this screen.

### Screen F-04 — OTP Verification

**Route:** `/verify`
**Step:** 1 of 4 (same step — sub-step of registration)

```
Heading:  "Check your email"
Body:     "We sent a 6-digit code to [email].
           It expires in 10 minutes."

[Label] Enter the code
[Input — type: tel, inputmode: numeric, maxlength: 6,
         large font: 24px, letter-spacing: 8px,
         centred text]

[Verify →]

──────────────────────────────
[← Change email address]    [Resend code]
(plain text links, muted, below button)

Resend: disabled for 60 seconds after send.
Shows countdown: "Resend in 0:45"
```

No password. No username. OTP only.

### Screen F-05 — Digital Declaration

**Route:** `/declare`
**Step:** 2 of 4

This screen is intentionally unhurried. It asks for deliberate attention.

```
Step label:  "Step 2 of 4"
Heading:     "One important confirmation"
Body:        "Please read this carefully before continuing."

┌─────────────────────────────────────────────────┐
│  Declaration                                    │
│                                                 │
│  "I confirm that I am the person depicted in   │
│  this content, or an authorised representative  │
│  with documented consent.                       │
│                                                 │
│  I declare under the Information Technology    │
│  Act, 2000 (Section 66) and IPC Section 191    │
│  that this submission is truthful."             │
│                                                 │
│  Making a false submission is a criminal        │
│  offence under Indian law.                      │
└─────────────────────────────────────────────────┘

[☐] I have read and confirm the above declaration

[I Confirm and Declare →]    (disabled until checkbox checked)

← Back
```

The declaration box: background `#F8F7F5`, border `1px solid #E5E7EB`, padding 24px, border-radius 12px. The text inside is body size — readable, not small print.

The checkbox is large (20px × 20px). It takes a deliberate action. No pre-checking, no "by continuing you agree" patterns.

### Screen F-06 — Optional Identity Verification

**Route:** `/verify-identity`
**Step:** 2 of 4 (sub-step)

```
Heading:     "Strengthen your notice (optional)"
Body:        "Platforms take verified notices more seriously.
              You can verify your identity using Aadhaar
              offline — no Aadhaar number is ever stored."

[Card: Aadhaar Offline XML]
  How: Download your Aadhaar offline XML from UIDAI's
       website, then upload it here.
  We extract: your name only. Nothing else.
  [Upload Aadhaar XML →]  (secondary button)

[Card: DigiLocker]
  [Verify with DigiLocker →]  (secondary button)

──────────────────────────────
[Skip for now — continue without verification]
(plain text link, muted, larger than usual —
 skipping must feel equally valid)
```

Skipping is not a small link at the bottom. It is a clear, accessible option. Victims in crisis should not feel pressured to gather documents.

### Screen F-07 — URL Submission

**Route:** `/submit`
**Step:** 3 of 4

```
Step label:  "Step 3 of 4"
Heading:     "Where is the content?"
Body:        "Paste the link (URL) where you found
              the content. You can add more than one."

[Label] Web address (URL)
[Input — type: url, placeholder: https://...]

[+ Add another URL]  (text link, teal, below input)
  — each click adds another URL input field
  — max display: 5 fields; after 5 a note says
    "You can add more URLs after submitting"

──────────────────────────────
[Small info box — #E6F4F3 background]
  "We never open or download content at these
   links. The URL is used only to identify the
   platform and send the notice."

[Submit and Send Notice →]

← Back
```

If a URL fails validation (not a valid URL format): inline error below that specific field. Other fields are unaffected.

### Screen F-08 — Confirmation

**Route:** `/submitted`
**Step:** 4 of 4

```
[Large teal checkmark icon — 48px — centred]

Heading:     "Your notices are being sent."
Body:        "We've started sending takedown notices for
              [N] URL(s). You'll receive a confirmation
              email shortly with your case number."

┌─────────────────────────────────────────────────┐
│  Your case reference number                     │
│                                                 │
│  ASMITA-202605-00042                            │
│  [Copy to clipboard]                            │
│                                                 │
│  Save this. You'll need it to check your case.  │
└─────────────────────────────────────────────────┘

[Go to My Case Dashboard →]   (primary button)

──────────────────────────────
What happens next:
  ● Notice sent to platform Grievance Officer
  ● If no response in 24 hours, we escalate
  ● You'll receive email updates at each step
  ● Download your full case record any time
```

The case reference number is displayed large (h2 weight, monospace font). Copy to clipboard is a single click. This is data the victim must save — make it impossible to miss.

---

## 9. Case Dashboard

**Route:** `/case/[ref]`
**Auth:** Case ref + email OTP

### Layout

```
NAVBAR (sticky)
SUPPORT BAR

┌─ Sidebar (desktop only, 240px) ─┐  ┌─ Main content ──────────────────┐
│                                 │  │                                  │
│ Case ASMITA-202605-00042        │  │ [Status summary strip]           │
│                                 │  │ 3 URLs submitted · 1 removed     │
│ ● My URLs (active)              │  │ · 1 escalated · 1 pending        │
│   Support Resources             │  │                                  │
│   Download Case PDF             │  │ [URL card]                       │
│   Delete My Case                │  │ [URL card]                       │
│                                 │  │ [URL card]                       │
│ ──────────────────              │  │                                  │
│ CHILDLINE: 1098                 │  │ [+ Add another URL]              │
│ iCall: 9152987821               │  │                                  │
└─────────────────────────────────┘  └──────────────────────────────────┘
```

**Mobile:** Sidebar collapses. Support resources accessible via a fixed bottom bar showing helpline number. URL cards stack full-width.

### Status Summary Strip

```
┌─────────────────────────────────────────────────────────┐
│  3 URLs submitted                                       │
│  ──────────────────────────────────────────────────     │
│  [● Removed: 1]  [● Escalated: 1]  [● Sent: 1]        │
└─────────────────────────────────────────────────────────┘
```

Background `#F8F7F5`. No alarming colours. Status counts use badge colours matching §5.6.

### URL Status Card (expanded view on click)

Clicking "View detail →" expands an inline timeline (not a new page):

```
┌─────────────────────────────────────────────────────────┐
│  [Twitter icon]  twitter.com/username/status/12345...   │
│  [● Escalated]                          12 May · 10:34  │
│                                                         │
│  Timeline:                                              │
│  ✓  10:34 IST  Notice sent to @twitter Grievance Officer│
│  ✓  11:00 IST  Confirmation email sent to you           │
│  !  34:34 IST  No response — escalation notice sent     │
│  ○  Awaiting response (48-hour mark: 13 May, 10:34)     │
│                                                         │
│  [Mark as manually resolved]   [← Back to all URLs]    │
└─────────────────────────────────────────────────────────┘
```

Timeline icons: ✓ teal (done), ! amber (escalated), ○ grey (pending). Plain language. IST timestamps.

### Add URL (from dashboard)

```
[Inline form — appears below existing cards]

[Label] Add another web address
[Input — type: url]
[Add URL →]  (primary button, 40px height)
[Cancel]     (plain text link)
```

### Download Case PDF

Secondary button in sidebar / mobile menu. Triggers PDF generation (TRD FR-DASH-05). No new tab — file download directly.

### Delete My Case

Plain text link in sidebar. Clicking shows an inline confirmation (not a modal):

```
┌─────────────────────────────────────────────────────────┐
│  Delete your case?                                      │
│                                                         │
│  This removes all your data from Asmita within 30 days. │
│  You will lose access to your case dashboard and        │
│  notice history.                                        │
│                                                         │
│  This cannot be undone.                                 │
│                                                         │
│  [Yes, delete my case]  (destructive button — red)      │
│  [Keep my case]         (secondary button)              │
└─────────────────────────────────────────────────────────┘
```

---

## 10. Support Resources Page

**Route:** `/resources`
**Auth:** None required — public

Single column, `--width-text` (720px). Light, breathing layout.

**Sections:**
1. **If you're in immediate danger** — CHILDLINE 1098, large, at the top
2. **Mental health support** — iCall (TISS), full details, how to reach
3. **Cyber safety support** — Cyber Peace Foundation, Red Dot Foundation
4. **Free legal aid** — District Legal Services Authority (state selector → local contact)
5. **How to file an FIR** — step-by-step, plain language, in Hindi and English
6. **How to use cybercrime.gov.in** — step-by-step alongside Asmita
7. **FAQ** — collapsible items (accordion pattern, teal chevron toggle)

No images. No stock photos. Clean, readable. Accessible without an account.

---

## 11. Minor Pathway

**Route:** `/start/minor`
**Auth:** None — no session created

```
NAVBAR (no CTA button — not shown)
(No support bar — replaced by CHILDLINE prominently in content)

┌─────────────────────────────────────────────────┐
│  [Teal care icon — 40px]                        │
│                                                 │
│  Heading (h1):                                  │
│  "You're in the right place."                   │
│                                                 │
│  Body:                                          │
│  "Because you are under 18, we want to make     │
│  sure you get the best possible help — and that │
│  means connecting you directly to the services  │
│  best equipped for your situation."             │
│                                                 │
│  ─────────────────────────────────────          │
│                                                 │
│  [Card — most prominent]                        │
│  CHILDLINE — 1098                               │
│  Free. 24 hours. Hindi and English.             │
│  [Call 1098 →]  (tel: link, primary button)     │
│                                                 │
│  ─────────────────────────────────────          │
│                                                 │
│  [Card]                                         │
│  TakeItDown.org                                 │
│  Free global service for under-18s.             │
│  Works with platforms to remove content.        │
│  [Go to TakeItDown.org →]  (external link)      │
│                                                 │
│  [Card]                                         │
│  cybercrime.gov.in                              │
│  How to file a complaint — step by step.        │
│  [See the steps →]  (links to resources page)   │
│                                                 │
│  ─────────────────────────────────────          │
│                                                 │
│  [← Go back]  (plain text — if they mis-selected│
│               age, let them return easily)      │
└─────────────────────────────────────────────────┘
```

No Asmita case flow. No data collected. No session. No notice sent. This screen is informational only.

---

## 12. Error & Empty States

### Form Validation Errors

Inline, below the specific field. Never a page-level alert for input errors.
```
[Input with red border]
⚠ Please enter a valid web address (e.g. https://twitter.com/...)
```

### Network / Server Error

Shown as a calm inline notice at the top of the current screen — not a full-page error:
```
┌─────────────────────────────────────────────────┐
│  Something went wrong on our end. Your progress │
│  has been saved. Please try again.              │
│  [Try again →]                                  │
└─────────────────────────────────────────────────┘
```
Background `#FEF3C7` (amber tint). No red. No alarm.

### 404 Page

```
Heading:   "This page doesn't exist."
Body:      "If you're looking for your case, log in
            with your case reference number."
[Go to case login →]  (primary)
[Go to homepage →]    (secondary)
```

No custom illustration. No humorous copy. Clean, direct.

### Empty Dashboard (no URLs submitted yet)

```
[Simple empty state illustration — abstract, teal, 80px]
"No URLs submitted yet."
"Return here any time to check the status of
 your notices once you've submitted a case."
[Submit a URL →]
```

---

## 13. Responsive Strategy

### Breakpoints

```
Mobile:  < 640px
Tablet:  640px – 1024px
Desktop: > 1024px
```

### Mobile-First Rules

- All layouts designed for mobile first; desktop is an enhancement
- Minimum tap target: 48px × 48px (WCAG 2.2 AA)
- Font size on inputs: 16px minimum (prevents iOS auto-zoom)
- Horizontal scrolling: never permitted
- Tables on landing page: scroll horizontally if needed (wrapped in scroll container)
- Dashboard sidebar: hidden on mobile; accessed via bottom bar
- Progress indicator on mobile: circles only (no text labels)

### Desktop Enhancements

- Landing page sections: two-column layouts where specified (§7)
- Dashboard: sidebar visible
- Step screen container: wider breathing room (80px vertical padding vs 32px mobile)

### Font Scaling

No viewport-based (vw) font sizes. All sizes are fixed `px` or `rem`. This ensures legibility is predictable and respects user browser font settings.

---

## 14. Accessibility

### Standard: WCAG 2.2 Level AA

**Colour contrast:**
- Body text `#111111` on `#F8F7F5`: ratio 16.8:1 ✓
- White on `#0A5E5A`: ratio 5.3:1 ✓
- Teal `#0A5E5A` on white: ratio 5.3:1 ✓
- Muted text `#6B7280` on white: ratio 4.6:1 ✓ (AA for large text; borderline for small — use sparingly)

**Focus management:**
- All interactive elements have visible focus rings: `2px solid #0A5E5A, offset 2px`
- Modal dialogs (none used in victim flow by design — inline patterns only)
- On step change: focus moves to the heading of the new screen

**Screen reader:**
- Progress indicator: `aria-label="Step 2 of 4: Confirm your declaration"`
- Status badges: `role="status"`, `aria-label="Notice sent on 12 May at 10:34 IST"`
- URL truncation: full URL in `title` attribute and `aria-label`
- Form errors: `aria-describedby` linking input to error message; `aria-invalid="true"` on errored input

**No-autoplay:** No video, no animation that plays without user action.

**No flashing:** No content flashes more than 3 times per second.

**Reduced motion:** All transitions respect `prefers-reduced-motion: reduce`. The only animation in the design is a 150ms opacity fade on screen transitions in the victim flow — this is suppressed under reduced motion.

**Keyboard navigation:** Complete — every action reachable by Tab, Enter, Space, and arrow keys. No mouse-only interactions.

---

## 15. Copy & Tone Guidelines

### Voice

**Warm. Direct. Calm.** Never bureaucratic. Never clinical. Never soft to the point of vagueness.

The platform speaks like a knowledgeable friend who happens to understand Indian cyber law — not like a legal notice, and not like a therapist.

### Rules

| Do | Don't |
|----|-------|
| "We'll send the notice for you." | "Notice submission has been initiated." |
| "We never see your content." | "Content is not accessed by Asmita systems." |
| "The platform must respond in 24 hours — by law." | "Per IT Rules 2021 Rule 3(2)(b), intermediaries are obligated to..." |
| "Something went wrong. Try again." | "Error 500: Internal server error." |
| "Your case reference: ASMITA-202605-00042" | "Case ID successfully generated." |
| "You don't have to face this alone." | "Our platform provides comprehensive support services." |

### Hindi Copy

Every piece of UI copy — labels, headings, body, error messages, status labels — must exist in Hindi. Translation must be done by a qualified human translator, not machine-translated. Legal text (declaration, notice citations) must be reviewed by the legal advisor in both languages. See TRD I18N-02.

### Length

- Headings: 6 words maximum where possible
- Body text on forms: 2 sentences maximum per screen
- Landing page sections: 3–4 short paragraphs total per section
- Status messages: one line

### What Not to Say

- Do not use: "revenge porn," "leaked MMS," "explicit content," "victim" (use "you" where possible in direct UI copy)
- Do not use urgency language: "Act now," "Don't wait," countdowns
- Do not minimise: "Don't worry," "It'll be fine" — make no promises about outcomes the platform cannot guarantee

---

## 16. Developer Handoff Notes

### Component Framework
Recommend: **Next.js** (App Router) with **Tailwind CSS** configured with the custom design tokens in §2. Tailwind's configuration file should encode every token as a named value — no arbitrary colour values in component code.

### Font Loading
Both Inter and Noto Sans Devanagari must be self-hosted (see TRD I18N-03). Use `next/font` with local font files. Do not use the Google Fonts CDN in production.

### Icon Library
Use **Lucide Icons** (MIT licence, tree-shakeable, consistent line weight). Do not mix icon libraries. All icons: 20px or 24px, stroke-width 1.5, teal where coloured.

### Animation
Single transition used throughout:
```css
transition: opacity 150ms ease, transform 150ms ease;
```
Wrap in `@media (prefers-reduced-motion: no-preference)` — default is no animation.

### Language Toggle
Store language preference in `localStorage`. Apply to `<html lang="">` attribute. All i18n strings in a flat JSON file per language (`/locales/en.json`, `/locales/hi.json`). No server-side language detection — victim decides.

### Form State
Victim flow state persists in `sessionStorage` between steps (not `localStorage` — session-scoped for privacy). On browser close, state is cleared. If victim returns via direct URL to a step they haven't reached, redirect to `/start`.

### No Inline Styles
All styling via Tailwind utility classes or CSS custom properties. No `style=""` attributes on elements. This makes the design auditable and consistent.

### Linting
Enforce `eslint-plugin-jsx-a11y` in CI. Accessibility violations block deployment.

---

*Document Owner: Product Owner / Lead Designer*
*Last Updated: 2026-05-12*
*Derived from: PRD v0.2 · TRD v0.1 · Implementation Plan v0.1*
*Design decisions finalised through direct conversation on 2026-05-12*
