# Grievance Officer research — adult/porn platforms (2026-05-17)

**Researcher:** Claude (AI). Starting point for a human researcher.
**Pass:** 1 of expected 2 — WebSearch hit daily quota and Pornhub/xHamster pages refused direct fetch (403 / ECONNREFUSED). The remaining platforms need a second research pass on a different day.

## ⚠️ Same policy as the main GO research doc

Do not auto-import. Every entry must be verified by a human on the platform's own current page before being saved into the admin GO editor. The values below are **starting points and known historical contacts**, not authoritative current state.

---

## 🚨 Major regulatory context — TAKE IT DOWN Act (US federal law)

This came up repeatedly in the research and directly affects what these platforms must do, regardless of where the survivor is located.

**On May 19, 2025, the US "Take It Down Act" was signed into law.** Key provisions:

- Covered platforms (any "covered platform" that hosts user-generated content, which sweeps in all major porn sites) MUST establish a notice-and-takedown process for non-consensual intimate imagery and deepfakes.
- They have until **May 19, 2026** to fully implement the required process — i.e. **this deadline arrives in two days from today (2026-05-17).** As of right now most US-based platforms are either already compliant or scrambling to be.
- Upon receiving a valid notice, the platform must remove the depiction **within 48 hours**.
- The notice requirements are: (a) identification + location of the depiction, (b) a good-faith statement that it's non-consensual, (c) the identifiable individual's signature.

**Source:** [Skadden — Take It Down Act overview](https://www.skadden.com/insights/publications/2025/06/take-it-down-act), [NatLawReview — Take It Down Act signed into law](https://natlawreview.com/article/take-it-down-act-signed-law-offering-tools-fight-non-consensual-intimate-images-and), [Congress.gov LSB11314](https://www.congress.gov/crs-product/LSB11314)

**Implications for Asmita's notice templates:**

1. The notice template currently cites IT Rules 2021 + DMCA. For US-hosted porn sites it should ALSO cite the **Take It Down Act (47 U.S.C. § 230 notwithstanding)** — this is the strongest single legal lever for porn-site NCII as of 2026.
2. The 48-hour SLA under Take It Down Act is **longer** than IT Rules 2021's 24h. Asmita's escalation timeline (24h → 48h → 7d) should be tuned per-platform: an Indian SSMI gets the 24h treatment, a US porn site gets the 48h Take It Down baseline.
3. **This needs IFF/SFLC.in's attention.** Adding Take It Down Act language to template C (porn-platform DMCA-primary template) is one of the highest-leverage template updates you can make before launch.

## 🚨 Pornhub / Aylo — FTC settlement, Sept 2025

**On 3 September 2025, Aylo (Pornhub's parent) settled with the FTC and Utah for $5M** over historic failure to block CSAM and NCM. As part of the settlement, Aylo is **legally required** to:

- Verify the consent and identity of everyone appearing in uploaded content.
- Implement policies and technical measures to block publication of CSAM and NCM.
- Remove pre-existing content that doesn't meet these standards.

**Implications:** Aylo is in an enforcement spotlight. A well-formed NCII notice citing the FTC consent decree + Take It Down Act + Indian IT Rules will land harder than it would have a year ago. Pornhub already had a content-removal form (in your seed) but the FTC settlement gives Asmita additional leverage in the notice body.

**Sources:**
- [FTC settlement statement (PDF)](https://www.ftc.gov/system/files/ftc_gov/pdf/2025.09.03-2123033-pornhub-mindgeek-ferguson-holyoak-meador-statement.pdf)
- [TechCrunch — Aylo $5M settlement coverage](https://techcrunch.com/2025/09/03/pornhub-owner-pays-5m-settlement-to-ftc-over-historic-failure-to-block-abusive-content/)
- [Stanford CyberLaw — analysis of the settlement](https://cyberlaw.stanford.edu/publications/the-ftcs-settlement-with-aylo-this-isnt-really-about-fighting-csam-and-revenge-porn/)

---

## Researched in this pass

### Pornhub (Aylo network — includes RedTube, YouPorn)

| Field | Value | Confidence |
|---|---|---|
| `form_url` | https://www.pornhub.com/content-removal | High (already in seed) |
| `grievance_email` | Pornhub deprecated the email DMCA channel and pushed everything through the form. Use the form. | High — multiple secondary sources confirm |
| Network coverage | The same form covers RedTube, YouPorn, and other Aylo-operated sites | Medium |
| Legal levers to cite in notice | (1) **Take It Down Act**, (2) **FTC consent decree (Sept 2025)**, (3) DMCA Section 512, (4) Aylo's own community guidelines | High |
| Typical SLA | Pornhub claims same-day in their public statements; FTC settlement now obligates them. | Medium |
| `source_url` to record | https://www.pornhub.com/content-removal | — |

**Direct fetch attempt failed** with ECONNREFUSED — Pornhub blocks WebFetch from this kind of automated tool. A human researcher should manually open the page to confirm the form is still live and read the current submission requirements (they may have changed since the FTC settlement).

---

### xVideos (WGCZ Holding — Czech-based)

| Field | Value | Confidence |
|---|---|---|
| `grievance_email` | `abuse@xvideos.com` | Medium — secondary-source confirmed; verify on their own footer/legal page |
| `form_url` | No dedicated public form per the research; email-only intake | Medium |
| Notice format | Standard DMCA elements: contact info, identification of work, URLs, good-faith + accuracy sworn statements | High |
| Operator | WGCZ Holding, based in Czech Republic; not US-incorporated. Take It Down Act applicability is **unclear** for non-US platforms but they typically comply to maintain US payment processor relationships. | Medium |
| Legal levers to cite | (1) DMCA, (2) Take It Down Act (likely applicable via US user base), (3) IT Rules 2021, (4) home-jurisdiction Czech/EU privacy law | Medium |
| `source_url` to record | The xVideos `/legal` or `/dmca` footer page (verify URL) | — |

**Source:** [RecordingLaw — DMCA Takedown on xVideos](https://www.recordinglaw.com/dmca-takedown-xvideos/)

---

### xHamster (operated by Hammy Media Ltd, Cyprus-based)

| Field | Value | Confidence |
|---|---|---|
| `grievance_email` | Not surfaced cleanly. xHamster claims DMCA compliance but the exact agent email needs the human researcher to read their `/info/dmca` page (returned 403 to WebFetch in this session). | Low |
| `form_url` | Likely at https://xhamster.com/info/dmca or footer — confirm | Medium |
| Legal note | xHamster's TOS includes a content removal process for "non-consensual adult media and privacy violations" alongside DMCA | Medium |
| Legal levers to cite | (1) DMCA, (2) Take It Down Act, (3) xHamster's own non-consensual content policy (cite it back at them), (4) IT Rules 2021 if served via India | Medium |
| `source_url` to record | xHamster's `/info/dmca` or `/info/abuse` page (verify URL on their footer) | — |

**Source:** [Lexprotector — DMCA takedown from xHamster.com](https://lexprotector.com/blog/portfolio/dmca-take-down-from-the-website-xhamster-com/)

**Action item for human researcher:** Read https://xhamster.com/info/dmca manually (it 403'd a programmatic fetch). Extract the DMCA agent's name, email, and postal address. Look for any separate `/info/abuse` or `/info/privacy` page that handles non-consensual content distinctly from copyright.

---

### XNXX (operated by WGCZ Holding — same parent as xVideos)

| Field | Value | Confidence |
|---|---|---|
| `grievance_email` | **Not surfaced in this pass.** The search returned only generic DMCA guidance, not XNXX-specific contacts. | None |
| `form_url` | XNXX is operated by WGCZ Holding (same as xVideos); the contact channel is likely shared with `abuse@xvideos.com` or a parallel `abuse@xnxx.com` — verify | Low |
| `source_url` to record | XNXX's footer legal/DMCA page | — |

**Action item for human researcher:** Visit https://www.xnxx.com manually and follow the footer's DMCA/legal link. Likely candidates for the address: `abuse@xnxx.com`, `dmca@xnxx.com`, or shared with xVideos.

---

## ⏸️ Not researched in this pass — needs a second day

Tomorrow's research session should cover:

- **SpankBang** — large independent (not Aylo); has its own DMCA process
- **Eporner** — known for slower takedown response; needs current contact
- **Beeg** — owned by xHamster? — verify ownership and contact
- **YouPorn / RedTube** — covered by Pornhub form (Aylo network) but verify
- **Cam4 / Chaturbate** — live-streaming sites with their own NCII processes
- **OnlyFans-style "leaked content" aggregators** — Coomer.party, Kemono.party, Thothub, etc. These are the **highest-risk Tier 3** sites for Indian victims. They typically host stolen OF content and have minimal compliance staff.
- **Indian-language porn sites** — Antarvasna, DesiPapa, IndianPorn365, etc. These are the most pressing for an India-specific platform and have the worst compliance track records. Many are hosted in jurisdictions that don't honor DMCA. Some are India-hosted and therefore directly subject to IT Rules 2021 + recent MeitY 24h SOP.
- **Reddit (adult subreddits)** — Reddit has both a Grievance Officer for India AND a separate `/help/contact/` form for NCII. Worth its own entry.
- **Imgur, ImageBam, image hosts** — frequently used to re-share NCII; each has its own form
- **Telegram NCII channels** — Telegram itself has `stopCA@telegram.org` (covered in main doc) but NCII-focused groups need their own escalation. The Indian gov't recently asked Telegram to share user data on such channels.

**Special concern: piracy-style re-upload sites.** Many of the worst Indian leak sites are run by anonymous operators in jurisdictions that ignore DMCA. Asmita's notice will receive zero response from these. The PRD's response is correct: those URLs should escalate to **search-engine de-indexing** (Google form already in your seed) and **ISP throttling** (which the new MeitY SOP enables via DoT coordination).

---

## ⚖️ Strategic recommendations for the legal advisor

When IFF / SFLC.in reviews the notice templates, raise these points specifically for the Tier 3 / porn-platform template (Template C):

1. **Add Take It Down Act citation** — this is now the single strongest US legal lever, with a 48h removal mandate.
2. **For Aylo-network sites, cite the FTC consent decree** (Sept 2025) — they are under active enforcement and notices that reference the decree get prioritized.
3. **Tune escalation windows per-platform tier.** Indian SSMIs: 24h L1 (matches MeitY SOP). US-hosted porn sites: 48h L1 (matches Take It Down Act). Non-DMCA jurisdictions (Czech, Russia, anonymous): skip L1 and go straight to search-engine de-indexing + ISP escalation.
4. **For Indian-language porn sites hosted in India**, consider whether to make a parallel **MeitY 1930 / NCRP** complaint alongside the platform notice. Some of these sites only respond to government takedown orders.
5. **CSAM checkpoint.** If a submitted URL might involve a minor, all of these escalation paths are wrong — the case must route to TakeItDown (NCMEC) and cybercrime.gov.in immediately. The minor pathway in Asmita already handles this; just verify it triggers reliably.

---

## What the human researcher should do next

1. **Manually visit the 4 pages I couldn't fetch.** Pornhub `/content-removal`, xHamster `/info/dmca`, XNXX footer, xVideos footer. Capture: email, form URL, postal address, last-updated date.
2. **Schedule the second research pass.** Cover the platforms in "Not researched in this pass" above. Aim for daily-language Indian sites first — those are where Asmita's domestic users actually find their content.
3. **Bring Template C to the legal advisor** with the three legal-lever updates above (Take It Down Act, FTC decree citation, per-tier window tuning).
4. **Once verified, save into the admin GO editor.** Same workflow as for the SSMIs: `/admin/platforms` → Edit → paste values + source URL → check verified → save.

Sources used in this pass:
- [FTC Aylo settlement statement (PDF)](https://www.ftc.gov/system/files/ftc_gov/pdf/2025.09.03-2123033-pornhub-mindgeek-ferguson-holyoak-meador-statement.pdf)
- [TechCrunch — Aylo $5M settlement](https://techcrunch.com/2025/09/03/pornhub-owner-pays-5m-settlement-to-ftc-over-historic-failure-to-block-abusive-content/)
- [Skadden — Take It Down Act overview](https://www.skadden.com/insights/publications/2025/06/take-it-down-act)
- [NatLawReview — Take It Down Act signed into law](https://natlawreview.com/article/take-it-down-act-signed-law-offering-tools-fight-non-consensual-intimate-images-and)
- [Congress.gov LSB11314 — Take It Down Act CRS](https://www.congress.gov/crs-product/LSB11314)
- [Stanford CyberLaw — FTC settlement with Aylo](https://cyberlaw.stanford.edu/publications/the-ftcs-settlement-with-aylo-this-isnt-really-about-fighting-csam-and-revenge-porn/)
- [Techdirt — FTC settlement analysis](https://www.techdirt.com/2025/09/15/the-ftcs-settlement-with-aylo-this-isnt-really-about-fighting-csam-and-revenge-porn/)
- [RecordingLaw — DMCA Takedown on xVideos](https://www.recordinglaw.com/dmca-takedown-xvideos/)
- [Lexprotector — DMCA takedown from xHamster](https://lexprotector.com/blog/portfolio/dmca-take-down-from-the-website-xhamster-com/)
- [Without My Consent — Take Down resources](https://withoutmyconsent.org/resources/something-can-be-done-guide/take-down/)
- [BlueOcean — Effective Methods to Remove Adult Media Online](https://www.blueoceanglobaltech.com/blog/how-to-remove-adult-media-online/)
- [McAllister Olivarius — Takedown resources for revenge porn](https://mcolaw.com/for-individuals/online-reputation-and-privacy/takedown-resources-revenge-porn/)
