# Notice redraft, November 2026: memo for legal review

**Status:** AI-drafted. Every template is `reviewedByLegal: false` and marked `[DRAFT - PENDING LEGAL REVIEW - DO NOT DISPATCH]`. Nothing here may be sent until an advocate (IFF / SFLC.in) reviews it and sets `reviewedByLegal` on the row in production.

**Text under review:** `asmita/prisma/template-seeds.ts`, plus the survivor's copyable wording `ladder.draft.complaint` and `ladder.draft.appeal` in `asmita/src/i18n/en.json` (Hindi machine-translated in `hi.json`). This memo supersedes the citation analysis in `notice-templates-review.md`.

**Formatted pack for review:** `Asmita-Legal-Notices-2026-11.docx` (and a PDF copy) in this folder, generated from `template-seeds.ts` by `node scripts/generate-notice-pack.mjs`. Regenerate it after any template change, so the reviewed document always matches what the app sends. The older `Asmita-Legal-Notice-Templates.docx/.pdf` and `Asmita-Legal-Notices-Plain.docx`, which held the superseded text, were deleted on 2026-11-08.

## 1. Sources used

| Ref | Source | Kind |
|---|---|---|
| R | IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, MeitY consolidation "updated as on 10.02.2026" (includes corrigendum G.S.R. 148(E), 26.02.2026). meity.gov.in/static/uploads/2026/03/0b576f2071694b52e4cd6bb1b6dfab1e.pdf | Primary (MeitY consolidation, not the Gazette notification itself) |
| F | MeitY FAQ on the IT Amendment Rules, 2026 | Primary |
| S | MeitY Standard Operating Procedure on NCII, v.1 (October 2025), issued pursuant to Madras HC order 15.07.2025 in W.P. No. 25017 of 2025; PIB PRID 2188886 | Primary |
| A | Information Technology Act, 2000 (India Code) | Primary |
| B | Bharatiya Nyaya Sanhita, 2023 (Gazette) | Primary |
| P | PRD Section 4 (`docs/archive/planning-2026-05/PRD_Asmita.md`) | Internal |

Project rule: Indian law citations come only from P or S. Citations confirmed against R, A or B but not in P or S are tagged `[CITATION REQUIRED - verify with legal advisor]` in the text. Counsel removes each tag on confirming it.

## 2. Errors in the previous templates, now corrected

| Previous text | Problem | Now |
|---|---|---|
| Removal within **24 hours** under Rule 3(2)(b) | G.S.R. 120(E) (10.02.2026, in force 20.02.2026) substituted **two hours** (R, F, P). The SOP (October 2025) predates it and still says 24 hours. | Two hours. The SOP is cited for procedure, with a sentence that it predates the amendment and by its own terms does not alter the Rules. |
| NCII prohibited by **Rule 3(1)(b)(iv)** | (iv) is IP infringement. Privacy "including bodily privacy" is **(ii)** (R). | 3(1)(b)(ii), tagged. |
| Acknowledgement under **Rule 4(1)(c)** | 4(1)(c) is the appointment of the Resident Grievance Officer. Acknowledge 24h, resolve **7 days** (was 15) is **Rule 3(2)(a)(i)** (R, F). | 3(2)(a)(i), tagged. |
| **72-hour re-upload prevention** under Rule 4(4) | Not in the Rule. Rule 4(4) covers rape and CSAM, and content "exactly identical" to content removed under 3(1)(d) (government and court orders). It does not reach 3(2)(b) complaints (R). | Re-upload prevention is a request, grounded in the SOP's guidance to SSMIs "consistent with Rule 4(4)". |
| "This Notice ... constitutes such notification" under s.79(3)(b) | Overclaim. *Shreya Singhal* reads actual knowledge as a court order or government notification, and the SOP puts s.79(3)(b) on the government track. | Safe harbour now rests on s.79(2)(c) due diligence and **Rule 7** (non-observance means s.79(1) does not apply), tagged. s.79(3)(b) is no longer claimed. |
| BNS s.77: "not less than one year, which may extend to seven years" | That merges two tiers. First conviction is 1 to 3 years with fine; 3 to 7 years is a second conviction (B). | First-conviction range, plus Explanation 2 (consent to capture is not consent to dissemination). |
| IRWA 1986 **s.4** prohibits the publication | Whether s.4 reaches electronic publication is unconfirmed; the 2012 amendment bill adding it was withdrawn. | The Act is cited only as named by the SOP, without a section-level claim. |
| PDQ hash "cannot be reversed" | False. Research shows a rough likeness can be reconstructed from a PDQ hash. | The advisory says so and asks the platform to treat the hashes as sensitive personal data. |
| Acknowledge and preserve "as required" | Rule 3(1)(g) preservation is tied to removals; the 180-day request is reasonable but not a demand the Rule clearly supports for a private complaint. | Phrased as a request "consistent with Rule 3(1)(g)", tagged. |
| GAC appeal "within thirty days of the expiry of the resolution period" | Rule 3A(3) runs 30 days from receipt of the Grievance Officer's communication, and also opens an appeal when the 3(2)(b) period is missed (R). | Rewritten to the Rule's terms, tagged. |
| Asmita described as "the technical facilitating intermediary" | Calling Asmita an intermediary invites the Rules' obligations on it. Rule 3(2)(b) lets "any person on his behalf" complain. | Asmita acts "on behalf of the Complainant", citing that phrase. |
| Complainant is "a verified adult resident of India"; identifying details "will be furnished" on request | False. Asmita stores an encrypted email and a self-declared age only. It verifies neither age nor residency and holds no name. | She "has declared that she is an adult and has verified her email address"; Asmita passes requests for further information to her. |
| Hash advisory: platform must search its service and remove matches within two hours "as Rule 3(2)(b) requires" | Rule 3(2)(b) covers specific content raised in a complaint; it imposes no service-wide search. PDQ matching is approximate. | The search is a request under the SOP; confirmed matches fall under Rule 3(2)(b); Asmita will serve a 3(2)(b) complaint for any specific item found. |
| Rule 3(2)(b) paraphrased as a flat duty to remove | The Rule says content "prima facie" of that nature, and "take all reasonable and practicable measures to remove". | Both qualifiers restored, in the notices, the follow-up and the survivor's appeal wording. |
| Non-compliance "will" forfeit safe harbour | Breach and loss of safe harbour are for a court. | "May be treated as having failed to observe"; Rule 7's second limb (liability under any law) added. |
| Privacy violation "under Article 21" against a platform | Article 21 binds the State. | Rule 3(1)(n) (respect constitutional rights, including Article 21) with *Puttaswamy*, tagged. |
| s.66E and BNS s.77 listed for every case | s.66E needs an image of a real private area; s.77 needs a woman captured in a private act. Neither clearly reaches morphed content. | "May disclose"; s.66E and s.77 limited to captured (not artificially created) content, s.77 also to a woman complainant. |

## 3. Citation register (Indian templates)

| Citation | Used in | Source | Tagged |
|---|---|---|---|
| Rule 3(2)(b), two hours, on complaint by "an individual or any person on his behalf" | all Indian templates, L1, FIR, appeal draft | P, S, R, F | No (P records the 2h amendment) |
| G.S.R. 120(E), 10.02.2026, in force 20.02.2026 | IT_RULES, joint, hash | R, F; P has the date without the G.S.R. number | Yes |
| MeitY NCII SOP v.1, Madras HC W.P. 25017/2025 | all | S | No |
| Rule 3(2)(a)(i), acknowledge 24h, resolve 7 days | IT_RULES, joint, L1 | R, F; P has "7-day" without sub-rule | Yes |
| Rule 3(1)(b)(ii), bodily privacy | IT_RULES, joint | R | Yes |
| Rule 7, non-observance removes s.79(1) | IT_RULES, joint, hash | Not re-checked in this pass | Yes |
| s.79(1), s.79(2)(c), IT Act | IT_RULES, joint, hash | A, P (s.79) | No |
| Rule 4(4), SSMI technical measures, as applied by the SOP | IT_RULES, joint, hash | S, R | No |
| I4C Sahyog Portal hash bank ("if onboarded"); search de-indexing | IT_RULES, joint, hash | S | No |
| Rule 3(1)(g), preserve 180 days | IT_RULES, joint, hash | R | Yes |
| Rule 3A, GAC, 30 days; www.gac.gov.in | IT_RULES, joint, hash, L1, appeal draft | R (Rule 3A(3)); S (GAC, URL) | Yes (30 days) |
| NCRP cybercrime.gov.in, 1930, One Stop Centres | IT_RULES, joint, hash, L1 | S | No |
| s.66E, s.67, s.67A IT Act | all Indian templates, FIR, complaint draft | P, A | No |
| BNS s.77 and Explanation 2 | all Indian templates, FIR, complaint draft | P, B | No |
| IRWA 1986 (Act only) | IT_RULES, joint, hash | S | No |
| DPDP Act 2023, data minimisation | all | P | No |
| Rule 3(1)(n), respect constitutional rights incl. Art. 21; *Puttaswamy*, (2017) 10 SCC 1 | IT_RULES, joint | R; case not in P or S | Yes |
| s.2(1)(w) IT Act, definition of intermediary | IT_RULES, joint, hash | A | Yes |
| BNSS s.173(1) (any area; woman officer proviso), 173(2) (free copy), 173(4) (Superintendent of Police) | FIR | BNSS, checked by the second reviewer | Yes |

## 4. New templates

- **ESCALATION_L1, the 24-hour follow-up to the platform.** A covering letter, then the text of the original complaint from its own reviewed template. It states the service date, that the two-hour removal and 24-hour acknowledgement periods have passed with no confirmation received, asks for immediate removal, and notes the survivor may now appeal to the GAC and report on NCRP. It says plainly that the covering letter is Asmita's and does not alter the signed complaint. The escalation engine sends it only when **both** this template and the original complaint's template are legally reviewed; until then the follow-up is held and retried.
- **FIR_PACKAGE, the survivor's own written complaint to the police.** Fill-in-the-blanks letter to the SHO or Cyber Crime Police Station: facts in her words, the link and platform, the Rule 3(2)(b) complaint already made, the offences, and requests to register an FIR, give a free copy, preserve records and act on removal. It tells her to attach screenshots of the link and account name, never the intimate content. Asmita never files it for her. Not yet shown anywhere in the app.

## 5. Decisions for counsel

1. **Two hours.** Confirm the 2-hour period under amended Rule 3(2)(b) is right to demand in every complaint, including hash-only advisories where content is identified by fingerprint rather than URL. The survivor's case page now shows a 2-hour platform deadline to match.
2. **Hash identification.** Does a PDQ fingerprint identify content well enough to trigger Rule 3(2)(b), or should the advisory stay a request under the SOP only?
3. **Rule 7 as the safe-harbour hook.** Confirm the wording and that it is the right basis in place of s.79(3)(b).
4. **Preservation request (Rule 3(1)(g)).** Keep as a request, strengthen, or drop.
5. **FIR template.** Confirm the BNSS s.173 points (e-FIR, free copy, zero FIR) and whether the template should cite the section.
6. **TAKE IT DOWN Act codification (DMCA and joint templates).** The templates cite it as 15 U.S.C. § 6851, from PRD Section 4. 15 U.S.C. § 6851 is the 2022 civil remedy for disclosure of intimate images; the 2025 Act's notice-and-removal duty appears to sit elsewhere (enforced by the FTC). The joint template now tags it; the DMCA template is unchanged pending a US-law check. The DMCA template's claim that the person depicted holds copyright "as the subject depicted" is also doubtful: copyright belongs to the author (the photographer), so it holds only for images she took herself.
7. **SOP vs amendment.** The SOP's 24 hours predates G.S.R. 120(E). Confirm no revised SOP has issued.
8. **Prepared complaint and appeal wording** on the survivor's case page stays hidden until `ESCALATION_DRAFTS_REVIEWED=true` is set after your review.
9. **Gender.** Every template refers to the Complainant as "she" and BNS s.77 protects women. Registration does not ask gender. Either intake is limited to women (as the SOP's scope is), or the templates need neutral wording; s.77 is already conditional.
10. **When the GAC appeal opens.** Rule 3A(3) allows an appeal once the Rule 3(2)(b) period has passed. The 24-hour follow-up tells the platform she "may now appeal", but the survivor's case page suggests the appeal only after 7 days. Confirm which the site should advise.
11. **s.67 penalty.** The templates give the IT Act's first-conviction maxima (three years for s.67, five for s.67A). PRD Section 4 says "up to 5 years" for s.67, which is the second-conviction figure.
12. **Declaration inspection.** The notices offer the signed declaration for inspection. Confirm what it would disclose about her before any is shared.

## 6. Legal disclaimer

This is AI-generated legal information based on Indian law, not legal advice. It must not be used to send a live notice without review and sign-off by an advocate enrolled with a Bar Council. Statutory citations must be independently verified against India Code and the Gazette. Recent amendments or judicial developments may not be reflected. The POCSO protocol applies separately for minors.
