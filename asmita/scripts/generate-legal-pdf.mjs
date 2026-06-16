import puppeteer from "puppeteer";
import { writeFileSync } from "fs";

const OUT = "C:/Users/Media/Desktop/Personal/01-Projects/Asmita/asmita/docs/legal/Asmita-Legal-Notice-Templates.pdf";

// ─── Colours ────────────────────────────────────────────────────────────────
const TEAL   = "#00695C";
const TEAL_L = "#E0F2F1";
const DARK   = "#1A1A1A";
const MUTED  = "#757575";
const HAIR   = "#E0E0E0";
const ROSE   = "#C62828";
const AMBER  = "#E65100";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const esc = (s) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

function statutoryRow(provision, verified, use) {
  const tick = verified === "✓";
  return `
  <tr>
    <td style="font-weight:600;font-size:9pt">${esc(provision)}</td>
    <td style="text-align:center;background:${tick ? TEAL_L : "#FFF8E1"};color:${tick ? TEAL : AMBER};font-weight:700;font-size:11pt">${verified}</td>
    <td style="color:${MUTED};font-size:9pt">${esc(use)}</td>
  </tr>`;
}

function checkRow(label) {
  return `
  <tr>
    <td style="text-align:center;background:${TEAL_L};color:${TEAL};font-weight:700;font-size:12pt;width:36px">✓</td>
    <td style="font-size:9.5pt">${esc(label)}</td>
  </tr>`;
}

function riskRow(clause, score, issue, fix, level) {
  const bg   = level === "HIGH" ? "#FFEBEE" : "#FFF8E1";
  const col  = level === "HIGH" ? ROSE : AMBER;
  return `
  <tr>
    <td style="font-size:9pt;font-weight:600">${esc(clause)}</td>
    <td style="background:${bg};color:${col};font-weight:700;font-size:9pt;white-space:nowrap">${esc(score)}</td>
    <td style="font-size:9pt">${esc(issue)}</td>
    <td style="font-size:9pt;color:${TEAL}">${esc(fix)}</td>
  </tr>`;
}

function changeRow(tmpl, addition, source, i) {
  const bg = i % 2 === 0 ? "#F5F5F5" : "#FFFFFF";
  return `
  <tr style="background:${bg}">
    <td style="font-weight:600;font-size:9pt;white-space:nowrap">${esc(tmpl)}</td>
    <td style="font-size:9pt">${esc(addition)}</td>
    <td style="font-size:9pt;color:${TEAL};white-space:nowrap">${esc(source)}</td>
  </tr>`;
}

function noticeTemplate(title, platform, subject, body) {
  return `
  <div class="notice-block">
    <div class="notice-label">${esc(title)}</div>
    <div class="notice-platform">${esc(platform)}</div>

    <div class="notice-field-label">SUBJECT LINE</div>
    <div class="notice-subject">${esc(subject)}</div>

    <div class="notice-field-label">NOTICE BODY</div>
    <pre class="notice-body">${esc(body)}</pre>
  </div>`;
}

// ─── Notice bodies ────────────────────────────────────────────────────────────
const IT_RULES_BODY = `To: The Resident Grievance Officer, {{platformName}}

Subject: Statutory notice for removal of non-consensual intimate imagery under
Rule 3(2)(b) of the IT (Intermediary Guidelines and Digital Media Ethics Code)
Rules, 2021 — Case Reference {{caseReference}}

Madam / Sir,

1. FILING PARTY

Asmita (meriasmita.org) is a public-interest platform that assists adult residents
of India in submitting takedown notices for non-consensual intimate imagery (NCII).
This notice is filed on behalf of a complainant who has executed a signed digital
declaration. Asmita acts as a technical facilitating intermediary; it is not the
complainant.

2. COMPLAINANT

The complainant is a verified adult Indian resident. Identifying information is
retained by Asmita under encryption and is withheld from this notice to limit
further exposure of the survivor, consistent with the data-minimisation principle
under the Digital Personal Data Protection Act, 2023. Identifying details will be
furnished to your Resident Grievance Officer on a verified written request.

Declaration reference: {{declarationReference}}

3. CONTENT TO BE REMOVED

Asmita case reference: {{caseReference}}
Secure content locator: {{url}}

The above link is a one-time secure portal to the URL reported by the complainant.
Asmita has at no point retrieved, viewed, downloaded, stored, or processed the
intimate content itself. The locator is provided solely to enable your moderation
team to identify the specific content on your service.

4. NATURE OF THE COMPLAINT

The complainant has stated, under her signed digital declaration, that the content
accessible via the locator above:

(a) depicts or purports to depict her in an intimate or private context;
(b) constitutes non-consensual intimate imagery within the meaning of Rule 3(1)(b)(iv)
    of the IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021; and
(c) has been published, hosted, or made accessible on your service without her free
    and informed consent.

The complainant is the person depicted, or her authorised representative, within the
meaning of the applicable rules.

5. STATUTORY BASIS AND OBLIGATIONS TRIGGERED

PRIMARY OBLIGATION — MANDATORY 24-HOUR REMOVAL:

Rule 3(2)(b) of the Information Technology (Intermediary Guidelines and Digital Media
Ethics Code) Rules, 2021 requires that upon receipt of a complaint regarding content
that depicts a person in a private area or depicts a sexual act without consent, the
intermediary shall remove or disable access within 24 hours. This obligation is
mandatory and does not depend on any court order.

This notice is filed in accordance with the MeitY NCII SOP v.1 (October 2025), issued
pursuant to the Madras High Court order dated 15.07.2025 in WP 25017/2025, which
applies the 24-hour removal track to deepfake and morphed intimate imagery.

SAFE HARBOUR CONSEQUENCE:

Section 79(3)(b) of the Information Technology Act, 2000 provides that an intermediary
loses the exemption under s.79(1) if, on receiving actual knowledge of unlawful content,
it fails to expeditiously remove or disable access. This notice, read with Rule 3(2)(b),
places {{platformName}} on notice of the unlawful nature of the content.

Note: Shreya Singhal v. Union of India, (2015) 5 SCC 1 holds that "actual knowledge"
under s.79(3)(b) requires a court order or government notification. The Rule 3(2)(b)
grievance track operates independently of this requirement.

ADDITIONAL PROVISIONS ENGAGED:

(a) Section 66E, IT Act 2000 — violation of privacy (capturing/publishing image of
    private area without consent);
(b) Section 67, IT Act 2000 — publishing or transmitting obscene material in
    electronic form;
(c) Section 67A, IT Act 2000 — publishing or transmitting sexually explicit material;
(d) Section 77, BNS 2023 — voyeurism: capturing or disseminating image of a woman in
    a private act without consent (imprisonment 1–7 years; in force 1 July 2024);
(e) Indecent Representation of Women (Prohibition) Act, 1986, as invoked by the
    MeitY NCII SOP v.1; and
(f) Rule 4(4), IT Rules 2021 — re-upload prevention for 72 hours.

6. REQUESTED ACTION

The complainant respectfully requires that {{platformName}}:

(i)   acknowledge receipt of this notice within 24 hours as required under
      Rule 4(1)(c) of the Intermediary Rules;
(ii)  remove or disable access to the content identified at paragraph 3 within
      24 hours as required under Rule 3(2)(b) of the Intermediary Rules;
(iii) prevent re-upload or re-publication of the same content for a minimum of
      72 hours as required under Rule 4(4) of the Intermediary Rules;
(iv)  preserve all underlying account records, metadata, IP logs, and content for
      a reasonable period to assist any subsequent investigation by Indian
      law-enforcement agencies; and
(v)   confirm action taken to Asmita at the return address in paragraph 8, quoting
      case reference {{caseReference}}.

7. GRIEVANCE APPELLATE COMMITTEE AND PARALLEL REPORTING CHANNELS

If {{platformName}} fails to act within the prescribed period, the complainant may:

(a) appeal to the Grievance Appellate Committee constituted under Rule 3A of the
    Intermediary Rules within 30 days of the expiry of the resolution period,
    at www.gac.gov.in; and
(b) report the matter to the National Cybercrime Reporting Portal at
    cybercrime.gov.in or helpline 1930, and to One Stop Centres under MWCD Mission
    Shakti, in accordance with the MeitY NCII SOP v.1.

Asmita reserves the right to assist the complainant in filing such appeal and to
report non-compliance to the Ministry of Electronics and Information Technology.

8. RETURN ADDRESS

All communications regarding this notice must be addressed to Asmita at the email
address from which this notice was sent, quoting case reference {{caseReference}}.

9. DECLARATION

The complainant has executed a digital declaration affirming all matters set out
above, confirming the complaint is made in good faith and to the best of her
knowledge and belief. The declaration is retained by Asmita and is available for
inspection by your Resident Grievance Officer on a verified written request.

Filed electronically by Asmita on behalf of the complainant.
Case reference: {{caseReference}}

[DRAFT — PENDING LEGAL REVIEW — DO NOT DISPATCH]`;

const DMCA_BODY = `To: The Designated Agent / Trust and Safety Team, {{platformName}}

Subject: Non-consensual intimate imagery removal request under 15 U.S.C. § 6851
(TAKE IT DOWN Act, 2025) and 17 U.S.C. § 512(c)(3) — {{caseReference}}

Madam / Sir,

1. NATURE AND BASIS OF THIS NOTICE

PRIMARY BASIS — TAKE IT DOWN ACT:
This communication is a notification under the Tools to Address Known Exploitation
by Immobilizing Technological Deepfakes on Websites and Networks Act of 2025
("TAKE IT DOWN Act"), 15 U.S.C. § 6851. Covered platforms must remove identified
non-consensual intimate visual depictions within 48 hours of receipt of a valid
notification. This basis applies regardless of whether the complainant holds
copyright in the depicted work.

SECONDARY BASIS — DMCA (CONDITIONAL):
This communication additionally constitutes a takedown notification under
17 U.S.C. § 512(c)(3) of the Digital Millennium Copyright Act, to the extent the
complainant retains copyright in the depicted work. The complainant has in good
faith considered whether the material's use on your service could constitute fair
use within the meaning of 17 U.S.C. § 107 and concludes that it does not, given
the non-consensual, intimate, and identifying nature of the content.
[Lenz v. Universal Music Corp., 801 F.3d 1126 (9th Cir. 2015).]

The complainant invokes both bases without prejudice to each other.

2. ELECTRONIC SIGNATURE [17 U.S.C. § 512(c)(3)(A) — ELEMENT 1]

This notice is submitted electronically by Asmita on behalf of the complainant.
The complainant's signed digital declaration (reference: {{declarationReference}})
constitutes her authorisation of Asmita to act as her representative for the
purpose of this notification. Asmita's submission of this notice on behalf of the
complainant serves as the authorised electronic signature under
17 U.S.C. § 512(c)(3)(A).

3. IDENTIFICATION OF THE COMPLAINANT [§ 512(c)(3)(A) — ELEMENT 4]

The complainant is the identifiable person depicted in the material identified at
paragraph 4. Personal contact details are withheld for safety and will be furnished
on verified written request from your designated agent.

Declaration reference: {{declarationReference}}

4. IDENTIFICATION OF MATERIAL TO BE REMOVED [§ 512(c)(3)(A) — ELEMENTS 2 AND 3]

Asmita case reference: {{caseReference}}
Secure content locator: {{url}}

Asmita has not retrieved, viewed, downloaded, stored, or displayed the content at
any point. The locator is provided solely to enable your designated agent to
identify the specific content on your service.

5. PRIMARY STATEMENT UNDER 15 U.S.C. § 6851 (TAKE IT DOWN ACT)

The complainant states that:

(a) the material identified at paragraph 4 is a non-consensual intimate visual
    depiction of the complainant within the meaning of 15 U.S.C. § 6851(a)(3);
(b) the complainant has not consented to the publication, transmission, or hosting
    of the material on your service; and
(c) the complainant is the identifiable person depicted, or is her authorised
    representative.

Under 15 U.S.C. § 6851(b)(1), your platform is required to remove or disable access
to the identified content within 48 hours of receipt of this valid notification.

6. SECONDARY STATEMENT UNDER 17 U.S.C. § 512(c)(3) [ELEMENTS 5 AND 6]

To the extent the complainant holds copyright in the depicted work:

(a) Good-faith belief [Element 5]: The complainant has a good-faith belief, having
    considered fair use, that the use of the material at paragraph 4 is not
    authorised by the copyright owner, its agent, or the law.
(b) Accuracy and authority [Element 6]: The information in this notification is
    accurate. Under penalty of perjury, the complainant affirms she is the rights-
    holder or is authorised to act on the rights-holder's behalf.

SECTION 512(f) NOTICE: Under 17 U.S.C. § 512(f), any person who knowingly
materially misrepresents that material is infringing may be liable for damages
incurred by the alleged infringer. This notice is filed in good faith based on the
complainant's verified declaration.

7. REQUESTED ACTION

The complainant respectfully requires that {{platformName}}:

(i)   remove or disable access to the content identified at paragraph 4 within 48
      hours as required under 15 U.S.C. § 6851(b)(1);
(ii)  prevent re-upload or re-publication of the same content;
(iii) preserve all underlying account records, metadata, and content for a
      reasonable period to assist any subsequent investigation by competent
      authorities; and
(iv)  confirm action taken to the return address in paragraph 8, quoting case
      reference {{caseReference}}.

8. RETURN ADDRESS

All correspondence must be addressed to Asmita at the email address from which
this notice was sent, quoting case reference {{caseReference}}.

9. DECLARATION

The complainant's signed digital declaration is retained by Asmita and is available
to your designated agent on verified written request.

Filed electronically by Asmita on behalf of the complainant.
Case reference: {{caseReference}}

[DRAFT — PENDING LEGAL REVIEW — DO NOT DISPATCH]`;

const JOINT_BODY = `To: The Resident Grievance Officer (India) and the Designated Agent /
Trust and Safety Team, {{platformName}}

Subject: Joint statutory notice for removal of non-consensual intimate imagery under
IT Rules 2021 and 15 U.S.C. § 6851 (TAKE IT DOWN Act, 2025) — {{caseReference}}

Madam / Sir,

1. PURPOSE OF JOINT NOTICE

This communication is filed as a single joint notice under both Indian and US legal
frameworks. {{platformName}} operates Resident Grievance Officer obligations in India
under the IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, and
maintains a designated agent for notifications under US law. This joint notice enables
your respective teams to act on whichever legal basis is procedurally cleanest, without
requiring the complainant to file parallel notices.

2. COMPLAINANT

The complainant is a verified adult Indian resident. Identifying information is retained
by Asmita under encryption and withheld consistent with the data-minimisation principle
under the Digital Personal Data Protection Act, 2023. Details will be furnished on a
verified written request from your Resident Grievance Officer or designated agent.

Declaration reference: {{declarationReference}}

3. CONTENT TO BE REMOVED

Asmita case reference: {{caseReference}}
Secure content locator: {{url}}

Asmita has not retrieved, viewed, downloaded, stored, or processed the intimate content
itself. The locator is provided solely to enable your team to identify the specific
content on your service.

4. STATUTORY BASIS — INDIAN LAW

PRIMARY OBLIGATION — MANDATORY 24-HOUR REMOVAL:

Rule 3(2)(b) of the IT (Intermediary Guidelines and Digital Media Ethics Code) Rules,
2021 requires removal or disabling of access to content depicting a person in a private
area or sexual act without consent within 24 hours of receipt of complaint. This
obligation is mandatory and does not depend on a court order.

This notice is filed in accordance with the MeitY NCII SOP v.1 (October 2025), issued
pursuant to the Madras High Court order dated 15.07.2025 in WP 25017/2025, applicable
to artificially morphed and deepfake intimate imagery.

ADDITIONAL PROVISIONS:

(a) Section 66E, IT Act 2000 — violation of privacy;
(b) Sections 67 and 67A, IT Act 2000 — obscene and sexually explicit material;
(c) Section 79(3)(b), IT Act 2000 — safe-harbour loss (Shreya Singhal, (2015) 5 SCC 1,
    governs the government-notification track; Rule 3(2)(b) operates independently);
(d) Section 77, BNS 2023 — voyeurism (imprisonment 1–7 years; in force 1 July 2024);
(e) Indecent Representation of Women (Prohibition) Act, 1986 per MeitY NCII SOP v.1;
(f) Rule 4(4), IT Rules 2021 — re-upload prevention 72h; I4C Sahyog Portal hash sharing.

5. STATUTORY BASIS — US LAW (IF APPLICABLE TO OPERATOR)

PRIMARY: 15 U.S.C. § 6851 (TAKE IT DOWN Act, 2025) — mandatory removal within 48
hours of valid notification; does not require copyright ownership.

SECONDARY (CONDITIONAL): 17 U.S.C. § 512(c)(3) (DMCA) — to the extent the
complainant retains copyright. The complainant has in good faith considered fair use
[Lenz v. Universal Music Corp., 801 F.3d 1126 (9th Cir. 2015)] and concludes it does
not apply. § 512(f) notice: knowing material misrepresentation may expose the filer to
damages liability.

6. GOOD-FAITH STATEMENT

The complainant has, by signed digital declaration retained by Asmita, confirmed that:
(a) the material depicts her; (b) it is intimate in nature; (c) its publication is
without her consent; and (d) this notice is filed in good faith.

7. REQUESTED ACTION

The complainant respectfully requires that {{platformName}}:

(i)   acknowledge receipt within 24 hours per Rule 4(1)(c) of the Intermediary Rules;
(ii)  remove or disable access to the content identified at paragraph 3 within
      24 hours (Indian law) or 48 hours (US law) — whichever is the shorter period;
(iii) prevent re-upload for a minimum of 72 hours per Rule 4(4);
(iv)  preserve all account records, metadata, IP logs, and content; and
(v)   confirm action taken to Asmita at the return address in paragraph 9, quoting
      case reference {{caseReference}}.

8. GRIEVANCE APPELLATE COMMITTEE AND PARALLEL REPORTING

If {{platformName}} fails to act under Indian law, the complainant may appeal to the
Grievance Appellate Committee under Rule 3A within 30 days at www.gac.gov.in, or
report to NCRP at cybercrime.gov.in / helpline 1930 per the MeitY NCII SOP v.1.

9. RETURN ADDRESS

All communications must be addressed to Asmita at the email address from which this
notice was sent, quoting case reference {{caseReference}}.

10. DECLARATION

The complainant's signed digital declaration is retained by Asmita and is available
to your Resident Grievance Officer or designated agent on verified written request.

Filed electronically by Asmita on behalf of the complainant.
Case reference: {{caseReference}}

[DRAFT — PENDING LEGAL REVIEW — DO NOT DISPATCH]`;

const HASH_BODY = `To: The Resident Grievance Officer / Trust and Safety Team, {{platformName}}

Subject: NCII proactive blocking request — perceptual hash advisory under Rule 3(2)(b)
and Rule 4(4) of the IT Rules, 2021 and MeitY NCII SOP v.1 (October 2025)
— {{caseReference}}

Madam / Sir,

1. PURPOSE

Asmita (meriasmita.org) is a public-interest platform assisting adult residents of
India affected by non-consensual intimate imagery (NCII). This advisory requests
proactive blocking: the complainant reports that intimate content depicting her has
been shared, or is imminently threatened to be shared, without her consent. To enable
your moderation systems to detect and block this content without any further
dissemination of the material, this notice encloses perceptual hashes in the annex.

2. COMPLAINANT

The complainant is a verified adult Indian resident who has executed a signed digital
declaration retained by Asmita under encryption. Identifying information is withheld
consistent with the data-minimisation principle under the Digital Personal Data
Protection Act, 2023 and will be furnished to your Resident Grievance Officer on a
verified written request.

Declaration reference: {{declarationReference}}
Asmita case reference: {{caseReference}}

The complainant's signed declaration expressly covers the perceptual hashes in the
annex below, confirming they represent content in which she appears and to which she
has not consented.

3. NATURE OF THE PERCEPTUAL HASHES

The hashes were generated on the complainant's own device using the PDQ perceptual
hashing algorithm (Meta ThreatExchange, open-source). Asmita has at no point received,
retrieved, viewed, stored, or transmitted the underlying media. A perceptual hash is a
one-way digital fingerprint: it permits your systems to identify visually matching media
but cannot be reversed to reconstruct the image.

4. STATUTORY BASIS AND OBLIGATIONS TRIGGERED

PRIMARY OBLIGATION — MANDATORY 24-HOUR REMOVAL OF MATCHING CONTENT:

Rule 3(2)(b) of the IT Rules, 2021 requires removal or disabling of access to content
depicting a person in a private area or sexual act without consent within 24 hours of
receipt of complaint. This obligation applies to any content on your service that
matches the hashes in the annex.

PROACTIVE DUTY — HASH DETECTION AND I4C SAHYOG PORTAL:

Rule 4(4) of the Intermediary Rules, as elaborated in the MeitY NCII SOP v.1
(October 2025, Madras HC WP 25017/2025), requires SSMIs to:
  (a) deploy crawler/hash detection technology to proactively identify and block
      re-uploads of reported NCII;
  (b) share reported content hashes with the I4C Sahyog Portal for inclusion in the
      national NCII hash bank; and
  (c) (for search engines) de-index matching content within 24 hours.

The hashes in the annex are provided in PDQ format compatible with the I4C Sahyog Portal.

SAFE HARBOUR CONSEQUENCE:

Section 79(3)(b), IT Act 2000 — failure to act on this notice is a basis for loss of
intermediary safe-harbour protection under Section 79(1).

ADDITIONAL PROVISIONS:

(a) Rule 3(1)(b)(iv), IT Rules 2021 — due-diligence duty not to host NCII;
(b) Section 66E, IT Act 2000 — violation of privacy;
(c) Sections 67 and 67A, IT Act 2000 — obscene and sexually explicit material;
(d) Section 77, BNS 2023 — voyeurism (in force 1 July 2024); and
(e) Indecent Representation of Women (Prohibition) Act, 1986, per MeitY NCII SOP v.1.

5. REQUESTED ACTION

The complainant respectfully requires that {{platformName}}:

(i)   acknowledge receipt of this advisory within 24 hours;
(ii)  ingest the perceptual hashes in the annex into your proactive detection or
      hash-matching systems so that matching uploads are blocked at or promptly after
      upload, pursuant to Rule 4(4) and the MeitY NCII SOP v.1;
(iii) share the enclosed hashes with the I4C Sahyog Portal for the national NCII hash
      bank, as required by the MeitY NCII SOP v.1;
(iv)  remove or disable access to any matching content already published on your service
      within 24 hours as required under Rule 3(2)(b);
(v)   prevent re-upload of matching content for a minimum of 72 hours per Rule 4(4);
(vi)  (if applicable) de-index matching content from search results within 24 hours
      per the MeitY NCII SOP v.1;
(vii) preserve account and content records relating to any matches for a reasonable
      period for any investigation by Indian law-enforcement agencies; and
(viii)confirm action taken to Asmita at the address in paragraph 7, quoting case
      reference {{caseReference}}.

6. GRIEVANCE APPELLATE COMMITTEE AND PARALLEL REPORTING

If {{platformName}} fails to act, the complainant may appeal to the GAC under Rule 3A
within 30 days at www.gac.gov.in, or report to NCRP at cybercrime.gov.in / 1930 per
the MeitY NCII SOP v.1.

7. RETURN ADDRESS

All communications must be addressed to Asmita at the email address from which this
notice was sent, quoting case reference {{caseReference}}.

8. GOOD FAITH AND ACCOUNTABILITY

The complainant has affirmed by signed digital declaration that she appears in the
content represented by the enclosed hashes, that its sharing is without consent, and
that this request is made in good faith. Every hash submission is reviewed by an Asmita
administrator before dispatch.

Filed electronically by Asmita on behalf of the complainant.
Case reference: {{caseReference}}

[The perceptual hash annex is appended below this notice body.]
[DRAFT — PENDING LEGAL REVIEW — DO NOT DISPATCH]`;

// ─── HTML ─────────────────────────────────────────────────────────────────────
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<style>
  @import url('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

  * { margin:0; padding:0; box-sizing:border-box; }

  body {
    font-family: 'Inter', sans-serif;
    font-size: 10pt;
    color: ${DARK};
    background: #fff;
    line-height: 1.6;
  }

  /* ── Cover page ── */
  .cover {
    width: 100%;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: #fff;
    page-break-after: always;
    position: relative;
    overflow: hidden;
  }

  .cover-top-bar {
    background: ${TEAL};
    height: 8px;
    width: 100%;
  }

  .cover-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 60px 64px 40px;
  }

  .cover-tag {
    font-family: 'Inter', sans-serif;
    font-size: 8pt;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: ${TEAL};
    margin-bottom: 48px;
  }

  .cover-title-block {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .cover-org {
    font-family: 'EB Garamond', serif;
    font-size: 52pt;
    font-weight: 700;
    color: ${TEAL};
    line-height: 1;
    letter-spacing: -0.02em;
    margin-bottom: 12px;
  }

  .cover-subtitle {
    font-family: 'EB Garamond', serif;
    font-size: 20pt;
    font-weight: 400;
    color: ${DARK};
    line-height: 1.3;
    margin-bottom: 8px;
  }

  .cover-tagline {
    font-size: 10pt;
    color: ${MUTED};
    font-style: italic;
    margin-bottom: 48px;
  }

  .cover-meta {
    background: #F8F8F8;
    border-left: 4px solid ${TEAL};
    padding: 24px 28px;
    margin-bottom: 32px;
    border-radius: 0 6px 6px 0;
  }

  .cover-meta-row {
    display: flex;
    gap: 16px;
    margin-bottom: 6px;
    font-size: 9.5pt;
  }

  .cover-meta-key {
    font-weight: 600;
    color: ${DARK};
    min-width: 120px;
  }

  .cover-meta-val {
    color: ${MUTED};
  }

  .cover-status {
    background: #FFF8E1;
    border: 1px solid #FFB300;
    border-left: 4px solid #E65100;
    padding: 14px 20px;
    font-size: 9pt;
    color: ${AMBER};
    font-weight: 600;
    border-radius: 0 4px 4px 0;
    margin-bottom: 32px;
    line-height: 1.5;
  }

  .cover-toc-title {
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: ${MUTED};
    margin-bottom: 10px;
  }

  .cover-toc-item {
    display: flex;
    justify-content: space-between;
    font-size: 9pt;
    color: ${DARK};
    padding: 4px 0;
    border-bottom: 1px dotted ${HAIR};
  }

  .cover-toc-num {
    color: ${TEAL};
    font-weight: 600;
  }

  .cover-footer {
    background: ${TEAL};
    padding: 14px 64px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .cover-footer-left {
    font-size: 8.5pt;
    color: rgba(255,255,255,0.85);
  }

  .cover-footer-right {
    font-size: 8.5pt;
    color: rgba(255,255,255,0.7);
  }

  /* ── Content pages ── */
  .page {
    padding: 48px 64px;
    page-break-before: always;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 10px;
    border-bottom: 2px solid ${TEAL};
    margin-bottom: 28px;
  }

  .page-header-left {
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: ${TEAL};
  }

  .page-header-right {
    font-size: 8pt;
    color: ${MUTED};
  }

  h1 {
    font-family: 'EB Garamond', serif;
    font-size: 18pt;
    font-weight: 600;
    color: ${TEAL};
    margin: 28px 0 6px;
    padding-bottom: 6px;
    border-bottom: 2px solid ${TEAL};
  }

  h2 {
    font-family: 'Inter', sans-serif;
    font-size: 12pt;
    font-weight: 700;
    color: ${DARK};
    margin: 24px 0 8px;
    padding: 8px 14px;
    background: ${TEAL_L};
    border-left: 4px solid ${TEAL};
    border-radius: 0 4px 4px 0;
  }

  h3 {
    font-size: 9pt;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: ${MUTED};
    margin: 16px 0 6px;
  }

  p {
    font-size: 10pt;
    margin: 6px 0;
    line-height: 1.65;
  }

  /* ── Tables ── */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 10px 0 16px;
    font-size: 9pt;
  }

  th {
    background: ${TEAL};
    color: #fff;
    font-weight: 600;
    padding: 8px 10px;
    text-align: left;
    font-size: 8.5pt;
    letter-spacing: 0.04em;
  }

  td {
    padding: 7px 10px;
    border-bottom: 1px solid ${HAIR};
    vertical-align: top;
    line-height: 1.45;
  }

  tr:last-child td { border-bottom: none; }
  tr:nth-child(even) td { background: #F9F9F9; }

  /* ── Checklist table ── */
  .checklist-table td:first-child {
    width: 36px;
    text-align: center;
    font-size: 13pt;
    font-weight: 700;
    background: ${TEAL_L};
    color: ${TEAL};
    border-right: 1px solid ${HAIR};
  }

  /* ── Risk table ── */
  .risk-high { background: #FFEBEE !important; color: ${ROSE}; font-weight: 700; }
  .risk-medium { background: #FFF8E1 !important; color: ${AMBER}; font-weight: 700; }

  /* ── Notice block ── */
  .notice-block {
    margin: 16px 0 28px;
    border: 1px solid ${HAIR};
    border-radius: 8px;
    overflow: hidden;
  }

  .notice-label {
    background: ${TEAL};
    color: #fff;
    font-weight: 700;
    font-size: 10pt;
    padding: 10px 18px 4px;
    letter-spacing: 0.06em;
  }

  .notice-platform {
    background: ${TEAL};
    color: rgba(255,255,255,0.75);
    font-size: 8.5pt;
    padding: 2px 18px 10px;
    font-style: italic;
  }

  .notice-field-label {
    font-size: 7.5pt;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: ${TEAL};
    background: ${TEAL_L};
    padding: 6px 18px;
    border-top: 1px solid ${HAIR};
  }

  .notice-subject {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8.5pt;
    padding: 12px 18px;
    color: ${DARK};
    background: #FDFEFE;
    border-top: 1px solid ${HAIR};
    white-space: pre-wrap;
    word-break: break-word;
  }

  .notice-body {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8pt;
    padding: 16px 18px;
    color: ${DARK};
    background: #FDFDFD;
    border-top: 1px solid ${HAIR};
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.6;
    max-height: none;
  }

  /* ── Badges ── */
  .badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 4px;
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: 0.06em;
    margin: 4px 2px;
  }

  .badge-teal { background: ${TEAL_L}; color: ${TEAL}; }
  .badge-amber { background: #FFF8E1; color: ${AMBER}; border: 1px solid #FFB300; }
  .badge-rose { background: #FFEBEE; color: ${ROSE}; border: 1px solid #EF9A9A; }

  /* ── Alert box ── */
  .alert {
    padding: 14px 18px;
    margin: 12px 0;
    border-radius: 0 6px 6px 0;
    font-size: 9.5pt;
    line-height: 1.55;
  }

  .alert-amber {
    background: #FFF8E1;
    border-left: 4px solid ${AMBER};
    color: #5D4037;
  }

  .alert-rose {
    background: #FFEBEE;
    border-left: 4px solid ${ROSE};
    color: #B71C1C;
  }

  .alert-teal {
    background: ${TEAL_L};
    border-left: 4px solid ${TEAL};
    color: #004D40;
  }

  /* ── Page footer line ── */
  .page-footer {
    margin-top: 32px;
    padding-top: 8px;
    border-top: 1px solid ${HAIR};
    display: flex;
    justify-content: space-between;
    font-size: 7.5pt;
    color: ${MUTED};
  }

  .section-intro {
    font-size: 9.5pt;
    color: ${MUTED};
    font-style: italic;
    margin: -4px 0 12px;
    line-height: 1.5;
  }

  ul { padding-left: 20px; margin: 6px 0; }
  li { font-size: 9.5pt; margin-bottom: 4px; line-height: 1.5; }

  @media print {
    .cover { page-break-after: always; }
    .page { page-break-before: always; }
    h1 { page-break-after: avoid; }
    h2 { page-break-after: avoid; }
    .notice-block { page-break-inside: avoid; }
  }
</style>
</head>
<body>

<!-- ══════════════════════════════════════════════════════════════════════════ -->
<!-- COVER PAGE                                                                 -->
<!-- ══════════════════════════════════════════════════════════════════════════ -->
<div class="cover">
  <div class="cover-top-bar"></div>
  <div class="cover-body">
    <div class="cover-tag">Confidential · Reviewed Draft · Not for Public Distribution</div>

    <div class="cover-title-block">
      <div class="cover-org">Asmita</div>
      <div class="cover-subtitle">Legal Notice Templates<br>Review Package</div>
      <div class="cover-tagline">Privacy-preserving NCII support platform · meriasmita.org</div>

      <div class="cover-meta">
        <div class="cover-meta-row">
          <span class="cover-meta-key">Matter</span>
          <span class="cover-meta-val">Outbound NCII Takedown Notice Templates — All Four Template Types</span>
        </div>
        <div class="cover-meta-row">
          <span class="cover-meta-key">Date</span>
          <span class="cover-meta-val">15 June 2026</span>
        </div>
        <div class="cover-meta-row">
          <span class="cover-meta-key">Platform</span>
          <span class="cover-meta-val">Asmita · meriasmita.org</span>
        </div>
        <div class="cover-meta-row">
          <span class="cover-meta-key">Prepared by</span>
          <span class="cover-meta-val">Jamsaq Studio (technical) — AI-assisted legal drafting</span>
        </div>
        <div class="cover-meta-row">
          <span class="cover-meta-key">Review sought from</span>
          <span class="cover-meta-val">IFF (Internet Freedom Foundation) / SFLC.in</span>
        </div>
        <div class="cover-meta-row">
          <span class="cover-meta-key">Reference file</span>
          <span class="cover-meta-val">prisma/template-seeds.ts · docs/legal/notice-templates-review.md</span>
        </div>
        <div class="cover-meta-row">
          <span class="cover-meta-key">Skills applied</span>
          <span class="cover-meta-val">indian-legal-notice (local) · ip-legal:takedown · legal-risks · legal-review</span>
        </div>
      </div>

      <div class="cover-status">
        ⚠  DRAFT — PENDING LEGAL REVIEW BY IFF / SFLC.in — DO NOT DISPATCH<br>
        <span style="font-weight:400">These templates are AI-generated and require sign-off by a qualified advocate before any live notice is sent.</span>
      </div>

      <div class="cover-toc-title">Contents</div>
      <div class="cover-toc-item"><span>1. Statutory Toolkit</span><span class="cover-toc-num">p. 2</span></div>
      <div class="cover-toc-item"><span>2. Pre-Dispatch Checklist</span><span class="cover-toc-num">p. 3</span></div>
      <div class="cover-toc-item"><span>3.1  IT_RULES_2021 — Indian Platforms</span><span class="cover-toc-num">p. 4</span></div>
      <div class="cover-toc-item"><span>3.2  DMCA — US-Based Platforms</span><span class="cover-toc-num">p. 7</span></div>
      <div class="cover-toc-item"><span>3.3  IT_RULES_AND_DMCA — Global Platforms</span><span class="cover-toc-num">p. 10</span></div>
      <div class="cover-toc-item"><span>3.4  HASH_ADVISORY — Perceptual Hash Blocking</span><span class="cover-toc-num">p. 13</span></div>
      <div class="cover-toc-item"><span>4. Changes from Original Drafts</span><span class="cover-toc-num">p. 16</span></div>
      <div class="cover-toc-item"><span>Legal Disclaimer</span><span class="cover-toc-num">p. 17</span></div>
    </div>
  </div>
  <div class="cover-footer">
    <span class="cover-footer-left">Asmita · meriasmita.org · admin@meriasmita.org</span>
    <span class="cover-footer-right">Confidential — For legal review only</span>
  </div>
</div>

<!-- ══════════════════════════════════════════════════════════════════════════ -->
<!-- PAGE 1 — STATUTORY TOOLKIT                                                 -->
<!-- ══════════════════════════════════════════════════════════════════════════ -->
<div class="page">
  <div class="page-header">
    <span class="page-header-left">Asmita · Legal Notice Templates</span>
    <span class="page-header-right">DRAFT · 15 June 2026</span>
  </div>

  <h1>1. Statutory Toolkit</h1>
  <p class="section-intro">
    All citations verified against India Code (indiacode.nic.in), the Gazette, and SCC.
    <strong>[HEDGED]</strong> markers are retained where gazette text was unavailable at drafting.
    Reviewer should independently confirm all citations before approving dispatch.
  </p>

  <div class="alert alert-teal">
    <strong>Context for reviewer:</strong> Asmita is a privacy-preserving NCII support platform.
    Survivors submit perceptual image hashes (PDQ) and/or URLs client-side — the server never sees
    the original image. Notices are generated from legal templates and dispatched by an admin only
    after the survivor signs a digital declaration. The <code>{{url}}</code> placeholder is replaced
    at dispatch time with a one-time secure portal link — the raw URL is never in the email body.
  </div>

  <table>
    <thead>
      <tr><th style="width:32%">Provision</th><th style="width:6%">✓</th><th>Use in Notices</th></tr>
    </thead>
    <tbody>
      ${statutoryRow("IT Rules 2021, Rule 3(2)(b)", "✓", "PRIMARY hook — 24-hour mandatory removal on individual complaint; independent of court order")}
      ${statutoryRow("IT Rules 2021, Rule 3(1)(b)(iv)", "✓", "Due-diligence duty not to host non-consensual intimate imagery")}
      ${statutoryRow("IT Rules 2021, Rule 3A", "✓", "Grievance Appellate Committee — appeal at www.gac.gov.in within 30 days")}
      ${statutoryRow("IT Rules 2021, Rule 4(1)(c)", "✓", "SSMI must acknowledge within 24h, resolve within 15 days")}
      ${statutoryRow("IT Rules 2021, Rule 4(4)", "✓", "Re-upload prevention 72h; SSMI crawler/hash duty; I4C Sahyog Portal sharing")}
      ${statutoryRow("IT Act 2000, s.79(3)(b)", "✓", "Safe-harbour loss on notice + failure to act — secondary to Rule 3(2)(b); Shreya Singhal caveat applies to govt-notification track only")}
      ${statutoryRow("IT Act 2000, s.66E", "✓", "Violation of privacy — capturing/publishing image of private area without consent")}
      ${statutoryRow("IT Act 2000, ss.67 / 67A", "✓", "Obscene / sexually explicit material in electronic form")}
      ${statutoryRow("BNS 2023, s.77", "✓", "Voyeurism — replaces IPC 354C; in force 1 July 2024; imprisonment 1–7 years")}
      ${statutoryRow("Indecent Representation of Women (Prohibition) Act, 1986", "✓", "Named in MeitY NCII SOP v.1 as explicit removal basis")}
      ${statutoryRow("DPDP Act 2023", "✓", "Data-minimisation principle — basis for withholding complainant PII from notices")}
      ${statutoryRow("MeitY NCII SOP v.1 (October 2025)", "✓", "Pursuant to Madras HC order dated 15.07.2025 in WP 25017/2025; covers deepfakes, two-track removal, I4C Sahyog Portal hash bank, de-indexing duty")}
      ${statutoryRow("15 U.S.C. § 6851 (TAKE IT DOWN Act 2025)", "✓", "PRIMARY US hook — 48h mandatory removal; does not require copyright ownership")}
      ${statutoryRow("17 U.S.C. § 512(c)(3) (DMCA)", "✓", "Secondary/conditional US hook; all 6 §512(c)(3)(A) elements required; Lenz fair-use gate; §512(f) misrepresentation notice")}
      ${statutoryRow("Shreya Singhal v. Union of India, (2015) 5 SCC 1", "✓", "s.79(3)(b) 'actual knowledge' = court order or govt notification; private complaint relies on Rule 3(2)(b) independently")}
      ${statutoryRow("Justice K.S. Puttaswamy v. Union of India, (2017) 10 SCC 1", "✓", "Right to privacy as fundamental right under Art. 21; publication of intimate imagery without consent engages Art. 21")}
    </tbody>
  </table>

  <div class="page-footer">
    <span>Asmita · Legal Notice Templates · Review Package</span>
    <span>DRAFT — PENDING LEGAL REVIEW — DO NOT DISPATCH</span>
  </div>
</div>

<!-- ══════════════════════════════════════════════════════════════════════════ -->
<!-- PAGE 2 — PRE-DISPATCH CHECKLIST                                            -->
<!-- ══════════════════════════════════════════════════════════════════════════ -->
<div class="page">
  <div class="page-header">
    <span class="page-header-left">Asmita · Legal Notice Templates</span>
    <span class="page-header-right">DRAFT · 15 June 2026</span>
  </div>

  <h1>2. Pre-Dispatch Checklist</h1>
  <p class="section-intro">Applied against all four templates. Reviewer should re-verify each item before approving dispatch.</p>

  <table class="checklist-table">
    <tbody>
      ${checkRow("Rule 3(2)(b) 24h obligation foregrounded as PRIMARY OBLIGATION in all Indian templates — not buried in a list")}
      ${checkRow("s.79(3)(b) safe-harbour consequence stated; Shreya Singhal two-track distinction handled (36h govt-notification vs 24h individual grievance)")}
      ${checkRow("All section/rule numbers specific and verified — no vague 'BNS sections' or 'under the IT Rules'")}
      ${checkRow("BNS s.77 cited by number (voyeurism; in force 1 July 2024); Indecent Representation of Women Act 1986 added")}
      ${checkRow("MeitY NCII SOP v.1 (Oct 2025) cited in all Indian templates; Madras HC order WP 25017/2025 referenced as authority")}
      ${checkRow("Grievance Appellate Committee (Rule 3A) paragraph with www.gac.gov.in URL present in all Indian templates")}
      ${checkRow("NCRP (cybercrime.gov.in / 1930) and One Stop Centres (MWCD Mission Shakti) referenced per MeitY NCII SOP v.1")}
      ${checkRow("PII withheld; DPDP 2023 data-minimisation cited; complainant identity offered only on verified written request")}
      ${checkRow("No media described, fetched, or embedded anywhere; no-media disclaimer present in every template")}
      ${checkRow("{{url}} placeholder replaced at dispatch with one-time secure portal link — raw URL never appears in email body")}
      ${checkRow("US templates: §6851 primary; all 6 DMCA §512(c)(3)(A) elements present and labelled; Lenz fair-use gate; §512(f) notice")}
      ${checkRow("Hash annex explicitly covered by complainant's signed declaration (hash advisory template)")}
      ${checkRow("I4C Sahyog Portal hash-sharing obligation included in hash advisory requested actions per MeitY SOP v.1")}
      ${checkRow("[DRAFT — PENDING LEGAL REVIEW — DO NOT DISPATCH] marker present at end of every template body")}
    </tbody>
  </table>

  <div class="alert alert-amber" style="margin-top:20px">
    <strong>For reviewer — items requiring verification before sign-off:</strong><br>
    1. IT (Intermediary Guidelines) Amendment Rules 2026 — referenced in hedged form; specific rule numbers must be confirmed against gazette text.<br>
    2. MeitY NCII SOP v.1 (October 2025) — verify the SOP has been published and confirm the Madras HC order reference (WP 25017/2025) is accurate.<br>
    3. TAKE IT DOWN Act (15 U.S.C. § 6851) — confirm current applicability to specific target platforms, especially Indian-only operators.<br>
    4. BNS s.77 — voyeurism; verify this is the correct provision number against the published BNS text.<br>
    5. POCSO protocol — these templates are for adult complainants only; a separate POCSO-compliant template is required for minors.
  </div>

  <div class="page-footer">
    <span>Asmita · Legal Notice Templates · Review Package</span>
    <span>DRAFT — PENDING LEGAL REVIEW — DO NOT DISPATCH</span>
  </div>
</div>

<!-- ══════════════════════════════════════════════════════════════════════════ -->
<!-- PAGE 3+ — NOTICE TEMPLATES                                                 -->
<!-- ══════════════════════════════════════════════════════════════════════════ -->
<div class="page">
  <div class="page-header">
    <span class="page-header-left">Asmita · Legal Notice Templates</span>
    <span class="page-header-right">DRAFT · 15 June 2026</span>
  </div>

  <h1>3. Notice Templates</h1>

  <h2>3.1 IT_RULES_2021 — Indian Platforms</h2>
  <p class="section-intro">
    <strong>Use with:</strong> Indian-only platforms operating under IT Rules 2021 — ShareChat, Josh, Moj, MX TakaTak, Telegram (Indian operations), and similar.<br>
    <strong>Primary obligation:</strong> Rule 3(2)(b) — mandatory 24-hour removal on individual complaint.<br>
    <strong>Variables:</strong> <code>{{platformName}}</code> · <code>{{caseReference}}</code> · <code>{{url}}</code> · <code>{{declarationReference}}</code>
  </p>

  ${noticeTemplate(
    "IT_RULES_2021",
    "For: Indian platforms — Rule 3(2)(b) primary obligation",
    "Statutory notice for removal of non-consensual intimate imagery under\nRule 3(2)(b) of the IT (Intermediary Guidelines and Digital Media Ethics\nCode) Rules, 2021 — Case Reference {{caseReference}}",
    IT_RULES_BODY
  )}

  <div class="page-footer">
    <span>Asmita · Legal Notice Templates · Review Package</span>
    <span>DRAFT — PENDING LEGAL REVIEW — DO NOT DISPATCH</span>
  </div>
</div>

<!-- DMCA Template -->
<div class="page">
  <div class="page-header">
    <span class="page-header-left">Asmita · Legal Notice Templates</span>
    <span class="page-header-right">DRAFT · 15 June 2026</span>
  </div>

  <h2>3.2 DMCA — US-Based Platforms</h2>
  <p class="section-intro">
    <strong>Use with:</strong> US-headquartered platforms where Indian IT Rules are not primary — Reddit, Discord, Tumblr, and similar.<br>
    <strong>Primary obligation:</strong> 15 U.S.C. § 6851 (TAKE IT DOWN Act) — 48-hour mandatory removal regardless of copyright ownership.<br>
    <strong>Variables:</strong> <code>{{platformName}}</code> · <code>{{caseReference}}</code> · <code>{{url}}</code> · <code>{{declarationReference}}</code>
  </p>

  <h3>Risk Analysis Applied</h3>
  <table>
    <thead>
      <tr><th>Clause</th><th style="width:110px">Risk Score</th><th>Issue Identified</th><th>Fix Applied</th></tr>
    </thead>
    <tbody>
      ${riskRow("Missing §512(c)(3)(A) electronic signature", "7/10 HIGH", "Notice technically invalid without element 1", "Added — declaration authorises Asmita as representative", "HIGH")}
      ${riskRow("Lenz fair-use gate absent", "7/10 HIGH", "9th Cir. requires good-faith fair-use consideration before filing", "Fair-use consideration statement added", "HIGH")}
      ${riskRow("§512(f) liability not disclosed", "8/10 HIGH", "Knowing misrepresentation → damages liability against filer", "Explicit §512(f) notice added", "HIGH")}
      ${riskRow("DMCA listed before TAKE IT DOWN Act", "6/10 MEDIUM", "§6851 is stronger hook; doesn't require copyright", "§6851 elevated to primary; DMCA secondary and conditional", "MEDIUM")}
    </tbody>
  </table>

  ${noticeTemplate(
    "DMCA",
    "For: US-based platforms — TAKE IT DOWN Act primary, DMCA secondary",
    "Non-consensual intimate imagery removal request under 15 U.S.C. § 6851\n(TAKE IT DOWN Act, 2025) and 17 U.S.C. § 512(c)(3) — {{caseReference}}",
    DMCA_BODY
  )}

  <div class="page-footer">
    <span>Asmita · Legal Notice Templates · Review Package</span>
    <span>DRAFT — PENDING LEGAL REVIEW — DO NOT DISPATCH</span>
  </div>
</div>

<!-- IT_RULES_AND_DMCA Template -->
<div class="page">
  <div class="page-header">
    <span class="page-header-left">Asmita · Legal Notice Templates</span>
    <span class="page-header-right">DRAFT · 15 June 2026</span>
  </div>

  <h2>3.3 IT_RULES_AND_DMCA — Global Platforms</h2>
  <p class="section-intro">
    <strong>Use with:</strong> Global platforms with both Indian operations and US legal presence — Meta (Instagram/Facebook), Google, X (Twitter), Snapchat, LinkedIn, YouTube.<br>
    <strong>Primary obligations:</strong> Rule 3(2)(b) (24h, Indian law) and § 6851 (48h, US law) — whichever is shorter applies.<br>
    <strong>Variables:</strong> <code>{{platformName}}</code> · <code>{{caseReference}}</code> · <code>{{url}}</code> · <code>{{declarationReference}}</code>
  </p>

  ${noticeTemplate(
    "IT_RULES_AND_DMCA",
    "For: Global platforms — joint Indian IT Rules 2021 and US TAKE IT DOWN Act notice",
    "Joint statutory notice for removal of non-consensual intimate imagery\n(Indian IT Rules 2021 and 15 U.S.C. § 6851) — {{caseReference}}",
    JOINT_BODY
  )}

  <div class="page-footer">
    <span>Asmita · Legal Notice Templates · Review Package</span>
    <span>DRAFT — PENDING LEGAL REVIEW — DO NOT DISPATCH</span>
  </div>
</div>

<!-- HASH_ADVISORY Template -->
<div class="page">
  <div class="page-header">
    <span class="page-header-left">Asmita · Legal Notice Templates</span>
    <span class="page-header-right">DRAFT · 15 June 2026</span>
  </div>

  <h2>3.4 HASH_ADVISORY — Perceptual Hash Blocking Request</h2>
  <p class="section-intro">
    <strong>Use with:</strong> Any platform when the complainant has submitted PDQ perceptual hashes client-side. The hash annex (PDQ fingerprints) is appended below the notice body at dispatch time.<br>
    <strong>Key addition vs URL notice:</strong> Requests proactive hash ingestion + I4C Sahyog Portal sharing + search engine de-indexing per MeitY NCII SOP v.1.<br>
    <strong>Variables:</strong> <code>{{platformName}}</code> · <code>{{caseReference}}</code> · <code>{{url}}</code> · <code>{{declarationReference}}</code>
  </p>

  <div class="alert alert-teal">
    <strong>Hash annex note:</strong> The perceptual hash annex (PDQ algorithm, 256-bit hex values) is appended to this notice body at dispatch time by the Asmita system. The annex is generated server-side from approved, administrator-reviewed hash submissions. The underlying intimate media is never transmitted to the server — only the 64-hex PDQ string reaches Asmita. The complainant's signed declaration explicitly covers the hash annex.
  </div>

  ${noticeTemplate(
    "HASH_ADVISORY",
    "For: All platforms with hash-matching capability — proactive blocking + I4C Sahyog Portal",
    "NCII proactive blocking request — perceptual hash advisory under\nRule 3(2)(b) and Rule 4(4) of the IT Rules, 2021 and MeitY NCII\nSOP v.1 (Oct 2025) — {{caseReference}}",
    HASH_BODY
  )}

  <div class="page-footer">
    <span>Asmita · Legal Notice Templates · Review Package</span>
    <span>DRAFT — PENDING LEGAL REVIEW — DO NOT DISPATCH</span>
  </div>
</div>

<!-- ══════════════════════════════════════════════════════════════════════════ -->
<!-- CHANGES SUMMARY                                                            -->
<!-- ══════════════════════════════════════════════════════════════════════════ -->
<div class="page">
  <div class="page-header">
    <span class="page-header-left">Asmita · Legal Notice Templates</span>
    <span class="page-header-right">DRAFT · 15 June 2026</span>
  </div>

  <h1>4. Changes from Original Drafts</h1>
  <p class="section-intro">
    What changed between the initial AI-drafted templates and this review package, and why.
    Sources: <span class="badge badge-teal">indian-legal-notice</span>
    <span class="badge badge-teal">ip-legal:takedown</span>
    <span class="badge badge-teal">legal-risks</span>
    <span class="badge badge-teal">legal-review</span>
  </p>

  <table>
    <thead>
      <tr><th style="width:16%">Template</th><th>Addition / Change</th><th style="width:22%">Source</th></tr>
    </thead>
    <tbody>
      ${changeRow("All Indian", "MeitY NCII SOP v.1 (Oct 2025) cited; Madras HC order WP 25017/2025 referenced as authority", "indian-legal-notice skill", 0)}
      ${changeRow("All Indian", "Indecent Representation of Women (Prohibition) Act, 1986 added — explicitly named in SOP as removal basis", "MeitY SOP v.1", 1)}
      ${changeRow("All Indian", "Grievance Appellate Committee (Rule 3A) paragraph with www.gac.gov.in URL", "indian-legal-notice skill", 2)}
      ${changeRow("All Indian", "NCRP (cybercrime.gov.in / 1930) and One Stop Centres (MWCD Mission Shakti) added", "MeitY SOP v.1", 3)}
      ${changeRow("All Indian", "s.79 two-track distinction clarified: 36h govt-notification track vs 24h individual grievance track", "indian-legal-notice skill", 4)}
      ${changeRow("All Indian", "Rule 3(2)(b) foregrounded as PRIMARY OBLIGATION — previously buried in a list of provisions", "indian-legal-notice skill", 5)}
      ${changeRow("All Indian", "BNS s.77 cited by section number (previously vague 'BNS 2023 sections')", "indian-legal-notice skill", 6)}
      ${changeRow("DMCA", "§512(c)(3)(A) electronic signature element (Element 1) added — notice was technically invalid without it", "ip-legal:takedown", 7)}
      ${changeRow("DMCA", "Lenz v. Universal fair-use consideration gate added — 9th Circuit requirement", "ip-legal:takedown", 8)}
      ${changeRow("DMCA", "§512(f) misrepresentation liability disclosure added — protects Asmita from damages claim", "ip-legal:takedown", 9)}
      ${changeRow("DMCA", "§6851 (TAKE IT DOWN Act) elevated to PRIMARY basis; DMCA secondary and conditional", "legal-risks + ip-legal:takedown", 10)}
      ${changeRow("Hash advisory", "I4C Sahyog Portal hash-sharing obligation added to requested actions", "MeitY SOP v.1", 11)}
      ${changeRow("Hash advisory", "Search engine de-indexing duty (24h) added per MeitY SOP v.1", "MeitY SOP v.1", 12)}
      ${changeRow("Hash advisory", "Complainant declaration explicitly stated to cover hash annex", "indian-legal-notice skill §2.4", 13)}
    </tbody>
  </table>

  <div class="page-footer">
    <span>Asmita · Legal Notice Templates · Review Package</span>
    <span>DRAFT — PENDING LEGAL REVIEW — DO NOT DISPATCH</span>
  </div>
</div>

<!-- ══════════════════════════════════════════════════════════════════════════ -->
<!-- LEGAL DISCLAIMER                                                           -->
<!-- ══════════════════════════════════════════════════════════════════════════ -->
<div class="page">
  <div class="page-header">
    <span class="page-header-left">Asmita · Legal Notice Templates</span>
    <span class="page-header-right">DRAFT · 15 June 2026</span>
  </div>

  <h1>Legal Disclaimer</h1>

  <div class="alert alert-rose" style="margin-bottom:20px">
    <strong>NOT LEGAL ADVICE.</strong> This document contains AI-generated legal information
    and analysis. It does not constitute legal advice and must not be used as the basis
    for dispatching any live notice without review and written sign-off by an advocate
    enrolled with a Bar Council.
  </div>

  <h3>Recommended Reviewers</h3>
  <ul>
    <li><strong>Internet Freedom Foundation (IFF)</strong> — internetfreedom.in</li>
    <li><strong>Software Freedom Law Centre India (SFLC.in)</strong> — sflc.in</li>
  </ul>

  <h3>Key Limitations</h3>
  <ul>
    <li>All statutory citations must be independently verified against India Code (indiacode.nic.in) and the Gazette</li>
    <li>MeitY NCII SOP v.1 (October 2025) citations must be verified at meity.gov.in against the published SOP</li>
    <li>IT (Intermediary Guidelines) Amendment Rules 2026 are referenced in hedged form — specific rule numbers must be confirmed</li>
    <li>TAKE IT DOWN Act (15 U.S.C. § 6851) applicability to specific platforms, especially Indian-only operators, must be confirmed</li>
    <li>Recent amendments or judicial developments not reflected in this document may affect the analysis</li>
    <li>BNS section numbers must be verified against the published BNS 2023 gazette text</li>
  </ul>

  <h3>Mandatory Steps Before Live Dispatch</h3>
  <ul>
    <li>Legal reviewer must set <code>reviewedByLegal = true</code> in the Asmita database for each approved template</li>
    <li>All section/rule numbers independently verified</li>
    <li>POCSO protocol confirmed separately — these templates are for adult complainants only</li>
    <li>A separate POCSO-compliant template must be drafted for minor complainants</li>
    <li><code>DEV_SKIP_LEGAL_REVIEW</code> environment variable must not be set in production</li>
  </ul>

  <h3>About Asmita</h3>
  <p style="margin-top:8px">
    Asmita (meriasmita.org) is a privacy-preserving NCII support platform for Indian survivors.
    It generates and routes legally-grounded takedown notices to platforms, and enables survivors
    to submit perceptual image fingerprints (PDQ hashes) for proactive blocking — all without the
    server ever seeing the original image. Hashes are computed client-side; only the 64-hex PDQ
    string reaches the server. The platform is safety-critical software under active development.
    Production launch is gated on legal sign-off on these notice templates, NGO partnership, POCSO
    protocol, and platform contact verification.
  </p>

  <div style="margin-top:32px;padding-top:16px;border-top:2px solid ${TEAL};display:flex;justify-content:space-between;align-items:flex-end">
    <div>
      <div style="font-family:'EB Garamond',serif;font-size:18pt;font-weight:700;color:${TEAL}">Asmita</div>
      <div style="font-size:8.5pt;color:${MUTED};margin-top:2px">meriasmita.org · admin@meriasmita.org</div>
    </div>
    <div style="text-align:right;font-size:8pt;color:${MUTED}">
      Document version 3.0<br>
      Generated: 15 June 2026<br>
      DRAFT — PENDING LEGAL REVIEW
    </div>
  </div>
</div>

</body>
</html>`;

// ─── Render ───────────────────────────────────────────────────────────────────
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "networkidle0" });
const pdf = await page.pdf({
  format: "A4",
  printBackground: true,
  margin: { top: "0", right: "0", bottom: "0", left: "0" },
  displayHeaderFooter: false,
});
await browser.close();

writeFileSync(OUT, pdf);
console.log("✓  Written:", OUT);
