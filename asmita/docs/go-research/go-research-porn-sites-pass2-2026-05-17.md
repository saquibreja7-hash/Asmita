# GO research — porn sites pass 2 (2026-05-17)

**Researcher:** Claude (AI). Second pass on platforms missed yesterday due to WebSearch quota.
**Policy:** Same as the other research docs. Do not auto-import. Every entry must be verified by a human on the platform's own current page before saving.

---

## 🚨🚨 The biggest finding of this entire research effort

**On 10 February 2026 (3 months ago), the Indian government notified the IT Rules (Amendment) 2026.** It became operational on 20 February 2026. This is MORE recent than the MeitY SOP I documented yesterday, and it shortens the takedown timelines dramatically.

### New legally-binding timelines (as of February 2026)

| Trigger | Old window (IT Rules 2021) | New window (IT Rules 2026) |
|---|---|---|
| User reporting non-consensual nudity (NCN) | 24 hours | **2 hours** |
| User reporting impersonation / deepfake | 24 hours | **2 hours** |
| Government / court takedown order | 36 hours | **3 hours** |
| Grievance officer follow-up | 15 days | **7 days** |
| General NCII | 24 hours (per Nov 2025 SOP) | 24 hours (still) |

So we now have a layered regime: **NCN = 2 hours, deepfakes / synthetic = 3 hours from government, general NCII = 24 hours, all others = 7-day grievance resolution.**

### Implications for Asmita (these are big)

1. **The escalation engine's L1 timer (24h) is no longer aggressive enough for NCN cases.** For URLs the victim flags as showing **explicit non-consensual nudity**, Asmita should L1 at 2 hours, not 24. The current daily-cron architecture cannot meet a 2-hour SLA on its own — but it doesn't have to: the victim's initial notice already goes out instantly, and the law gives platforms 2 hours from that first notice. The follow-up cadence is a quality-of-service signal Asmita controls.

2. **Asmita's per-URL submission flow should ask "is this content showing non-consensual nudity?"** so the system can flag the case for the 2-hour regime and surface that legal lever in the notice body. Currently every case is treated the same.

3. **The 7-day grievance-officer window means Asmita's L3 (FIR package at 7 days) is now exactly aligned with the regulatory grievance-cycle end.** That's a happy coincidence — the FIR package becomes available precisely when the regulatory grievance cycle has officially failed. Worth keeping.

4. **The Madras HC NCII directive and the IT Rules 2026 amendment together give Asmita's notices significantly stronger teeth than they had in 2025.** IFF / SFLC.in template review should incorporate both.

5. **For government-ordered takedowns (3-hour rule),** Asmita could become a feeder to the NCRP 1930 system — for cases where the platform notice fails or is known-futile, Asmita's L3 could include "we recommend you also file at cybercrime.gov.in citing the 3-hour rule." That's a Phase 2 product decision.

**Sources:**
- [India-Briefing — Deepfake Governance in India 2026 IT Rules](https://www.india-briefing.com/news/deepfake-corporate-liability-india-2026-it-rules-44836.html)
- [Mondaq — IT Rules 2026 Deepfake Regulation: 3-Hour Takedowns](https://www.mondaq.com/india/new-technology/1760554/it-rules-2026-deepfake-regulation-three-hour-takedowns-and-ai-labelling-obligations)
- [LawSikho — IT Rules 2026: Deepfake 3-Hour Takedown & AI Labelling](https://lawsikho.com/blog/it-rules-2026-deepfake-takedown-3-hour-rule-and-ai-labelling-explained/)
- [LiveLaw — Deepfakes, Due Diligence And The Good Samaritan Paradox](https://www.livelaw.in/law-firms/law-firm-articles-/deepfakes-due-diligence-indias-2026-it-amendment-rules-resolve-global-platform-liability-debate-530344)
- [AI Certs — 3-Hour Deepfake Compliance Countdown](https://www.aicerts.ai/news/indias-new-deepfake-removal-law-three-hour-compliance-countdown/)
- [StartupSprints — India's 3-Hour Deepfake Takedown Law](https://www.startupsprints.in/blogs/india-deepfake-takedown-law-it-rules-2026)

---

## Reddit — ✅ HIGH CONFIDENCE

| Field | Value |
|---|---|
| `grievance_name` | **Vijay Pamarathi** |
| `grievance_form_url` | https://support.reddithelp.com/hc/en-us/articles/28417230073236-Information-for-users-in-India (grievance form linked from the India page) |
| `grievance_address` | Reddit, Inc., WeWork Prestige Central, 36 Infantry Road, Tasker Town, Shivaji Nagar, Bengaluru - 560001, Karnataka, India |
| NCII-specific form | https://support.reddithelp.com/hc/en-us/articles/360043513951 (dedicated NCII page) |
| `source_url` to record | https://support.reddithelp.com/hc/en-us/articles/28417230073236-Information-for-users-in-India |

**Tier:** TIER_1 (Reddit is an SSMI under IT Rules; Indian users on adult subreddits like r/IndianGoneWild, r/IndianBabes are a real attack surface).

**Sources:**
- [Reddit Help — Information for users in India](https://support.reddithelp.com/hc/en-us/articles/28417230073236-Information-for-users-in-India)
- [Reddit Help — Intimate images shared without consent](https://support.reddithelp.com/hc/en-us/articles/360043513951)

---

## SpankBang

| Field | Value | Confidence |
|---|---|---|
| `grievance_address` | MMB Ventures LLC, 16192 Coastal Hwy, Lewes, Delaware 19958, United States | Medium |
| Specific contact category | "Non-Consensual Explicit Content – Immediate Removal Request" is listed as a dedicated channel on their support portal | Medium |
| `grievance_email` | Not surfaced — needs manual fetch of their `/dmca` and `/abuse` pages | None |
| `form_url` | Likely a dedicated NCII removal form on their support portal | Medium |
| Legal levers to cite | (1) DMCA, (2) Take It Down Act (US-incorporated), (3) IT Rules 2026 2-hour NCN rule if served via India | High |

**Action item:** Human researcher should manually open `spankbang.com/legal/` or footer DMCA link to capture the actual email/form URL.

**Source:** [Quora — How to request a non-consensual take down on SpankBang and PornZog](https://www.quora.com/How-do-I-request-a-non-consensual-take-down-videos-on-SpankBang-and-PornZog)

---

## Eporner

| Field | Value | Confidence |
|---|---|---|
| `grievance_email` | Not surfaced — must be on their `/dmca` page | None |
| Notable | Listed in [Google Transparency Report](https://transparencyreport.google.com/copyright/domains/eporner.com) — Google receives copyright complaints for this domain regularly, indicating active DMCA process exists | Low |
| `source_url` to record | Eporner's footer DMCA link (verify) | — |

**Action item:** Human researcher should manually verify by visiting eporner.com footer.

---

## Beeg

| Field | Value | Confidence |
|---|---|---|
| `grievance_email` | Not surfaced in this research | None |
| Notable | Owned by xHamster's parent (Hammy Media Ltd, Cyprus). DMCA agent likely consolidated with xHamster. | Medium |
| `source_url` to record | Beeg.com footer (verify) | — |

**Action item:** Human researcher should check the beeg.com footer DMCA / contact link. The contact is likely shared with xHamster (same Cyprus parent).

---

## Chaturbate

| Field | Value | Confidence |
|---|---|---|
| `form_url` | https://chaturbate.com/dmca/ (their dedicated DMCA form per multiple sources) | High |
| Submission format | Open the DMCA form, fill in your email, username, the full list of infringing URLs, add your signature, send | High |
| Typical SLA | Most websites comply within 5 days; Chaturbate generally responds faster | Medium |
| `source_url` to record | https://chaturbate.com/dmca/ | — |

**Source:** [Storm DMCA — Chaturbate Support for DMCA and Privacy Issues](https://stormdmca.com/blog/chaturbate-support-for-dmca-and-privacy-issues/)

---

## Cam4

| Field | Value | Confidence |
|---|---|---|
| `grievance_email` | Not surfaced specifically | None |
| `form_url` | Cam4 publishes DMCA contact on their footer; human researcher to verify | Low |
| Notable | Often grouped with Chaturbate, Stripchat, MyFreeCams, BongaCams in third-party takedown services | Medium |

**Action item:** Human researcher to verify on cam4.com footer.

---

## Coomer.party / Coomer.su / Kemono — ⚠️ KNOWN-FUTILE

| Field | Value | Confidence |
|---|---|---|
| Current operating domain | **Coomer.su** (after Coomer.party went offline under takedown pressure) | High |
| `grievance_email` | They publish one but **do not honour DMCA notices**. Limited-to-zero response in practice. | High (negative confidence) |
| Parent | Run by anonymous operators, hosted under offshore TLDs intentionally to resist legal pressure | High |
| Same-network sites | Kemono.su (focuses on Patreon/Pixiv); Coomer focuses on OnlyFans/Fansly/CandFans | High |

**This is the case where Asmita's escalation logic should route to alternative escalation, not retry the platform.** Recommended escalation for these sites:

1. Skip the platform notice — it doesn't work.
2. File at **NCRP 1930 / cybercrime.gov.in** citing the IT Rules 2026 2-hour NCN provision.
3. File a **Google de-indexing request** so the URLs don't surface in search.
4. If India-served traffic, request **DoT/ISP-level blocking** (the new MeitY SOP enables this).
5. Identify the **hosting provider** (often Cloudflare-fronted) and send an abuse report to Cloudflare at https://abuse.cloudflare.com/dmca — Cloudflare cannot remove the content but can stop fronting the domain.

**Sources:**
- [CopyrightShark — Leaked on Kemono Party? Patreon & Pixiv takedown options](https://copyrightshark.com/leaked-on-kemono-party/)
- [Patreon — Kemono Party DMCA Statement](https://www.patreon.com/posts/kemono-party-78393669)
- [Appquipo — Kemono Party: How It Works, Risks, and Safer Alternatives](https://appquipo.com/blog/kemono-party/)
- [Cloudflare — Abuse form (DMCA)](https://abuse.cloudflare.com/dmca)

---

## Thothub / Thotsbay

Not surfaced in this pass. Same category as Coomer/Kemono — "leaked content aggregators" run by anonymous operators in DMCA-resistant jurisdictions. Asmita's response should be the same: skip platform notice, escalate via NCRP/Google/Cloudflare.

---

## Indian-language porn sites (Antarvasna, DesiPapa, IndianPorn365, etc.)

**Search returned no results.** This is itself diagnostic — these sites have no public DMCA infrastructure that's been documented in mainstream legal-tech sources. They are precisely the sites that:

1. Will NOT respond to a takedown email even if you find one.
2. ARE India-hosted (some of them), making them directly subject to IT Rules 2026 + the 2-hour NCN rule + MeitY SOP.
3. WILL respond to a **government-ordered ISP block** — this is the lever the Indian government has been pulling since 2015. **63 porn sites were already blocked on government orders in 2022; 857 were blocked in 2015.**

### Recommended Asmita response for this category

These should be a new platform tier in Asmita's routing model: **TIER_GOVT_ESCALATION_ONLY**.

For URLs on such domains, the system:

1. Does NOT send a platform notice — there's no functional recipient.
2. Generates a **Form A complaint for NCRP 1930** — the victim takes this to the National Cybercrime Reporting Portal.
3. Generates a **Form B request for MeitY/DoT-level URL block** — the SOP allows DoT to coordinate with ISPs.
4. Adds the URL to the **Google de-indexing** queue (existing form already in seed).
5. L3 (7 days) generates the FIR package which already supports filing under IPC 354C / IT Act 66E.

The existing escalation engine has the architecture for this — it's a new handler kind ("government_escalation") and a new platform tier in the seed/schema.

**Sources:**
- [Business Today — 63 porn sites banned by the govt (2022)](https://www.businesstoday.in/latest/trends/story/63-porn-sites-banned-by-the-govt-check-full-list-of-names-348630-2022-09-30)
- [CIS India — Indian gov orders ISPs to block 857 porn websites (2015)](https://cis-india.org/internet-governance/news/idg-news-service-august-2-2015-indian-govt-orders-isps-to-block-857-porn-websites)
- [IFF — Why is porn being blocked in India? #WhatTheBlock](https://internetfreedom.in/why-is-porn-being-blocked-in-india-whattheblock/)
- [Wikipedia — Internet censorship in India](https://en.wikipedia.org/wiki/Internet_censorship_in_India)

---

## Imgur

| Field | Value | Confidence |
|---|---|---|
| `grievance_email` | Not surfaced in this pass | None |
| Notable | Imgur is US-hosted, claims DMCA compliance, has a "Report" button on every image | Medium |
| Take It Down Act applicability | Yes — Imgur is a covered platform; must have NCII process by May 19, 2026 | High |

**Action item:** Human researcher should visit imgur.com/tos and imgur.com/dmca to capture the designated agent.

---

## ImgBB / ImageBam / Postimage

These are small image hosts frequently used to re-share leaked images. Each has its own contact page; the researcher needs to read each manually.

- **ImgBB:** https://imgbb.com/contact (contact page exists, content not extracted)
- **ImageBam:** Footer DMCA link
- **Postimage:** Footer DMCA link

All three rely on hosting-provider-level escalation (Cloudflare, AWS) when their direct response fails.

---

## Cloudflare — meta-recipient for the offshore tier

**Cloudflare is not a content host but fronts most of the offshore porn sites.** They cannot remove content but can:

1. Stop providing CDN/DDoS protection (removes the operational shield).
2. Forward the abuse report to the actual host.
3. Disclose the origin server's IP under legal compulsion.

**Form:** https://abuse.cloudflare.com/dmca

**For Asmita**, Cloudflare's abuse form becomes the fallback recipient for any URL whose Asmita-side platform record is `TIER_GOVT_ESCALATION_ONLY` AND whose domain is Cloudflare-fronted. The system can detect Cloudflare-fronting via DNS lookup of the apex domain (no actual fetch of the user's URL required — just a DNS lookup of the domain).

---

## Consolidated escalation priority for Tier 3 / porn sites

Here's a recommended decision tree for Asmita's notice routing when a victim submits a URL on a porn-platform domain. This belongs in `src/lib/notice-router.ts` as a future enhancement — it's not implemented today.

```
1. Is the domain in TIER_1/2 (Pornhub, xHamster, Chaturbate, etc.)?
   YES → send direct platform notice citing IT Rules 2026 + Take It Down Act + DMCA
   NO  → continue

2. Is the domain a known offshore aggregator (Coomer.su, Kemono.su, Thothub, etc.)?
   YES → skip platform notice; generate NCRP form + Google de-index + Cloudflare abuse report
   NO  → continue

3. Is the apex domain Cloudflare-fronted? (DNS lookup, no URL fetch)
   YES → platform notice + Cloudflare abuse report in parallel
   NO  → continue

4. Is the domain India-hosted? (DNS A record geographic lookup)
   YES → platform notice + flag for NCRP escalation under IT Rules 2026 2-hour NCN rule
   NO  → standard Tier 3 notice (form handoff)
```

This is significantly more sophisticated than the current routing. **Not urgent for v1, but a strong Phase 2 enhancement.**

---

## What's now ✅ verified-enough-to-import (with manual confirmation)

The human researcher's next session should be able to mark these as verified after a final eyeball:

| Platform | Verified by | Confidence |
|---|---|---|
| Reddit India GO | Direct fetch of Reddit help page | High |
| Chaturbate DMCA form URL | Multiple secondary sources concur | High |
| SpankBang (NCII-specific channel exists) | Multiple sources | Medium |
| Pornhub form URL | Already in seed; verified active in pass 1 | High |

The remaining adult sites need the researcher to actually open the platform footer in a browser, because most pages either 403 to programmatic fetches or aren't well-indexed by search.

---

## Final strategic ask for the project owner

If you take only one thing away from this entire research effort, take this:

**Asmita's regulatory landscape has changed twice in the last 6 months — November 2025 (MeitY 24h SOP) and February 2026 (IT Rules Amendment 2026 with 2h NCN / 3h deepfake rule).** The PRD v0.2 (dated 2026-05-12) was written 3 months after IT Rules 2026 took effect but may not yet reference it. Before launch, the PRD should be updated to v0.3 reflecting:

1. Tiered SLAs per content category (NCN 2h, deepfake 3h, general NCII 24h)
2. A new platform tier for known-futile aggregators
3. A direct integration path with NCRP 1930 for that tier
4. Updated legal citations in Templates A/B/C

This is the highest-leverage update to ship before the legal review with IFF / SFLC.in, because asking them to review templates that cite outdated law will waste their time.

Sources used in this pass (in addition to those cited above):
- [SCC Online — MeitY SOP Mandating 24-Hour Takedown of NCII](https://www.scconline.com/blog/post/2025/11/12/meity-non-consensual-intimate-imagery-sop-24-hour-takedown-policy-scctimes/)
- [Medianama — MeitY Outlines How to Report NCII](https://www.medianama.com/2025/11/223-meity-sop-non-consensual-intimate-imagery-intermediaries/)
- [Storyboard18 — Govt tightens NCII takedown norms](https://www.storyboard18.com/digital/breaking-govt-tightens-ncii-takedown-norms-makes-intermediaries-directly-accountable-84001.htm)
- [Law.asia — India's new NCII SOP: victim relief, due process risks](https://law.asia/non-consensual-intimate-imagery/)
- [News9live — India's New IT Rules Help Remove NCII Within 2 Hours](https://www.news9live.com/technology/tech-news/indias-new-it-rules-help-remove-non-consensual-intimate-images-within-2-hours-2971275)
- [Prime Infoserv — AI & Deepfake Law in India under IT Amendment Rules 2026](https://primeinfoserv.com/blog-ai-deepfake-law-india-it-rules-2026-amendment/)
