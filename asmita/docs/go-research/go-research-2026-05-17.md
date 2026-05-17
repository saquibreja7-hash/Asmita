# Grievance Officer research — 2026-05-17

**Researcher:** Claude (AI). Acting as a starting point for a human GO researcher.
**Sources:** Public web searches + direct fetches from platform help pages. Each entry below cites the URL it came from.

## ⚠️ Read this before you import anything

**This document is NOT a green light to bulk-import these into the database.** Asmita's policy (see `Desktop/Asmita/TODOS.md` FORBIDDEN list, rule 1) is that every Grievance Officer entry must be **verified by a human against the platform's current official page** before it is marked verified. Names and emails change frequently (WhatsApp's GO has rotated at least twice; Meta's GO has changed; Twitter renamed to X mid-stream).

For each platform below:

1. **Open the source URL listed.** Confirm the page still exists and the contact information matches what is below.
2. **Look for a "last updated" date** on the platform's page. If older than 6 months, treat as suspect — the GO may have rotated.
3. **Open the Asmita admin → /admin/platforms page.** Find the platform row, click `Edit`, paste the verified values, paste the **canonical platform URL** (not this research doc) into the `Source URL` field, check `Mark contact verified by human`, save.
4. The system records who verified it (your admin session user) and the source URL in `PlatformGoHistory` with an audit-log entry — that's your accountability trail.

If a contact is missing, leave the field blank in the admin UI. The platform stays unverified and Asmita continues to refuse to send to it.

---

## ⚠️ Critical regulatory update (Nov 2025)

**MeitY issued a uniform 24-hour NCII takedown SOP on 11 November 2025.** This is more recent than the IT Rules 2021 framework Asmita's PRD was written against, and it changes the routing landscape.

Key facts of the SOP:

- Intermediaries (social media, messaging apps, search engines) must remove or disable access to NCII **within 24 hours of a verified complaint**. This includes real photos/videos, hidden-camera footage, and AI-generated deepfakes.
- The **Indian Cybercrime Coordination Centre (I4C)** maintains a national "hash bank" so platforms can auto-detect re-uploads.
- Platforms must **confirm to the victim** what action was taken, typically within 36 hours of takedown.
- Government-recognised reporting channels for victims:
  - **National Cybercrime Reporting Portal (NCRP) helpline: 1930**
  - One-Stop Centres (OSCs) for women
  - Local police stations
- Search engines (Google, Bing) must de-index NCII from results within 24 hours.
- The Department of Telecommunications coordinates with ISPs to throttle access to offending URLs.

**Implications for Asmita:**

- The 24h SLA Asmita is built around is now also a government-mandated SOP, which is good — your case for "platforms must respond" got stronger.
- Asmita's PRD currently defers hashing to Phase 2. The MeitY SOP envisions hash-bank integration. If you want survivor URLs to be added to the I4C hash bank, that's a Phase 2 hook to plan for.
- The NCRP 1930 helpline should probably be surfaced more prominently in Asmita's UI — it's now the government's official intake.

Source: [The420.in — India Rolls Out 24-Hour Takedown Protocol](https://the420.in/meity-24-hour-ncii-takedown-protocol-revenge-porn-deepfake-removal-india/)

---

## Tier 1 — high-priority platforms

### Meta (Facebook + Instagram + Threads)

| Field | Value | Confidence |
|---|---|---|
| `grievance_email` | `fbgoindia@support.facebook.com` | Medium — cited by multiple Indian cybercrime blogs; not directly fetched from Facebook's own page in this research (the page was truncated). **Verify on the official page before saving.** |
| `grievance_address` | Meta Platforms, Inc, Unit 28 and 29 The Executive Centre, Level 18, DLF Cyber City, Building No. 5, Tower A, Phase III, Gurgaon, 122002, India | Medium — same caveat |
| `grievance_name` | _(rotates frequently; check the page today)_ | Low — name changes every few months. As of 2025 articles, **Spoorthi Priya** had been named at some point, but verify |
| `form_url` | Use the in-product report flow: Facebook/Instagram → Settings → Help → Report a Problem → flag for non-consensual intimate imagery. There is also https://www.facebook.com/help/contact/567360146613371 (NCII direct form) | High for the URLs |
| `source_url` to record | https://www.facebook.com/help/172990116225777 | — |

**Special NCII-specific channel:** Meta partners with [StopNCII.org](https://stopncii.org/) for hash-based reporting of NCII. Survivors create a hash from their own image client-side, upload only the hash, and Meta proactively removes matches. This is Phase 2 territory for Asmita but worth knowing — it's an alternative recommended route for survivors **right now**, while Asmita is still being built.

**Sources:**
- [Facebook Help — Contact the Grievance Officer and Facebook in India](https://www.facebook.com/help/172990116225777)
- [Facebook Help — How to contact the Grievance Officer and Meta in India](https://www.facebook.com/help/1359806704386690)
- [Meta — Contact the Grievance Office of Meta AI and Vibes in India](https://www.meta.com/help/artificial-intelligence/565790859906778/)
- [Cyberdeepakyadav — Facebook Helpline guide](https://cyberdeepakyadav.com/how-to-contact-facebooks-grievance-officer-for-user-complaints)
- [The420.in — Contact List Of Grievance Officers](https://the420.in/know-all-about-grievance-officers-of-the-social-media-giants-and-how-to-contact-them/)

---

### YouTube / Google India

| Field | Value | Confidence |
|---|---|---|
| `grievance_name` | Suraj Rao _(reported as Resident Grievance Officer for YouTube in older sources; verify current name)_ | Low — name almost certainly rotated since 2021 |
| `grievance_email` | _Not extracted in this research; the canonical page is the source of truth_ | — |
| `form_url` (general) | https://www.youtube.com/t/contact_us?gl=IN | High |
| `form_url` (NCII-specific, **strongly recommended**) | https://reportcontent.google.com/forms/explicit_content_intimate_imagery | High — dedicated NCII removal form |
| `form_url` (Google grievance) | https://www.google.com/intl/en_in/contact/grievance-officer.html | High |
| `source_url` to record | https://www.google.com/intl/en_in/contact/grievance-officer.html | — |

**Special NCII channel:** Google has a dedicated [Remove explicit or intimate personal images from Google Search](https://reportcontent.google.com/forms/explicit_content_intimate_imagery) form. This bypasses the generic grievance route and routes directly to a trained reviewer. It is already in your seed data and should be the **primary** dispatch route for any Google-domain URL.

**Sources:**
- [Google — Grievance Mechanism for India](https://www.google.com/intl/en_in/contact/grievance-officer.html)
- [YouTube — Other legal complaints (India)](https://support.google.com/youtube/answer/9996224?hl=en&co=GENIE.CountryCode%3DIN)
- [YouTube — Contact Us](https://www.youtube.com/t/contact_us?gl=IN)
- [Affairs Cloud — Google India first SSMI transparency report](https://affairscloud.com/google-india-becomes-1st-ssmi-to-publish-transparency-report-under-new-it-rules/)

---

### WhatsApp (Meta)

| Field | Value | Confidence |
|---|---|---|
| `grievance_name` | **Has rotated multiple times.** Originally Paresh B Lal (2021, resigned within 6 months). Then Varun Lamba (interim, AZB & Partners). Most recent secondary source: **Siddhartha Nahar**. Verify on WhatsApp's current page. | Low — rotates |
| `grievance_email` | `grievance_officer_wa@support.whatsapp.com` | Medium — historically stable; verify |
| `grievance_address` (older) | Post Box No. 56, Road No. 1, Banjara Hills, Hyderabad - 500 034, Telangana | Low — outdated; newer secondary source gives Gurgaon DLF Cyber City |
| `grievance_address` (newer secondary) | WhatsApp LLC, Unit B8 and B10 The Executive Center, Level 18, DLF Cyber City, Building No. 5, Tower A, Phase III, Gurgaon – 122002, India | Medium |
| `source_url` to record | https://www.whatsapp.com/legal/india-grievance-officer (Verify URL is current) | — |

**Sources:**
- [Zee News — WhatsApp names Paresh B Lal](https://zeenews.india.com/technology/whatsapp-names-paresh-b-lal-as-india-grievance-officer-check-how-to-raise-grievance-2365973.html)
- [Business Insider — WhatsApp's Grievance Officer quit within six months](https://www.businessinsider.in/tech/enterprise/news/whatsapps-grievance-officer-quits-within-six-months-and-facebook-is-looking-for-a-replacement/articleshow/88049265.cms)
- [TakedownPanel — Grievance Officers India List](https://takedownpanel.com/grievance-officers-social-media-india-it-rules/)
- [Cyberdeepakyadav — WhatsApp's Grievance Officer reporting guide](https://cyberdeepakyadav.com/a-step-by-step-guide-to-reporting-to-whatsapps-grievance-officer)

---

### X / Twitter

| Field | Value | Confidence |
|---|---|---|
| `grievance_email` | **NO EMAIL.** X explicitly states the Resident Grievance Officer cannot be contacted by email. Use the form. | High — confirmed from X's own help page |
| `form_url` (the only route) | https://help.x.com/en/forms/report-to-grievance-officer-india | High |
| `grievance_address` | X Corp., 8th Floor, The Estate, 121 Dickenson Road, Bangalore 560 042 | Medium |
| `source_url` to record | https://help.x.com/en/rules-and-policies/x-india | — |

**Important:** X is a `FORM_HANDOFF` platform in Asmita's routing tiers, not `EMAIL`. The cron-driven email-follow-up flow (L1) will refuse to dispatch because there's no `grievance_email` — that's correct behaviour. The victim should be guided to the form via the existing handoff flow.

**Sources:**
- [X Help — X India](https://help.x.com/en/rules-and-policies/x-india)
- [X Help — Report to Grievance Officer (India)](https://help.x.com/en/forms/report-to-grievance-officer-india)
- [X Transparency — India report PDF](https://transparency.twitter.com/content/dam/transparency-twitter/country-reports/india/India-ITR-January-2024.pdf)

---

### Snapchat (Snap Inc.) ✅ **HIGH CONFIDENCE — directly verified from canonical page today**

| Field | Value |
|---|---|
| `grievance_name` | **Uthara Ganesh** |
| `grievance_email` | `grievance-officer-in@snap.com` |
| `grievance_address` | Diamond Centre, Unit No 26, Ground Floor, near Vardhman Industrial Estate, Vikhroli (West), MUMBAI, Mumbai City, Maharashtra, India, 400043 |
| `form_url` | https://help.snapchat.com/hc/en-us/articles/7012329553812 |
| `source_url` to record | https://help.snapchat.com/hc/en-us/articles/7012329553812-Snap-Inc-Resident-Grievance-Officer-India |

**This entry can be saved into the admin GO editor today** assuming the GO researcher confirms the page is still current. The fetch came directly from Snapchat's own help domain.

**Source:** [Snapchat Support — Snap Inc. Resident Grievance Officer (India)](https://help.snapchat.com/hc/en-us/articles/7012329553812-Snap-Inc-Resident-Grievance-Officer-India)

---

### ShareChat / Moj (Mohalla Tech)

| Field | Value | Confidence |
|---|---|---|
| `grievance_name` | Harleen Sethi (also nodal contact) | Medium |
| `grievance_email` (user grievances) | `grievance@sharechat.co` | Medium |
| `nodal_email` (police/LE only, **not for survivor reports**) | `nodalofficer@sharechat.co` | High |
| `compliance_email` (regulatory only) | `complianceofficer@sharechat.co` | High |
| `grievance_address` | Mohalla Tech Private Limited, North Tower Smartworks, Vaishnavi Tech Park, Survey No 16/1 & No 17/2 Ambalipura Village, Varthur Hobli, Bengaluru Urban, Karnataka – 560103 | Medium |
| `source_url` to record | https://help.sharechat.com/policies/terms/ | — |

**Important:** When dispatching, use `grievance@sharechat.co`, NOT `nodalofficer@sharechat.co`. The nodal address is reserved for law enforcement and Asmita is not LE.

**Moj** (same company) — separate grievance officer expected; check https://help.mojapp.in/ for the current designate. Not researched in this round.

**Sources:**
- [ShareChat Terms of Use](https://help.sharechat.com/policies/terms/)
- [CyberYodha — ShareChat Nodal Officer Details](https://cyberyodha.net/sharechat-nodal-officer-india/)
- [Moj Help — Contact Us](https://help.mojapp.in/contact/)

---

## Tier 2/3 — adult/porn platforms

### Telegram

| Field | Value | Confidence |
|---|---|---|
| `grievance_email` (NCII / abuse — primary) | `stopCA@telegram.org` _(child-abuse-focused but also handles non-consensual content)_ | Medium |
| `grievance_email` (general abuse) | `abuse@telegram.org` | High |
| `grievance_email` (copyright DMCA) | `dmca@telegram.org` | High |
| `form_url` | https://telegram.org/support | High |
| `source_url` to record | https://telegram.org/moderation | — |

**Important:** Telegram does not have an India-specific Grievance Officer. They are not on the IT Rules 2021 SSMI list. Notices should reference international abuse rather than India-specific IT Rules. Telegram is currently `TIER_3 / FORM_ONLY` in your seed — that's correct.

**Source:** [Telegram Moderation](https://telegram.org/moderation), [Telegram FAQ](https://telegram.org/faq)

---

### Pornhub (Aylo)

| Field | Value | Confidence |
|---|---|---|
| `form_url` (primary route) | https://www.pornhub.com/content-removal _(in seed)_ | High |
| `dmca_email` | Not surfaced in this research — Pornhub deprecated their email DMCA channel and pushed everything through the form | Medium |
| `source_url` to record | https://www.pornhub.com/content-removal | — |

Aylo (formerly MindGeek) operates Pornhub, RedTube, YouPorn. The same form covers their full network. Once submitted, they typically take down within a few days but have no government-mandated SLA.

---

### xVideos / xHamster / XNXX

Not researched in this round. These are non-Indian platforms with no IT Rules 2021 obligation. Each has a content-removal form linked from their footer; the GO researcher needs to identify the URL per site.

---

### Bing (Microsoft)

| Field | Value | Confidence |
|---|---|---|
| `form_url` | https://www.microsoft.com/concern/bing | High (in seed) |
| `grievance_email` | Microsoft India publishes a grievance officer for their consumer services; verify on Microsoft.in current page | Low |

---

## Indian short-form video apps (Josh, Moj, MX TakaTak)

Not researched in this round. All three are SSMIs under IT Rules 2021 and have published GOs. They warrant a separate research pass because:

- The original company behind MX TakaTak (Times Internet) and ShareChat/Moj acquired each other; the GOs may have consolidated.
- Josh is owned by VerSe Innovation; their GO is on their help page.

---

## Recommended import order for the admin

When your human researcher sits down with the Asmita admin GO editor, the suggested order:

1. **Snapchat** — high confidence, verified canonical page, ready to mark verified today.
2. **Google / YouTube** — use the dedicated NCII form URLs (already in seed); manually verify the GO name on the grievance page.
3. **Meta** — verify the GO name on Facebook's current page; save email + address.
4. **ShareChat** — straightforward; check the canonical Terms page once more.
5. **WhatsApp** — verify the current GO name. The email has historically been stable.
6. **X / Twitter** — set `form_url`, leave `grievance_email` blank intentionally. The system correctly refuses to email-route when there's no recipient.
7. **Telegram, Pornhub** — already form-based in seed; verify URLs are still live.
8. **Josh / Moj / MX TakaTak / Bing** — defer to the next research pass.

For each, the workflow in the admin UI is:

1. `/admin/platforms` → find the platform row → click `Edit`.
2. Paste the verified values.
3. Paste the **platform's own canonical URL** into the `Source URL` field (not this doc).
4. Check `Mark contact verified by human`.
5. Save.

The system writes a `PlatformGoHistory` row per changed field and a `GO_DATABASE_CHANGED` audit-log entry with the editor's session as the actor. That's your accountability trail when a regulator or court asks how a particular notice was routed.

---

## Things this research found but didn't act on

- **MeitY's Nov 2025 SOP and the I4C hash bank** are now the official Indian NCII regime. Asmita's product strategy should probably integrate with NCRP 1930 and consider participating in the I4C hash bank for Phase 2.
- **StopNCII.org** is Meta's preferred Phase 1 channel for NCII. Asmita's URL-based notice is complementary, not a replacement. Worth a paragraph in the Resources page.
- **Madras and Delhi High Courts** have issued recent directions specifically on NCII removal. Both deserve a look from the legal advisor when finalising the notice templates: [Madras HC](https://www.indialaw.in/blog/cyber-law/law-on-ncii-abuse-and-victim-rights/), [Delhi HC via IFF](https://internetfreedom.in/delhi-hc-issues-directions-to-search-engines-and-other-authorities-for-dealing-with-the-dissemination-of-non-consensual-intimate-images-ncii/).

---

## Caveats / what could be wrong

- Some sources are 1–3 years old. GO names rotate. **Always verify the page TODAY before saving.**
- Several entries above came from secondary cybercrime-blog aggregators (the420.in, takedownpanel.com, cyberyodha.net) rather than the platforms' own pages. Those aggregators are useful starting points but they themselves go stale.
- Direct fetches in this research session: only **Snapchat** and the **MeitY/NCII article** were retrieved fully. Other platform pages were either truncated or behind JS-rendered content.
- I did not verify any phone numbers because the IT Rules 2021 don't require phone contact and Asmita's dispatch is email/form only.
