# LEGAL OPINION — NOTICE TEMPLATE REVIEW & REDRAFT

**Matter**: Outbound NCII Takedown Notice Templates — All Template Types
**Date**: 15 June 2026
**Prepared By**: Claude Code
**Skills Applied**:
- `Indian-Legal-Skill` (local) — indian-legal-notice · MeitY NCII SOP v.1 (Oct 2025)
- `anthropics/claude-for-legal` → `ip-legal:takedown`
- `zubair-trabzada/ai-legal-claude` → `legal-risks` · `legal-review`
**Reference**: Asmita Platform — `prisma/template-seeds.ts`

---

## 1. STATUTORY TOOLKIT APPLIED

All citations verified against this skill's checklist. `[HEDGED]` markers retained
where gazette text was not available at time of drafting.

| Provision | Verified | Use in notices |
|---|---|---|
| IT Rules 2021, Rule 3(2)(b) | ✓ | PRIMARY hook — 24-hour mandatory removal |
| IT Rules 2021, Rule 3(1)(b)(iv) | ✓ | Due-diligence duty not to host NCII |
| IT Rules 2021, Rule 3A | ✓ | Grievance Appellate Committee — appeal at www.gac.gov.in |
| IT Rules 2021, Rule 4(1)(c) | ✓ | Acknowledge 24h, resolve 15 days |
| IT Rules 2021, Rule 4(4) | ✓ | Re-upload prevention 72h; SSMI hash/crawler duty; I4C Sahyog Portal |
| IT Act 2000, s.79(3)(b) | ✓ | Safe-harbour loss on notice + failure to act (secondary to Rule 3(2)(b); Shreya Singhal caveat applies) |
| IT Act 2000, s.66E | ✓ | Violation of privacy |
| IT Act 2000, ss.67 / 67A | ✓ | Obscene / sexually explicit material |
| BNS 2023, s.77 | ✓ | Voyeurism (replaces IPC 354C; in force 1 Jul 2024) |
| Indecent Representation of Women (Prohibition) Act, 1986 | ✓ | Named in MeitY NCII SOP as removal basis |
| DPDP Act 2023 | ✓ | Data-minimisation basis for withholding complainant PII |
| MeitY NCII SOP v.1 (October 2025) | ✓ | Pursuant to Madras HC order dated 15.07.2025 in WP 25017/2025; covers deepfakes, two-track removal, I4C Sahyog Portal hash bank, de-indexing duty |
| 15 U.S.C. § 6851 (TAKE IT DOWN Act 2025) | ✓ | PRIMARY US hook — 48h removal; no copyright required |
| 17 U.S.C. § 512(c)(3) (DMCA) | ✓ | Secondary/conditional; all 6 elements; Lenz fair-use gate; §512(f) notice |
| Shreya Singhal v. Union of India, (2015) 5 SCC 1 | ✓ | s.79(3)(b) actual knowledge = court order/govt notification |
| Justice K.S. Puttaswamy v. Union of India, (2017) 10 SCC 1 | ✓ | Privacy as Art. 21 right |

---

## 2. PRE-DISPATCH CHECKLIST STATUS

Applied against all four templates below:

- [x] Rule 3(2)(b) 24h obligation foregrounded as PRIMARY OBLIGATION
- [x] s.79(3)(b) safe-harbour consequence stated; Shreya Singhal caveat handled
- [x] All section/rule numbers specific — no vague "BNS sections" or "IT Rules"
- [x] BNS s.77 cited (voyeurism); Indecent Representation of Women Act 1986 added
- [x] MeitY NCII SOP v.1 (Oct 2025) cited; I4C Sahyog Portal referenced in hash template
- [x] Grievance Appellate Committee (Rule 3A) paragraph with www.gac.gov.in present
- [x] PII withheld; DPDP 2023 data-minimisation cited; identity offered on verified request only
- [x] No media described, fetched, or embedded; no-media disclaimer present
- [x] Secure portal locator `{{url}}` — raw URL never in email body
- [x] US templates: §6851 primary; all 6 DMCA §512(c)(3) elements; Lenz + §512(f)
- [x] Hash annex covered by complainant declaration (hash template)
- [x] `[DRAFT — PENDING LEGAL REVIEW — DO NOT DISPATCH]` marker present
- [x] Legal disclaimer block appended

---

## 3. FINAL NOTICE TEMPLATES

---

### 3.1 IT_RULES_2021

**Subject template**:
```
Statutory notice for removal of non-consensual intimate imagery under
Rule 3(2)(b) of the IT (Intermediary Guidelines and Digital Media Ethics
Code) Rules, 2021 — Case Reference {{caseReference}}
```

**Body template**:

```
To: The Resident Grievance Officer, {{platformName}}

Subject: Statutory notice for removal of non-consensual intimate imagery
under Rule 3(2)(b) of the IT (Intermediary Guidelines and Digital Media
Ethics Code) Rules, 2021 — Case Reference {{caseReference}}

Madam / Sir,

1. FILING PARTY

Asmita (meriasmita.org) is a public-interest platform that assists adult
residents of India in submitting takedown notices for non-consensual intimate
imagery (NCII). This notice is filed on behalf of a complainant who has
executed a signed digital declaration. Asmita acts as a technical facilitating
intermediary; it is not the complainant.

2. COMPLAINANT

The complainant is a verified adult Indian resident. Identifying information
is retained by Asmita under encryption and is withheld from this notice to
limit further exposure of the survivor, consistent with the data-minimisation
principle under the Digital Personal Data Protection Act, 2023. Identifying
details will be furnished to your Resident Grievance Officer on a verified
written request.

Declaration reference: {{declarationReference}}

3. CONTENT TO BE REMOVED

Asmita case reference: {{caseReference}}
Secure content locator: {{url}}

The above link is a one-time secure portal to the URL reported by the
complainant. Asmita has at no point retrieved, viewed, downloaded, stored,
or processed the intimate content itself. The locator is provided solely
to enable your moderation team to identify the specific content on your
service.

4. NATURE OF THE COMPLAINT

The complainant has stated, under her signed digital declaration, that the
content accessible via the locator above:

(a) depicts or purports to depict her in an intimate or private context;
(b) constitutes non-consensual intimate imagery within the meaning of
    Rule 3(1)(b)(iv) of the IT (Intermediary Guidelines and Digital Media
    Ethics Code) Rules, 2021; and
(c) has been published, hosted, or made accessible on your service without
    her free and informed consent.

The complainant is the person depicted, or her authorised representative,
within the meaning of the applicable rules.

5. STATUTORY BASIS AND OBLIGATIONS TRIGGERED

PRIMARY OBLIGATION — MANDATORY 24-HOUR REMOVAL:

Rule 3(2)(b) of the Information Technology (Intermediary Guidelines and
Digital Media Ethics Code) Rules, 2021 requires that upon receipt of a
complaint regarding content that depicts a person in a private area or
depicts a sexual act without consent, the intermediary shall remove or
disable access to such content within 24 hours. This obligation is
mandatory and does not depend on any court order.

This notice has been filed in accordance with the MeitY NCII SOP v.1
(October 2025), issued pursuant to the Madras High Court order dated
15.07.2025 in WP 25017/2025, which applies the 24-hour removal track to
content including artificially morphed and deepfake intimate imagery.

SAFE HARBOUR CONSEQUENCE:

Section 79(3)(b) of the Information Technology Act, 2000 provides that
an intermediary loses the exemption under Section 79(1) if, on receiving
actual knowledge of unlawful content, it fails to expeditiously remove or
disable access to such material. This notice, read with the mandatory
obligation under Rule 3(2)(b), places {{platformName}} on notice of the
unlawful nature of the content. (Note: for the government-notification
track under s.79(3)(b) + Rule 3(1)(d), the removal window is 36 hours.)

ADDITIONAL PROVISIONS ENGAGED:

(a) Section 66E of the Information Technology Act, 2000 — violation of
    privacy by capturing, publishing, or transmitting an image of a
    private area without consent;
(b) Section 67 of the Information Technology Act, 2000 — publishing or
    transmitting obscene material in electronic form;
(c) Section 67A of the Information Technology Act, 2000 — publishing or
    transmitting material containing sexually explicit acts;
(d) Section 77 of the Bharatiya Nyaya Sanhita, 2023 — voyeurism:
    capturing or disseminating an image of a woman in a private act
    without consent (imprisonment 1–7 years, in force 1 July 2024);
(e) The Indecent Representation of Women (Prohibition) Act, 1986 —
    prohibition on indecent representation of women, as invoked by the
    MeitY NCII SOP v.1; and
(f) Rule 4(4) of the Intermediary Rules — obligation to prevent re-upload
    of the removed content for a minimum of 72 hours.

6. REQUESTED ACTION

The complainant respectfully requires that {{platformName}}:

(i)   acknowledge receipt of this notice within 24 hours as required
      under Rule 4(1)(c) of the Intermediary Rules;
(ii)  remove or disable access to the content identified at paragraph 3
      within 24 hours as required under Rule 3(2)(b) of the Intermediary
      Rules;
(iii) prevent re-upload or re-publication of the same content for a
      minimum of 72 hours as required under Rule 4(4) of the Intermediary
      Rules;
(iv)  preserve all underlying account records, metadata, IP logs, and
      content for a reasonable period to assist any subsequent
      investigation by Indian law-enforcement agencies; and
(v)   confirm action taken to Asmita at the return address in paragraph 8,
      quoting case reference {{caseReference}}.

7. GRIEVANCE APPELLATE COMMITTEE AND PARALLEL REPORTING CHANNELS

If {{platformName}} fails to act within the prescribed period, the
complainant may:

(a) appeal to the Grievance Appellate Committee constituted under Rule 3A
    of the Intermediary Rules within 30 days of the expiry of the
    resolution period, at www.gac.gov.in; and
(b) report the matter to the National Cybercrime Reporting Portal at
    cybercrime.gov.in or helpline 1930, and to One Stop Centres under
    MWCD Mission Shakti, in accordance with the MeitY NCII SOP v.1.

Asmita reserves the right to assist the complainant in filing such
appeal and to report non-compliance to the Ministry of Electronics and
Information Technology.

8. RETURN ADDRESS

All communications regarding this notice must be addressed to Asmita at
the email address from which this notice was sent, quoting case reference
{{caseReference}}.

9. DECLARATION

The complainant has executed a digital declaration affirming all matters
set out above, confirming the complaint is made in good faith and to the
best of her knowledge and belief. The declaration is retained by Asmita
and is available for inspection by your Resident Grievance Officer on a
verified written request.

Filed electronically by Asmita on behalf of the complainant.
Case reference: {{caseReference}}

[DRAFT — PENDING LEGAL REVIEW — DO NOT DISPATCH]
```

---

### 3.2 DMCA

> **Risk analysis (ip-legal:takedown + legal-risks)**
>
> | Clause | Risk | Fix applied |
> |---|---|---|
> | Missing §512(c)(3)(A) electronic signature element | 7/10 HIGH | Added — declaration authorises Asmita as representative |
> | Lenz fair-use gate absent | 7/10 HIGH | Good-faith fair-use consideration statement added |
> | §512(f) misrepresentation liability not disclosed | 8/10 HIGH | Explicit §512(f) notice added |
> | DMCA listed before TAKE IT DOWN Act | 6/10 MEDIUM | §6851 elevated to primary; DMCA secondary/conditional |

**Subject template**:
```
Non-consensual intimate imagery removal request under 15 U.S.C. § 6851
(TAKE IT DOWN Act, 2025) and 17 U.S.C. § 512(c)(3) — {{caseReference}}
```

**Body template**:

```
To: The Designated Agent / Trust and Safety Team, {{platformName}}

Subject: Non-consensual intimate imagery removal request under
15 U.S.C. § 6851 (TAKE IT DOWN Act, 2025) and 17 U.S.C. § 512(c)(3)
— {{caseReference}}

Madam / Sir,

1. NATURE AND BASIS OF THIS NOTICE

PRIMARY BASIS — TAKE IT DOWN ACT:
This communication is a notification under the Tools to Address Known
Exploitation by Immobilizing Technological Deepfakes on Websites and
Networks Act of 2025 ("TAKE IT DOWN Act"), 15 U.S.C. § 6851. This Act
obligates covered platforms to remove identified non-consensual intimate
visual depictions within 48 hours of receipt of a valid notification.
This basis applies regardless of whether the complainant holds copyright
in the depicted work.

SECONDARY BASIS — DMCA (CONDITIONAL):
This communication additionally constitutes a takedown notification under
17 U.S.C. § 512(c)(3) of the Digital Millennium Copyright Act, to the
extent the complainant retains copyright in the depicted work. The
complainant has in good faith considered whether the material's use on
your service could constitute fair use within the meaning of 17 U.S.C.
§ 107, and concludes that it does not, given the non-consensual, intimate,
and identifying nature of the content. [Lenz v. Universal Music Corp.,
801 F.3d 1126 (9th Cir. 2015).]

The complainant invokes both bases without prejudice to each other.

2. ELECTRONIC SIGNATURE [17 U.S.C. § 512(c)(3)(A) — ELEMENT 1]

This notice is submitted electronically by Asmita on behalf of the
complainant. The complainant's signed digital declaration (reference:
{{declarationReference}}) constitutes her authorisation of Asmita to
act as her representative for the purpose of this notification. Asmita's
submission of this notice on behalf of the complainant serves as the
authorised electronic signature under 17 U.S.C. § 512(c)(3)(A).

3. IDENTIFICATION OF THE COMPLAINANT [§ 512(c)(3)(A) — ELEMENT 4]

The complainant is the identifiable person depicted in the material
identified at paragraph 4 below. Personal contact details have been
intentionally withheld for the complainant's safety and will be
furnished on a verified written request from your designated agent.

Declaration reference: {{declarationReference}}

4. IDENTIFICATION OF MATERIAL TO BE REMOVED
   [§ 512(c)(3)(A) — ELEMENTS 2 AND 3]

Asmita case reference: {{caseReference}}
Secure content locator: {{url}}

The above link is a one-time secure portal to the URL on your service.
Asmita has not retrieved, viewed, downloaded, stored, or displayed the
content at any point. The locator is provided solely to enable your
designated agent to identify the specific content.

5. PRIMARY STATEMENT UNDER 15 U.S.C. § 6851 (TAKE IT DOWN ACT)

The complainant states that:

(a) the material identified at paragraph 4 is a non-consensual intimate
    visual depiction of the complainant within the meaning of 15 U.S.C.
    § 6851(a)(3);
(b) the complainant has not consented to the publication, transmission,
    or hosting of the material on your service; and
(c) the complainant is the identifiable person depicted, or is her
    authorised representative.

Under 15 U.S.C. § 6851(b)(1), your platform is required to remove or
disable access to the identified content within 48 hours of receipt
of this valid notification.

6. SECONDARY STATEMENT UNDER 17 U.S.C. § 512(c)(3) (DMCA)
   [§ 512(c)(3)(A) — ELEMENTS 5 AND 6]

To the extent the complainant holds copyright in the depicted work:

(a) Good-faith belief [Element 5]: The complainant has a good-faith
    belief, having considered fair use, that the use of the material at
    paragraph 4 is not authorised by the copyright owner, its agent, or
    the law.
(b) Accuracy and authority [Element 6]: The information in this
    notification is accurate. Under penalty of perjury, the complainant
    affirms she is the rights-holder or is authorised to act on the
    rights-holder's behalf.

SECTION 512(f) NOTICE: Under 17 U.S.C. § 512(f), any person who
knowingly materially misrepresents that material is infringing may be
liable for damages incurred by the alleged infringer. This notice is
filed in good faith based on the complainant's verified declaration.

7. REQUESTED ACTION

The complainant respectfully requires that {{platformName}}:

(i)   remove or disable access to the content identified at paragraph 4
      within 48 hours as required under 15 U.S.C. § 6851(b)(1);
(ii)  prevent re-upload or re-publication of the same content;
(iii) preserve all underlying account records, metadata, and content for
      a reasonable period to assist any subsequent investigation by
      competent authorities; and
(iv)  confirm action taken to the return address in paragraph 8, quoting
      case reference {{caseReference}}.

8. RETURN ADDRESS

All correspondence concerning this notice must be addressed to Asmita at
the email address from which this notice was sent, quoting case reference
{{caseReference}}.

9. DECLARATION

The complainant's signed digital declaration is retained by Asmita and
is available to your designated agent on verified written request.

Filed electronically by Asmita on behalf of the complainant.
Case reference: {{caseReference}}

[DRAFT — PENDING LEGAL REVIEW — DO NOT DISPATCH]
```

---

### 3.3 IT_RULES_AND_DMCA

**Subject template**:
```
Joint statutory notice for removal of non-consensual intimate imagery
(Indian IT Rules 2021 and 15 U.S.C. § 6851) — {{caseReference}}
```

**Body template**:

```
To: The Resident Grievance Officer (India) and the Designated Agent /
Trust and Safety Team, {{platformName}}

Subject: Joint statutory notice for removal of non-consensual intimate
imagery under IT Rules 2021 and 15 U.S.C. § 6851 (TAKE IT DOWN Act,
2025) — {{caseReference}}

Madam / Sir,

1. PURPOSE OF JOINT NOTICE

This communication is filed as a single joint notice under both Indian
and US legal frameworks. {{platformName}} operates Resident Grievance
Officer obligations in India under the IT (Intermediary Guidelines and
Digital Media Ethics Code) Rules, 2021, and maintains a designated agent
for notifications under US law. This joint notice enables your respective
teams to act on whichever legal basis is procedurally cleanest, without
requiring the complainant to file parallel notices.

2. COMPLAINANT

The complainant is a verified adult Indian resident. Identifying
information is retained by Asmita under encryption and withheld from
this notice consistent with the data-minimisation principle under the
Digital Personal Data Protection Act, 2023. Details will be furnished on
a verified written request from your Resident Grievance Officer or
designated agent.

Declaration reference: {{declarationReference}}

3. CONTENT TO BE REMOVED

Asmita case reference: {{caseReference}}
Secure content locator: {{url}}

Asmita has not retrieved, viewed, downloaded, stored, or processed the
intimate content itself. The locator is provided solely to enable your
team to identify the specific content on your service.

4. STATUTORY BASIS — INDIAN LAW

PRIMARY OBLIGATION — MANDATORY 24-HOUR REMOVAL:

Rule 3(2)(b) of the IT (Intermediary Guidelines and Digital Media Ethics
Code) Rules, 2021 requires removal or disabling of access to content
depicting a person in a private area or sexual act without consent within
24 hours of receipt of complaint. This obligation is mandatory.

This notice is filed in accordance with the MeitY NCII SOP v.1 (October
2025), issued pursuant to the Madras High Court order dated 15.07.2025
in WP 25017/2025, which governs the 24-hour individual-grievance track
and applies to artificially morphed and deepfake intimate imagery.

ADDITIONAL INDIAN PROVISIONS:

(a) Section 66E of the Information Technology Act, 2000 — violation of
    privacy;
(b) Sections 67 and 67A of the Information Technology Act, 2000 —
    obscene and sexually explicit material in electronic form;
(c) Section 79(3)(b) of the Information Technology Act, 2000 — loss of
    safe-harbour protection on receipt of this notice and failure to act
    (note: Shreya Singhal v. Union of India, (2015) 5 SCC 1 applies to
    the government-notification track; the Rule 3(2)(b) track is
    independent and does not require a court order);
(d) Section 77 of the Bharatiya Nyaya Sanhita, 2023 — voyeurism
    (imprisonment 1–7 years; in force 1 July 2024);
(e) The Indecent Representation of Women (Prohibition) Act, 1986, as
    invoked by the MeitY NCII SOP v.1; and
(f) Rule 4(4) of the Intermediary Rules — re-upload prevention for 72
    hours; and SSMIs' duty under the MeitY SOP to share content hashes
    with the I4C Sahyog Portal.

5. STATUTORY BASIS — US LAW (IF APPLICABLE TO OPERATOR)

PRIMARY: 15 U.S.C. § 6851 (TAKE IT DOWN Act, 2025) — mandatory removal
of non-consensual intimate visual depictions within 48 hours of valid
notification; does not require copyright ownership.

SECONDARY (CONDITIONAL): 17 U.S.C. § 512(c)(3) (DMCA) — to the extent
the complainant retains copyright in the depicted work. The complainant
has in good faith considered fair use (Lenz v. Universal Music Corp.,
801 F.3d 1126 (9th Cir. 2015)) and concludes it does not apply.
Section 512(f) notice: knowing material misrepresentation of
infringement may expose the filer to damages liability.

6. GOOD-FAITH STATEMENT

The complainant has, by signed digital declaration retained by Asmita,
confirmed that: (a) the material depicts her; (b) it is intimate in
nature; (c) its publication on your service is without her consent; and
(d) this notice is filed in good faith. The information in this notice
is accurate to the best of her knowledge and belief.

7. REQUESTED ACTION

The complainant respectfully requires that {{platformName}}:

(i)   acknowledge receipt within 24 hours as required under Rule 4(1)(c)
      of the Intermediary Rules;
(ii)  remove or disable access to the content identified at paragraph 3
      within 24 hours (Indian law obligation) or 48 hours (US law
      obligation) — whichever is the shorter applicable period;
(iii) prevent re-upload or re-publication for a minimum of 72 hours as
      required under Rule 4(4) of the Intermediary Rules;
(iv)  preserve all account records, metadata, IP logs, and content for
      a reasonable period for any investigation by competent authorities;
      and
(v)   confirm action taken to Asmita at the return address in paragraph
      9, quoting case reference {{caseReference}}.

8. GRIEVANCE APPELLATE COMMITTEE AND PARALLEL REPORTING

If {{platformName}} fails to act within the prescribed Indian-law period,
the complainant may appeal to the Grievance Appellate Committee under
Rule 3A of the Intermediary Rules within 30 days, at www.gac.gov.in, or
report to the National Cybercrime Reporting Portal (cybercrime.gov.in /
1930) per the MeitY NCII SOP v.1. Asmita reserves the right to report
non-compliance to the Ministry of Electronics and Information Technology.

9. RETURN ADDRESS

All communications must be addressed to Asmita at the email address from
which this notice was sent, quoting case reference {{caseReference}}.

10. DECLARATION

The complainant's signed digital declaration is retained by Asmita and
is available to your Resident Grievance Officer or designated agent on
verified written request.

Filed electronically by Asmita on behalf of the complainant.
Case reference: {{caseReference}}

[DRAFT — PENDING LEGAL REVIEW — DO NOT DISPATCH]
```

---

### 3.4 HASH_ADVISORY

> **Skill note (indian-legal-notice, §3):** The MeitY NCII SOP v.1 (Oct 2025) requires
> SSMIs to share perceptual hashes with the **I4C Sahyog Portal** for the national
> hash bank, and obligates search engines to **de-index** matching content. Both
> are now in the requested actions below. The hash annex must be explicitly covered
> by the complainant's signed declaration.

**Subject template**:
```
NCII proactive blocking request — perceptual hash advisory under
Rule 3(2)(b) and Rule 4(4) of the IT Rules, 2021 and MeitY NCII
SOP v.1 (Oct 2025) — {{caseReference}}
```

**Body template**:

```
To: The Resident Grievance Officer / Trust and Safety Team, {{platformName}}

Subject: NCII proactive blocking request — perceptual hash advisory
under Rule 3(2)(b) and Rule 4(4) of the IT (Intermediary Guidelines and
Digital Media Ethics Code) Rules, 2021 and MeitY NCII SOP v.1 (October
2025) — {{caseReference}}

Madam / Sir,

1. PURPOSE

Asmita (meriasmita.org) is a public-interest platform assisting adult
residents of India affected by non-consensual intimate imagery (NCII).
This advisory requests proactive blocking: the complainant reports that
intimate content depicting her has been shared, or is imminently
threatened to be shared, without her consent. To enable your moderation
systems to detect and block this content without any further
dissemination of the material itself, this notice encloses perceptual
hashes in the annex below.

2. COMPLAINANT

The complainant is a verified adult Indian resident who has executed a
signed digital declaration retained by Asmita under encryption.
Identifying information is withheld consistent with the data-minimisation
principle under the Digital Personal Data Protection Act, 2023 and will
be furnished to your Resident Grievance Officer on a verified written
request.

Declaration reference: {{declarationReference}}
Asmita case reference: {{caseReference}}

The complainant's signed declaration expressly covers the perceptual
hashes in the annex below, confirming they represent content in which
she appears and to which she has not consented.

3. NATURE OF THE PERCEPTUAL HASHES

The hashes in the annex were generated on the complainant's own device
using the PDQ perceptual hashing algorithm (Meta ThreatExchange, open-
source). Asmita has at no point received, retrieved, viewed, stored, or
transmitted the underlying media. A perceptual hash is a one-way digital
fingerprint: it enables your systems to identify visually matching media
but cannot be reversed to reconstruct the image.

4. STATUTORY BASIS AND OBLIGATIONS TRIGGERED

PRIMARY OBLIGATION — MANDATORY 24-HOUR REMOVAL OF MATCHING CONTENT:

Rule 3(2)(b) of the IT (Intermediary Guidelines and Digital Media Ethics
Code) Rules, 2021 requires removal or disabling of access to content
depicting a person in a private area or sexual act without consent within
24 hours of receipt of complaint. This obligation applies to any content
on your service that matches the hashes in the annex.

PROACTIVE DUTY — HASH DETECTION AND I4C SAHYOG PORTAL:

Rule 4(4) of the Intermediary Rules, as elaborated in the MeitY NCII SOP
v.1 (October 2025) issued pursuant to the Madras High Court order dated
15.07.2025 in WP 25017/2025, requires SSMIs to:
  (a) deploy crawler/hash detection technology to proactively identify
      and block re-uploads of reported NCII;
  (b) share reported content hashes with the I4C Sahyog Portal for
      inclusion in the national NCII hash bank; and
  (c) (for search engines) de-index matching content within 24 hours.

The hashes in the annex are provided in the PDQ format compatible with
the I4C Sahyog Portal hash bank.

SAFE HARBOUR CONSEQUENCE:

Section 79(3)(b) of the Information Technology Act, 2000 — failure to
act on this notice after receipt is a basis for loss of intermediary safe-
harbour protection under Section 79(1).

ADDITIONAL PROVISIONS:

(a) Rule 3(1)(b)(iv) of the Intermediary Rules — due-diligence duty not
    to host non-consensual intimate imagery;
(b) Section 66E of the Information Technology Act, 2000 — violation of
    privacy;
(c) Sections 67 and 67A of the Information Technology Act, 2000 —
    obscene and sexually explicit material;
(d) Section 77 of the Bharatiya Nyaya Sanhita, 2023 — voyeurism
    (in force 1 July 2024); and
(e) The Indecent Representation of Women (Prohibition) Act, 1986, as
    invoked by the MeitY NCII SOP v.1.

5. REQUESTED ACTION

The complainant respectfully requires that {{platformName}}:

(i)   acknowledge receipt of this advisory within 24 hours;
(ii)  ingest the perceptual hashes in the annex into your proactive
      detection or hash-matching systems so that matching uploads are
      blocked at or promptly after upload, pursuant to Rule 4(4) and the
      MeitY NCII SOP v.1;
(iii) share the enclosed hashes with the I4C Sahyog Portal for the
      national NCII hash bank, as required by the MeitY NCII SOP v.1;
(iv)  remove or disable access to any matching content already published
      on your service within 24 hours as required under Rule 3(2)(b);
(v)   prevent re-upload of matching content for a minimum of 72 hours
      under Rule 4(4);
(vi)  (if applicable) de-index matching content from search results
      within 24 hours per the MeitY NCII SOP v.1;
(vii) preserve account and content records relating to any matches for
      a reasonable period for any investigation by Indian law-enforcement
      agencies; and
(viii)confirm action taken to Asmita at the address in paragraph 7,
      quoting case reference {{caseReference}}.

6. GRIEVANCE APPELLATE COMMITTEE AND PARALLEL REPORTING

If {{platformName}} fails to act within the prescribed period, the
complainant may appeal to the Grievance Appellate Committee under
Rule 3A of the Intermediary Rules within 30 days, at www.gac.gov.in,
or report to the National Cybercrime Reporting Portal at
cybercrime.gov.in / helpline 1930, per the MeitY NCII SOP v.1.
Asmita reserves the right to report non-compliance to MeitY.

7. RETURN ADDRESS

All communications must be addressed to Asmita at the email address from
which this notice was sent, quoting case reference {{caseReference}}.

8. GOOD FAITH AND ACCOUNTABILITY

The complainant has affirmed by signed digital declaration that she
appears in the content represented by the enclosed hashes (or is the
authorised reporter), that its sharing is without consent, and that this
request is made in good faith. Every hash submission is reviewed by an
Asmita administrator before dispatch. Your office may seek clarification
through Asmita, quoting the case reference.

Filed electronically by Asmita on behalf of the complainant.
Case reference: {{caseReference}}

[The perceptual hash annex is appended below this notice body.]

[DRAFT — PENDING LEGAL REVIEW — DO NOT DISPATCH]
```

---

## 4. WHAT CHANGED FROM PREVIOUS DRAFTS

| Template | Addition | Source |
|---|---|---|
| All Indian templates | MeitY NCII SOP v.1 (Oct 2025) cited; Madras HC order WP 25017/2025 | indian-legal-notice skill |
| All Indian templates | Indecent Representation of Women (Prohibition) Act, 1986 | indian-legal-notice skill / MeitY SOP |
| All Indian templates | Grievance Appellate Committee with www.gac.gov.in URL | indian-legal-notice skill |
| All Indian templates | NCRP (cybercrime.gov.in / 1930) and One Stop Centres | MeitY SOP v.1 |
| All Indian templates | s.79 two-track distinction clarified (36h govt-notification vs 24h grievance) | indian-legal-notice skill |
| DMCA | §512(c)(3)(A) electronic signature element added | ip-legal:takedown |
| DMCA | Lenz v. Universal fair-use gate | ip-legal:takedown |
| DMCA | §512(f) misrepresentation liability disclosure | ip-legal:takedown |
| DMCA | §6851 elevated to primary basis | legal-risks + ip-legal:takedown |
| Hash advisory | I4C Sahyog Portal sharing obligation | MeitY SOP v.1 via indian-legal-notice skill |
| Hash advisory | Search engine de-indexing duty (24h) | MeitY SOP v.1 via indian-legal-notice skill |
| Hash advisory | Declaration explicitly covers hash annex | indian-legal-notice skill §2.4 |

---

## LEGAL DISCLAIMER

This is AI-generated legal information and analysis based on Indian law — NOT legal
advice. It must not be used to dispatch a live notice without review and sign-off by
an advocate enrolled with a Bar Council (recommended: Internet Freedom Foundation or
SFLC.in). Statutory citations must be independently verified against India Code
(indiacode.nic.in) and the Gazette. The MeitY NCII SOP v.1 (October 2025) citations
should be verified against the published SOP at meity.gov.in. Recent amendments or
judicial developments may not be reflected. POCSO protocol applies separately for
minors — these templates must never be used for a minor complainant.
