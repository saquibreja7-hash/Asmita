import {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  BorderStyle, UnderlineType,
  WidthType, Table, TableRow, TableCell,
} from "docx";
import { writeFileSync } from "fs";

const OUT =
  "C:/Users/Media/Desktop/Personal/01-Projects/Asmita/asmita/docs/legal/Asmita-Legal-Notices-Plain.docx";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FONT = "Times New Roman";
const SIZE = 24; // 12pt in half-points
const SIZE_SM = 20; // 10pt

const run = (text, opts = {}) =>
  new TextRun({ text, font: FONT, size: SIZE, ...opts });

const para = (children, opts = {}) =>
  new Paragraph({
    children: Array.isArray(children) ? children : [run(children)],
    spacing: { after: 160 },
    ...opts,
  });

const blank = () =>
  new Paragraph({ children: [run("")], spacing: { after: 80 } });

const heading = (text) =>
  new Paragraph({
    children: [run(text, { bold: true, underline: { type: UnderlineType.SINGLE } })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 400, after: 240 },
  });

const subheading = (text) =>
  new Paragraph({
    children: [run(text, { bold: true, underline: { type: UnderlineType.SINGLE } })],
    spacing: { before: 280, after: 120 },
  });

const boldPara = (label, value) =>
  new Paragraph({
    children: [run(label, { bold: true }), run(value)],
    spacing: { after: 100 },
  });

const centered = (text, opts = {}) =>
  new Paragraph({
    children: [run(text, opts)],
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
  });

const indent = (text) =>
  new Paragraph({
    children: [run(text)],
    indent: { left: 720 },
    spacing: { after: 120 },
  });

const pb = () =>
  new Paragraph({ children: [run("")], pageBreakBefore: true });

// A simple two-column info table (label | value) for letterhead-style blocks
const infoRow = (label, value) =>
  new TableRow({
    children: [
      new TableCell({
        children: [new Paragraph({ children: [run(label, { bold: true, size: SIZE_SM })], spacing: { after: 40 } })],
        width: { size: 25, type: WidthType.PERCENTAGE },
        borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
      }),
      new TableCell({
        children: [new Paragraph({ children: [run(value, { size: SIZE_SM })], spacing: { after: 40 } })],
        width: { size: 75, type: WidthType.PERCENTAGE },
        borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
      }),
    ],
  });

const infoTable = (rows) =>
  new Table({
    rows: rows.map(([k, v]) => infoRow(k, v)),
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideH: { style: BorderStyle.NONE }, insideV: { style: BorderStyle.NONE } },
  });

// Horizontal rule
const rule = () =>
  new Paragraph({
    children: [run("")],
    border: { bottom: { color: "000000", space: 1, style: BorderStyle.SINGLE, size: 6 } },
    spacing: { after: 160 },
  });

// ─── Notice builder ──────────────────────────────────────────────────────────
// Each call returns an array of OOXML elements (the section for one template)

function buildNotice({ title, useWith, modeOfService, toBlock, refNo, subject, body }) {
  const bodyParas = body.trim().split("\n").map((line) => {
    const trimmed = line.trim();

    // Section headers like "1. FILING PARTY" — bold centred
    if (/^\d+\.\s+[A-Z\s\/()&–—-]+$/.test(trimmed) && trimmed.length < 80) {
      return new Paragraph({
        children: [run(trimmed, { bold: true })],
        spacing: { before: 240, after: 100 },
      });
    }
    // ALL-CAPS sub-headings (e.g. "PRIMARY OBLIGATION —")
    if (/^[A-Z][A-Z\s\/()§§–—,:0-9-]+:/.test(trimmed) && trimmed.length < 120) {
      return new Paragraph({
        children: [run(trimmed, { bold: true, underline: { type: UnderlineType.SINGLE } })],
        spacing: { before: 200, after: 80 },
      });
    }
    // Lettered sub-items: (a) (b) ...
    if (/^\([a-z]+\)/.test(trimmed)) {
      return new Paragraph({
        children: [run(trimmed)],
        indent: { left: 720 },
        spacing: { after: 80 },
      });
    }
    // Numbered sub-items: (i) (ii) ...
    if (/^\([ivxlc]+\)/.test(trimmed)) {
      return new Paragraph({
        children: [run(trimmed)],
        indent: { left: 720 },
        spacing: { after: 80 },
      });
    }
    // Draft marker
    if (/^\[DRAFT/.test(trimmed)) {
      return new Paragraph({
        children: [run(trimmed, { bold: true, italics: true })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 80 },
      });
    }
    // Blank line
    if (!trimmed) return blank();
    // Normal paragraph
    return new Paragraph({
      children: [run(line)],
      spacing: { after: 120 },
    });
  });

  return [
    pb(),

    // Template title banner
    new Paragraph({
      children: [run(`TEMPLATE: ${title}`, { bold: true, size: SIZE_SM })],
      alignment: AlignmentType.RIGHT,
      spacing: { after: 80 },
    }),

    // Use-with note
    new Paragraph({
      children: [run("USE WITH: ", { bold: true, size: SIZE_SM }), run(useWith, { size: SIZE_SM, italics: true })],
      spacing: { after: 80 },
    }),

    rule(),

    // Sender letterhead
    new Paragraph({
      children: [run("ASMITA", { bold: true, size: 28 })],
      spacing: { after: 60 },
    }),
    new Paragraph({
      children: [run("A Public Interest Platform for NCII Survivors", { italics: true, size: SIZE_SM })],
      spacing: { after: 60 },
    }),
    new Paragraph({
      children: [run("meriasmita.org  |  Notice@meriasmita.org", { size: SIZE_SM })],
      spacing: { after: 60 },
    }),

    rule(),

    // Mode of service / date / ref
    blank(),
    boldPara("Date: ", "15 June 2026"),
    boldPara("Mode of Service: ", modeOfService),
    boldPara("Our Reference: ", refNo),
    blank(),

    // Addressee block
    subheading("TO:"),
    ...toBlock.map((line) => new Paragraph({ children: [run(line)], spacing: { after: 60 } })),
    blank(),

    // LEGAL NOTICE heading
    heading("LEGAL NOTICE"),
    boldPara("Subject: ", subject),
    blank(),

    // Notice body
    ...bodyParas,

    // Signature block
    blank(),
    blank(),
    para("_________________________________"),
    para("Authorised Signatory, Asmita"),
    para("meriasmita.org | Notice@meriasmita.org"),
    blank(),

    // Advocate sign-off block (blank — for reviewing advocate to complete)
    rule(),
    new Paragraph({
      children: [run("FOR LEGAL REVIEW — ADVOCATE SIGN-OFF BLOCK", { bold: true, size: SIZE_SM })],
      spacing: { after: 80 },
    }),
    new Paragraph({
      children: [run("(To be completed by the reviewing advocate before this template is approved for live dispatch.)", { italics: true, size: SIZE_SM })],
      spacing: { after: 120 },
    }),
    boldPara("Advocate's Name: ", "________________________"),
    boldPara("Enrolment No.: ", "________________________"),
    boldPara("Bar Council: ", "________________________"),
    boldPara("Date of Review: ", "________________________"),
    boldPara("Approved for Dispatch: ", "[ ] YES    [ ] NO    [ ] APPROVED WITH AMENDMENTS"),
    rule(),
  ];
}

// ─── Notice bodies ────────────────────────────────────────────────────────────

const IT_RULES_BODY = `
This Legal Notice is issued by ASMITA (meriasmita.org), a public-interest platform that facilitates the submission of statutory takedown notices for non-consensual intimate imagery (NCII) on behalf of adult residents of India. Asmita acts as the technical facilitating intermediary and authorised representative of the Complainant by virtue of a signed digital declaration executed by the Complainant, a copy of which is retained by Asmita in encrypted storage and is available for inspection by your Resident Grievance Officer upon a verified written request.

1. PARTIES

1.1  ISSUING PARTY: Asmita (meriasmita.org), acting as the authorised representative of the Complainant.

1.2  COMPLAINANT: The Complainant is a verified adult resident of India who has executed a signed digital declaration affirming all material facts set out in this Notice. The Complainant's identity is withheld from this Notice in accordance with the data-minimisation principle under the Digital Personal Data Protection Act, 2023, and to prevent further exposure of the survivor. Full identifying details will be furnished to your Resident Grievance Officer upon a verified written request from your platform, addressed to Notice@meriasmita.org and quoting the case reference at paragraph 2 below.

1.3  NOTICEE: {{platformName}}, an intermediary as defined under Section 2(1)(w) of the Information Technology Act, 2000 (hereinafter "the Noticee" or "your platform").

2. CASE REFERENCE AND CONTENT

Asmita Case Reference: {{caseReference}}
Complainant Declaration Reference: {{declarationReference}}
Secure Content Locator: {{url}}

The Secure Content Locator above is a one-time secure portal link generated by Asmita's platform. It is provided solely to enable your Resident Grievance Officer and moderation team to identify the specific content on your service. Asmita has at no point retrieved, viewed, downloaded, stored, or processed the intimate content itself. The Complainant computed and submitted the content identifier client-side. No intimate media has been transmitted to or stored on Asmita's servers.

3. NATURE AND SUBSTANCE OF THE COMPLAINT

3.1  The Complainant states, upon a signed digital declaration executed voluntarily and without duress, that the content accessible via the Secure Content Locator identified at paragraph 2:

(a)  depicts or purports to depict the Complainant in an intimate or private context, including but not limited to nudity or a sexual act;

(b)  was captured, created, or obtained without the free and informed consent of the Complainant, or was originally obtained with consent but is being shared or published without the Complainant's consent and beyond the scope of any consent originally given;

(c)  constitutes "non-consensual intimate imagery" within the meaning of Rule 3(1)(b)(iv) of the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021; and

(d)  has been published, hosted, stored, transmitted, or made accessible on the Noticee's platform or service without the Complainant's consent and to her severe detriment, causing her continuing distress, reputational harm, and violation of her right to privacy as a fundamental right guaranteed under Article 21 of the Constitution of India, as affirmed by the Supreme Court of India in Justice K.S. Puttaswamy (Retd.) v. Union of India, (2017) 10 SCC 1.

3.2  The Complainant is the person depicted in the said content, or the authorised representative of such person, for the purposes of Rule 3(2)(b) of the IT Rules, 2021.

4. LEGAL BASIS FOR THIS NOTICE

4.1  PRIMARY OBLIGATION — MANDATORY 24-HOUR REMOVAL (RULE 3(2)(b)):

Rule 3(2)(b) of the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021 ("the IT Rules") imposes a mandatory obligation upon every significant social media intermediary and intermediary to which the said Rule applies to remove or disable access to any content that depicts "any individual in an act of sexual intercourse, non-consensual acts, or any other content which is demeaning of women or minors," upon receipt of a complaint from the affected individual. The Noticee is obliged to remove or disable access to the content identified at paragraph 2 within TWENTY-FOUR (24) HOURS of receipt of this Notice. This obligation is mandatory, automatic upon receipt of a valid complaint, and does not depend upon any court order, government direction, or further communication from the Complainant or Asmita.

This Notice is further issued in accordance with and pursuant to the Ministry of Electronics and Information Technology (MeitY) NCII Standard Operating Procedure Version 1 (October 2025), issued in compliance with the order of the Hon'ble Madras High Court dated 15 July 2025 in W.P. No. 25017 of 2025, which mandates a two-track removal process for non-consensual intimate imagery including artificially generated, morphed, and deepfake intimate content, and expressly applies the 24-hour removal track under Rule 3(2)(b) to such content.

4.2  DUTY NOT TO HOST NON-CONSENSUAL INTIMATE IMAGERY (RULE 3(1)(b)(iv)):

Rule 3(1)(b)(iv) of the IT Rules, 2021 requires every intermediary to publish its rules and regulations, privacy policy, and user agreement informing users not to host, display, upload, modify, publish, transmit, store, update, or share any information that is invasive of another's bodily privacy, depicts a person in a private setting without their consent, or constitutes non-consensual intimate imagery. The hosting of the content identified at paragraph 2 on the Noticee's platform constitutes a failure of the due-diligence obligation under this rule.

4.3  SAFE HARBOUR CONSEQUENCE (SECTION 79, IT ACT 2000):

Section 79(1) of the Information Technology Act, 2000 ("the IT Act") provides that an intermediary shall not be liable for any third-party information, data, or communication hosted by it. However, Section 79(3)(b) of the IT Act provides that this exemption shall not apply if the intermediary, upon receiving actual knowledge or on being notified by the appropriate Government or its agency that any information, data, or communication link residing in or connected to a computer resource controlled by it is being used to commit an unlawful act, fails to expeditiously remove or disable access to that material. This Notice, read together with Rule 3(2)(b) of the IT Rules, constitutes such notification. Upon receipt of this Notice, the Noticee's exemption from liability under Section 79(1) is at risk if it fails to act within the prescribed 24-hour period. [Note: Shreya Singhal v. Union of India, (2015) 5 SCC 1 holds that the "actual knowledge" route under s.79(3)(b) requires a court order or government notification for the purpose of intermediary liability; the Rule 3(2)(b) individual grievance track operates independently of this requirement as a self-standing statutory obligation.]

4.4  RE-UPLOAD PREVENTION (RULE 4(4)):

Rule 4(4) of the IT Rules, 2021 requires every significant social media intermediary to deploy automated tools or technology to proactively identify and prevent the re-upload or re-publication of content that has been removed pursuant to a valid complaint. The Noticee is accordingly required to prevent the re-upload of the content identified at paragraph 2 for a minimum period of SEVENTY-TWO (72) HOURS from the time of removal.

4.5  ADDITIONAL PROVISIONS:

(a)  Section 66E of the IT Act, 2000: The publication or transmission of any image of a private area of a person without such person's consent constitutes an offence of violation of privacy, punishable with imprisonment up to three years or a fine up to two lakh rupees, or both.

(b)  Sections 67 and 67A of the IT Act, 2000: Publishing or transmitting obscene material or sexually explicit material in electronic form constitutes criminal offences under the IT Act.

(c)  Section 77 of the Bharatiya Nyaya Sanhita, 2023 (BNS): Voyeurism — capturing or disseminating images of a woman in a private act without her consent — is an offence punishable with imprisonment for a period not less than one year, which may extend to seven years, and a fine. The BNS is in force with effect from 1 July 2024.

(d)  Section 4 of the Indecent Representation of Women (Prohibition) Act, 1986: Publication or sending by post, causing to be published or sent by post, any material containing indecent representation of women is prohibited and constitutes an offence. This Act is expressly named by the MeitY NCII SOP v.1 (October 2025) as a basis for NCII removal demands.

5. GRIEVANCE ACKNOWLEDGEMENT OBLIGATION (RULE 4(1)(c)):

Rule 4(1)(c) of the IT Rules, 2021 requires every significant social media intermediary to acknowledge any complaint received from a user within TWENTY-FOUR (24) HOURS of receipt. The Noticee is accordingly required to acknowledge receipt of this Notice within 24 hours by way of a written communication addressed to Asmita at Notice@meriasmita.org, quoting the Asmita case reference at paragraph 2 above.

6. DEMAND

IN VIEW OF THE ABOVE, the Complainant, through Asmita as her authorised representative, CALLS UPON AND REQUIRES the Noticee to:

(i)   ACKNOWLEDGE receipt of this Notice in writing within TWENTY-FOUR (24) HOURS of receipt, addressed to Asmita at Notice@meriasmita.org, quoting the Asmita case reference at paragraph 2;

(ii)  REMOVE or DISABLE ACCESS to the content identified at paragraph 2 within TWENTY-FOUR (24) HOURS of receipt of this Notice, as required under Rule 3(2)(b) of the IT Rules, 2021;

(iii) PREVENT RE-UPLOAD or re-publication of the same or substantially similar content for a minimum period of SEVENTY-TWO (72) HOURS following removal, as required under Rule 4(4) of the IT Rules, 2021;

(iv)  PRESERVE all account records, metadata, upload logs, IP address records, and any other data associated with the content identified at paragraph 2, for a minimum period of one hundred and eighty (180) days, for potential use in any investigation by Indian law-enforcement agencies; and

(v)   CONFIRM the actions taken in compliance with this Notice to Asmita at Notice@meriasmita.org within TWENTY-FOUR (24) HOURS of such actions, quoting the Asmita case reference at paragraph 2.

7. CONSEQUENCES OF NON-COMPLIANCE

TAKE FURTHER NOTICE THAT:

7.1  Failure to comply with the obligation under Rule 3(2)(b) within the 24-hour period will result in the Noticee losing the benefit of safe-harbour protection under Section 79(1) of the IT Act, 2000, as provided under Section 79(3)(b) of the said Act. The Noticee shall thereupon become directly liable for all harm and damage occasioned by the continued hosting of the unlawful content on its platform.

7.2  The Complainant, through Asmita, shall without further notice report non-compliance to the Ministry of Electronics and Information Technology and take recourse to the following remedies:

(a)  Appeal to the Grievance Appellate Committee constituted under Rule 3A of the IT Rules, 2021, within thirty (30) days of the expiry of the resolution period, at www.gac.gov.in;

(b)  Filing a complaint with the National Cybercrime Reporting Portal at cybercrime.gov.in, or by calling the national cybercrime helpline at 1930, in accordance with the MeitY NCII SOP v.1 (October 2025); and

(c)  Approaching One Stop Centres under the MWCD Mission Shakti scheme and other appropriate authorities, as prescribed under the MeitY NCII SOP v.1 (October 2025).

7.3  Asmita reserves the right to assist the Complainant in seeking all civil, criminal, and regulatory remedies available under Indian law, including but not limited to the remedies referred to in paragraph 7.2 above.

8. RETURN ADDRESS

ALL COMMUNICATIONS in response to this Notice must be addressed to Asmita at Notice@meriasmita.org, quoting the Asmita case reference set out at paragraph 2 above. Communications addressed elsewhere will not be treated as valid responses for the purpose of this Notice.

9. DECLARATION

The Complainant has executed a digital declaration voluntarily and without duress, affirming all material facts set out in this Notice, confirming the complaint is made in good faith and to the best of her knowledge and belief, and authorising Asmita to issue this Notice on her behalf. The declaration is retained by Asmita in encrypted storage and is available for inspection by the Noticee's Resident Grievance Officer upon a verified written request.

This Notice is issued without prejudice to any other rights or remedies available to the Complainant under Indian law.

[DRAFT — PENDING LEGAL REVIEW — DO NOT DISPATCH]
`;

const DMCA_BODY = `
This Legal Notice is issued by ASMITA (meriasmita.org), a public-interest platform that facilitates the submission of statutory takedown notices for non-consensual intimate imagery (NCII) on behalf of adult residents of India. Asmita acts as the technical facilitating intermediary and authorised representative of the Complainant by virtue of a signed digital declaration executed by the Complainant, a copy of which is retained by Asmita in encrypted storage and is available for inspection by your Designated Agent upon a verified written request.

1. PARTIES

1.1  ISSUING PARTY: Asmita (meriasmita.org), acting as the authorised representative of the Complainant.

1.2  COMPLAINANT: The Complainant is a verified adult person who has executed a signed digital declaration affirming all material facts set out in this Notice. The Complainant's identity is withheld from this Notice for safety reasons and will be furnished to your Designated Agent upon a verified written request addressed to Notice@meriasmita.org, quoting the case reference at paragraph 2.

1.3  NOTICEE: {{platformName}}, the operator of the online service on which the content identified below is hosted (hereinafter "the Noticee").

2. CASE REFERENCE AND CONTENT

Asmita Case Reference: {{caseReference}}
Complainant Declaration Reference: {{declarationReference}}
Secure Content Locator: {{url}}

The Secure Content Locator above is a one-time secure portal link generated by Asmita's platform and is provided solely to enable your Designated Agent to identify the specific content on your service. Asmita has at no point retrieved, viewed, downloaded, stored, or processed the intimate content itself.

3. PRIMARY BASIS: 15 U.S.C. § 6851 — TAKE IT DOWN ACT (2025)

3.1  This Notice is a valid notification under the Tools to Address Known Exploitation by Immobilizing Technological Deepfakes on Websites and Networks Act of 2025 (the "TAKE IT DOWN Act"), codified at 15 U.S.C. § 6851. This Act creates a mandatory obligation upon covered platforms to remove or disable access to identified non-consensual intimate visual depictions within FORTY-EIGHT (48) HOURS of receipt of a valid notification. This obligation applies regardless of whether the Complainant holds copyright ownership in the depicted work.

3.2  The Complainant states that:

(a)  the content identified at paragraph 2 is a non-consensual intimate visual depiction of the Complainant within the meaning of 15 U.S.C. § 6851(a)(3);

(b)  the Complainant has not consented to the publication, transmission, hosting, or making available of such content on the Noticee's service; and

(c)  the Complainant is the identifiable person depicted in the said content, or is the authorised representative of such person.

3.3  Under 15 U.S.C. § 6851(b)(1), the Noticee is required to remove or disable access to the content identified at paragraph 2 within FORTY-EIGHT (48) HOURS of receipt of this notification.

4. SECONDARY BASIS: 17 U.S.C. § 512(c)(3) — DIGITAL MILLENNIUM COPYRIGHT ACT

4.1  This Notice additionally constitutes a takedown notification under Section 512(c)(3) of the Digital Millennium Copyright Act ("DMCA"), 17 U.S.C. § 512(c)(3), to the extent the Complainant retains copyright in the depicted work, and is issued without prejudice to the primary basis under the TAKE IT DOWN Act at paragraph 3 above.

4.2  The following six elements required under 17 U.S.C. § 512(c)(3)(A) are satisfied:

ELEMENT 1 — ELECTRONIC SIGNATURE [§ 512(c)(3)(A)(i)]:
This Notice is submitted electronically by Asmita on behalf of the Complainant. The Complainant's signed digital declaration (reference: {{declarationReference}}) constitutes her authorisation of Asmita to act as her representative for the purpose of this notification, and Asmita's submission of this Notice on her behalf serves as the authorised electronic signature.

ELEMENT 2 — IDENTIFICATION OF COPYRIGHTED WORK [§ 512(c)(3)(A)(ii)]:
The copyrighted work is the intimate image or video in which the Complainant appears, in which the Complainant holds copyright as the subject depicted and, where applicable, as the original author or in which moral rights vest.

ELEMENT 3 — IDENTIFICATION OF INFRINGING MATERIAL [§ 512(c)(3)(A)(iii)]:
The infringing material is identified at paragraph 2 above by way of the Secure Content Locator. The Complainant has provided sufficient information to enable the Noticee's Designated Agent to locate the material on the Noticee's service.

ELEMENT 4 — CONTACT INFORMATION [§ 512(c)(3)(A)(iv)]:
The authorised representative through which the Complainant may be contacted is Asmita at Notice@meriasmita.org. The Complainant's personal contact details will be furnished to the Noticee's Designated Agent upon a verified written request.

ELEMENT 5 — GOOD-FAITH BELIEF [§ 512(c)(3)(A)(v)]:
The Complainant has a good-faith belief that the use of the content identified at paragraph 2 on the Noticee's service is not authorised by the copyright owner, its agent, or the law. In reaching this belief, the Complainant has considered, in good faith and as required under Lenz v. Universal Music Corp., 801 F.3d 1126 (9th Cir. 2015), whether the use of the material might constitute fair use within the meaning of 17 U.S.C. § 107. The Complainant concludes that the non-consensual, intimate, and identifying nature of the material, and the absence of any transformative, commentary, educational, or other qualifying purpose, means that the fair-use doctrine does not apply to such use.

ELEMENT 6 — ACCURACY AND AUTHORITY [§ 512(c)(3)(A)(vi)]:
The information in this notification is accurate. Under penalty of perjury under the laws of the United States of America, the Complainant affirms that she is the owner of the right claimed or is authorised to act on behalf of the owner of an exclusive right that is allegedly infringed.

4.3  SECTION 512(f) NOTICE: Under 17 U.S.C. § 512(f), any person who knowingly materially misrepresents that material or activity is infringing may be liable for any damages, including costs and attorneys' fees, incurred by the alleged infringer, by any copyright owner, or by the service provider. This Notice is filed in good faith on the basis of the Complainant's verified declaration and the Complainant's genuine belief that the material is unlawfully posted on the Noticee's service.

5. DEMAND

IN VIEW OF THE ABOVE, the Complainant, through Asmita as her authorised representative, CALLS UPON AND REQUIRES the Noticee to:

(i)   REMOVE or DISABLE ACCESS to the content identified at paragraph 2 within FORTY-EIGHT (48) HOURS of receipt of this Notice, as required under 15 U.S.C. § 6851(b)(1);

(ii)  PREVENT RE-UPLOAD or re-publication of the same or substantially similar content on the Noticee's service following removal;

(iii) PRESERVE all account records, metadata, upload logs, IP address records, and any other data associated with the content identified at paragraph 2 for a period of not less than one hundred and eighty (180) days, for potential use in any investigation by competent authorities; and

(iv)  CONFIRM the actions taken in compliance with this Notice to Asmita at Notice@meriasmita.org within FORTY-EIGHT (48) HOURS of such actions, quoting the Asmita case reference at paragraph 2.

6. CONSEQUENCES OF NON-COMPLIANCE

TAKE FURTHER NOTICE THAT:

6.1  Failure to comply with the obligation under 15 U.S.C. § 6851(b)(1) within the 48-hour period may expose the Noticee to liability under the TAKE IT DOWN Act and applicable regulations.

6.2  Failure to act upon a valid DMCA notification may result in the Noticee losing the safe-harbour protection under 17 U.S.C. § 512(c), exposing the Noticee to direct copyright infringement liability.

6.3  The Complainant, through Asmita, reserves the right to seek all available civil, criminal, and regulatory remedies including but not limited to claims for damages, injunctive relief, and regulatory complaints.

7. RETURN ADDRESS

ALL COMMUNICATIONS in response to this Notice must be addressed to Asmita at Notice@meriasmita.org, quoting the Asmita case reference at paragraph 2 above.

8. DECLARATION

The Complainant has executed a digital declaration voluntarily and without duress, affirming all material facts set out in this Notice, confirming this notice is made in good faith and to the best of her knowledge and belief, and authorising Asmita to issue this Notice on her behalf. The declaration is available for inspection by the Noticee's Designated Agent upon a verified written request.

This Notice is issued without prejudice to any other rights or remedies available to the Complainant.

[DRAFT — PENDING LEGAL REVIEW — DO NOT DISPATCH]
`;

const JOINT_BODY = `
This Legal Notice is issued by ASMITA (meriasmita.org), a public-interest platform that facilitates the submission of statutory takedown notices for non-consensual intimate imagery (NCII) on behalf of adult residents of India. Asmita acts as the technical facilitating intermediary and authorised representative of the Complainant by virtue of a signed digital declaration executed by the Complainant. A copy of the declaration is retained by Asmita in encrypted storage.

1. PURPOSE OF JOINT NOTICE

This Notice is issued jointly under the laws of India and the United States of America. {{platformName}} operates both: (a) a Resident Grievance Officer function in India pursuant to the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021; and (b) a Designated Agent function for the purposes of the Digital Millennium Copyright Act and the TAKE IT DOWN Act in the United States. This joint Notice is issued to enable the Noticee's respective compliance teams to act on whichever legal basis is procedurally expedient for their jurisdiction, without requiring the Complainant to file separate parallel notices. Both bases are invoked concurrently and without prejudice to each other.

2. PARTIES

2.1  ISSUING PARTY: Asmita (meriasmita.org), acting as the authorised representative of the Complainant.

2.2  COMPLAINANT: A verified adult resident of India who has executed a signed digital declaration affirming all material facts. The Complainant's identity is withheld consistent with the data-minimisation principle under the Digital Personal Data Protection Act, 2023. Full identifying details will be furnished upon a verified written request from the Noticee's Resident Grievance Officer or Designated Agent, addressed to Notice@meriasmita.org, quoting the case reference at paragraph 3.

2.3  NOTICEE: {{platformName}}, an intermediary and significant social media intermediary as applicable under the IT Act, 2000 and IT Rules, 2021 (India), and a covered platform under the TAKE IT DOWN Act and service provider under the DMCA (United States).

3. CASE REFERENCE AND CONTENT

Asmita Case Reference: {{caseReference}}
Complainant Declaration Reference: {{declarationReference}}
Secure Content Locator: {{url}}

The Secure Content Locator above is a one-time secure portal link provided solely to enable the Noticee's moderation team to identify the specific content. Asmita has at no point retrieved, viewed, downloaded, stored, or processed the intimate content itself.

4. BASIS UNDER INDIAN LAW

4.1  PRIMARY OBLIGATION — MANDATORY 24-HOUR REMOVAL (RULE 3(2)(b)):

Rule 3(2)(b) of the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021 imposes a mandatory obligation upon every intermediary to remove or disable access to content constituting non-consensual intimate imagery within TWENTY-FOUR (24) HOURS of receipt of a valid complaint from the affected individual. This obligation is self-executing upon receipt of this Notice and does not require any court order.

This Notice is issued pursuant to and in compliance with the MeitY NCII Standard Operating Procedure Version 1 (October 2025), issued in accordance with the order of the Hon'ble Madras High Court dated 15 July 2025 in W.P. No. 25017 of 2025.

4.2  ADDITIONAL INDIAN LAW OBLIGATIONS:

(a)  Rule 3(1)(b)(iv), IT Rules 2021 — due-diligence duty not to host non-consensual intimate imagery;

(b)  Section 79(3)(b), IT Act 2000 — safe-harbour protection under s.79(1) is lost upon receipt of this Notice if the Noticee fails to expeditiously remove or disable access. [Note: the Rule 3(2)(b) individual grievance track operates independently of the government-notification track addressed in Shreya Singhal v. Union of India, (2015) 5 SCC 1];

(c)  Section 66E, IT Act 2000 — violation of privacy by publication of private images without consent;

(d)  Sections 67 and 67A, IT Act 2000 — publishing or transmitting obscene and sexually explicit material;

(e)  Section 77, BNS 2023 — voyeurism, in force 1 July 2024, imprisonment 1–7 years;

(f)  Indecent Representation of Women (Prohibition) Act, 1986, as expressly invoked by the MeitY NCII SOP v.1 (October 2025);

(g)  Rule 4(4), IT Rules 2021 — 72-hour re-upload prevention and I4C Sahyog Portal hash sharing obligations.

5. BASIS UNDER UNITED STATES LAW

5.1  PRIMARY: 15 U.S.C. § 6851 (TAKE IT DOWN ACT, 2025):

This Notice is a valid notification under the TAKE IT DOWN Act. Under 15 U.S.C. § 6851(b)(1), the Noticee is required to remove or disable access to the identified content within FORTY-EIGHT (48) HOURS of receipt of this notification. This obligation applies regardless of whether the Complainant holds copyright ownership in the depicted work. The Complainant confirms the content is a non-consensual intimate visual depiction within the meaning of 15 U.S.C. § 6851(a)(3), and that she has not consented to its publication on the Noticee's service.

5.2  SECONDARY (CONDITIONAL): 17 U.S.C. § 512(c)(3) (DMCA):

To the extent the Complainant holds copyright in the depicted work, this Notice additionally constitutes a takedown notification under the Digital Millennium Copyright Act. All six elements under 17 U.S.C. § 512(c)(3)(A) are satisfied: (i) electronic signature by Asmita as authorised representative; (ii) and (iii) the copyrighted work and infringing material are identified at paragraph 3; (iv) Asmita at Notice@meriasmita.org is the contact; (v) the Complainant has a good-faith belief, having considered fair use in accordance with Lenz v. Universal Music Corp., 801 F.3d 1126 (9th Cir. 2015), that the use is not authorised; (vi) the information is accurate and the Complainant affirms authority under penalty of perjury. Section 512(f) notice: knowing material misrepresentation may result in damages liability against the filer.

6. DEMAND

IN VIEW OF THE ABOVE, the Complainant, through Asmita as her authorised representative, CALLS UPON AND REQUIRES the Noticee to:

(i)   ACKNOWLEDGE receipt of this Notice in writing within TWENTY-FOUR (24) HOURS, addressed to Asmita at Notice@meriasmita.org, quoting the Asmita case reference at paragraph 3;

(ii)  REMOVE or DISABLE ACCESS to the content identified at paragraph 3 within TWENTY-FOUR (24) HOURS of receipt (Indian law obligation) or FORTY-EIGHT (48) HOURS (US law obligation), whichever deadline is the earlier to expire;

(iii) PREVENT RE-UPLOAD or re-publication of the same or substantially similar content for a minimum period of SEVENTY-TWO (72) HOURS following removal, as required under Rule 4(4) of the IT Rules, 2021;

(iv)  PRESERVE all account records, metadata, upload logs, IP address records, and associated data for a minimum of one hundred and eighty (180) days; and

(v)   CONFIRM compliance with this Notice to Asmita at Notice@meriasmita.org, quoting the Asmita case reference at paragraph 3, within the applicable removal deadline.

7. CONSEQUENCES OF NON-COMPLIANCE

TAKE FURTHER NOTICE THAT failure by the Noticee to comply within the prescribed period shall expose the Noticee to the following without further notice from the Complainant or Asmita:

(a)  Loss of intermediary safe-harbour protection under Section 79(1) of the IT Act, 2000 by operation of Section 79(3)(b) of the same Act;

(b)  Loss of DMCA safe-harbour protection under 17 U.S.C. § 512(c) and exposure to direct copyright infringement liability;

(c)  Liability under the TAKE IT DOWN Act and applicable US regulations;

(d)  Appeal by the Complainant to the Grievance Appellate Committee under Rule 3A of the IT Rules, 2021 at www.gac.gov.in within thirty (30) days;

(e)  Complaint to the National Cybercrime Reporting Portal at cybercrime.gov.in / helpline 1930; and

(f)  Such further civil, criminal, and regulatory remedies as are available to the Complainant under Indian and US law.

8. RETURN ADDRESS

ALL COMMUNICATIONS in response to this Notice must be addressed to Asmita at Notice@meriasmita.org, quoting the Asmita case reference at paragraph 3. Communications addressed elsewhere will not be treated as valid responses.

9. DECLARATION

The Complainant has executed a digital declaration voluntarily and without duress, affirming all material facts, confirming this notice is made in good faith, and authorising Asmita to issue this Notice on her behalf. The declaration is available for inspection upon a verified written request.

This Notice is issued without prejudice to any other rights or remedies available to the Complainant under Indian or US law.

[DRAFT — PENDING LEGAL REVIEW — DO NOT DISPATCH]
`;

const HASH_BODY = `
This Legal Notice is issued by ASMITA (meriasmita.org), a public-interest platform that facilitates the submission of statutory takedown notices for non-consensual intimate imagery (NCII) on behalf of adult residents of India. Asmita acts as the technical facilitating intermediary and authorised representative of the Complainant by virtue of a signed digital declaration executed by the Complainant, a copy of which is retained by Asmita in encrypted storage.

1. PARTIES

1.1  ISSUING PARTY: Asmita (meriasmita.org), acting as the authorised representative of the Complainant.

1.2  COMPLAINANT: A verified adult resident of India who has executed a signed digital declaration affirming all material facts set out in this Notice and expressly covering the perceptual hashes annexed hereto. The Complainant's identity is withheld consistent with the data-minimisation principle under the Digital Personal Data Protection Act, 2023, and will be furnished upon a verified written request from the Noticee's Resident Grievance Officer, addressed to Notice@meriasmita.org, quoting the case reference at paragraph 2.

1.3  NOTICEE: {{platformName}}, an intermediary and/or significant social media intermediary as defined under the IT Act, 2000 and IT Rules, 2021 (hereinafter "the Noticee").

2. CASE REFERENCE

Asmita Case Reference: {{caseReference}}
Complainant Declaration Reference: {{declarationReference}}

3. PURPOSE OF THIS ADVISORY

This Notice requests PROACTIVE BLOCKING of non-consensual intimate imagery on the Noticee's platform by means of perceptual hash matching. The Complainant reports that intimate imagery in which she appears has been shared or is imminently threatened to be shared on the Noticee's platform without her consent. To enable the Noticee's moderation systems to detect, block, and prevent the dissemination of such content without causing any further exposure of the Complainant or requiring the Complainant to identify specific URLs at this stage, this Notice encloses perceptual hashes of the relevant content in the Annex below.

4. NATURE AND PROVENANCE OF THE PERCEPTUAL HASHES

4.1  The perceptual hashes annexed to this Notice were generated exclusively on the Complainant's own device using the PDQ (Perceptual Difference Quality) perceptual hashing algorithm developed by Meta Platforms Inc. and published as an open-source standard through the ThreatExchange programme.

4.2  Asmita has at no point received, retrieved, viewed, stored, transmitted, or processed the underlying intimate media. Only the 64-character hexadecimal PDQ hash string was transmitted to and stored on Asmita's platform. A perceptual hash is a one-way digital fingerprint: it permits automated matching systems to identify visually similar content at scale but cannot be mathematically reversed to reconstruct the image or video from which it was derived.

4.3  The Complainant's signed digital declaration expressly covers the perceptual hashes in the Annex to this Notice, confirming that:

(a)  the hashes represent content in which the Complainant appears in an intimate or private context;

(b)  the said content was not created or is not being shared with the Complainant's free and informed consent; and

(c)  this advisory is made in good faith.

5. STATUTORY BASIS AND OBLIGATIONS TRIGGERED

5.1  PRIMARY OBLIGATION — MANDATORY 24-HOUR REMOVAL OF MATCHING CONTENT (RULE 3(2)(b)):

Rule 3(2)(b) of the IT Rules, 2021 requires the Noticee to remove or disable access to any content matching the perceptual hashes in the Annex that is currently hosted on the Noticee's platform, within TWENTY-FOUR (24) HOURS of receipt of this Notice. This obligation is mandatory and does not depend upon any court order.

5.2  PROACTIVE DETECTION DUTY AND I4C SAHYOG PORTAL OBLIGATION (RULE 4(4) AND MeitY NCII SOP v.1):

Rule 4(4) of the IT Rules, 2021, as elaborated and operationalised by the MeitY NCII Standard Operating Procedure Version 1 (October 2025), issued pursuant to the order of the Hon'ble Madras High Court dated 15 July 2025 in W.P. No. 25017 of 2025, requires every significant social media intermediary to:

(a)  deploy crawler technology, hash matching, or equivalent automated detection tools to proactively identify and block re-uploads of reported NCII content, including artificially generated, morphed, and deepfake intimate imagery;

(b)  share reported NCII content hashes with the I4C Sahyog Portal maintained by the Indian Cyber Crime Coordination Centre (I4C), Ministry of Home Affairs, for inclusion in the national NCII hash bank, so as to enable coordinated detection and blocking across all major platforms; and

(c)  (where the Noticee is a search engine) de-index from search results any content matching the reported hashes within TWENTY-FOUR (24) HOURS of receipt of this Notice.

5.3  ADDITIONAL PROVISIONS:

(a)  Rule 3(1)(b)(iv), IT Rules 2021 — due-diligence obligation not to host non-consensual intimate imagery;

(b)  Section 79(3)(b), IT Act 2000 — safe-harbour protection under s.79(1) is lost upon receipt of this Notice if the Noticee fails to expeditiously act;

(c)  Section 66E, IT Act 2000 — violation of privacy;

(d)  Sections 67 and 67A, IT Act 2000 — obscene and sexually explicit material;

(e)  Section 77, BNS 2023 — voyeurism, in force 1 July 2024; and

(f)  Section 4, Indecent Representation of Women (Prohibition) Act, 1986, as expressly invoked by the MeitY NCII SOP v.1 (October 2025).

6. DEMAND

IN VIEW OF THE ABOVE, the Complainant, through Asmita as her authorised representative, CALLS UPON AND REQUIRES the Noticee to:

(i)   ACKNOWLEDGE receipt of this Notice in writing within TWENTY-FOUR (24) HOURS of receipt, addressed to Asmita at Notice@meriasmita.org, quoting the Asmita case reference at paragraph 2;

(ii)  INGEST the perceptual hashes in the Annex into the Noticee's proactive content detection, hash-matching, or equivalent automated blocking systems, so that any matching or substantially similar content is detected and blocked at upload or as promptly as technically practicable thereafter, pursuant to Rule 4(4) of the IT Rules, 2021 and the MeitY NCII SOP v.1 (October 2025);

(iii) SHARE the perceptual hashes in the Annex with the I4C Sahyog Portal operated by I4C, Ministry of Home Affairs, for inclusion in the national NCII hash bank, as required by the MeitY NCII SOP v.1 (October 2025);

(iv)  REMOVE or DISABLE ACCESS to any content already hosted on the Noticee's service that matches the hashes in the Annex, within TWENTY-FOUR (24) HOURS of receipt of this Notice, as required under Rule 3(2)(b) of the IT Rules, 2021;

(v)   PREVENT RE-UPLOAD of matching content for a minimum period of SEVENTY-TWO (72) HOURS following removal, as required under Rule 4(4);

(vi)  (IF APPLICABLE) DE-INDEX from search results all content matching the hashes in the Annex within TWENTY-FOUR (24) HOURS of receipt of this Notice, as required by the MeitY NCII SOP v.1 (October 2025);

(vii) PRESERVE all account records, upload logs, metadata, and associated data relating to any content matching the hashes in the Annex, for a minimum period of one hundred and eighty (180) days; and

(viii) CONFIRM the actions taken in compliance with this Notice to Asmita at Notice@meriasmita.org, quoting the Asmita case reference at paragraph 2, within TWENTY-FOUR (24) HOURS of such actions.

7. CONSEQUENCES OF NON-COMPLIANCE

TAKE FURTHER NOTICE THAT failure to comply within the prescribed period shall, without further notice from the Complainant or Asmita, expose the Noticee to:

(a)  Loss of intermediary safe-harbour protection under Section 79(1) of the IT Act, 2000;

(b)  Direct civil and criminal liability under the provisions cited at paragraph 5.3 above;

(c)  Appeal by the Complainant to the Grievance Appellate Committee under Rule 3A at www.gac.gov.in within thirty (30) days; and

(d)  Complaint to the National Cybercrime Reporting Portal at cybercrime.gov.in / helpline 1930, in accordance with the MeitY NCII SOP v.1 (October 2025).

8. RETURN ADDRESS

ALL COMMUNICATIONS in response to this Notice must be addressed to Asmita at Notice@meriasmita.org, quoting the Asmita case reference at paragraph 2.

9. DECLARATION

The Complainant has executed a digital declaration voluntarily and without duress, affirming all material facts, expressly covering the perceptual hashes in the Annex, and authorising Asmita to issue this Notice on her behalf. This Notice is issued only after administrative review of the Complainant's hash submission by an Asmita administrator. The declaration is available for inspection upon a verified written request.

This Notice is issued without prejudice to any other rights or remedies available to the Complainant under Indian law.

[The perceptual hash annex is appended below this notice body.]
[DRAFT — PENDING LEGAL REVIEW — DO NOT DISPATCH]
`;

// ─── Build document ───────────────────────────────────────────────────────────

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: FONT, size: SIZE },
        paragraph: { spacing: { after: 120 } },
      },
      heading1: {
        run: { font: FONT, size: 28, bold: true },
        paragraph: { spacing: { before: 400, after: 200 } },
      },
      heading2: {
        run: { font: FONT, size: SIZE, bold: true, underline: { type: UnderlineType.SINGLE } },
        paragraph: { spacing: { before: 280, after: 120 } },
      },
    },
  },
  sections: [{
    properties: {
      page: {
        margin: { top: 1440, bottom: 1440, left: 1440, right: 1080 }, // ~1in / 0.75in
      },
    },
    children: [
      // ── Cover ──
      blank(), blank(), blank(), blank(),
      centered("ASMITA", { bold: true, size: 48 }),
      centered("meriasmita.org  |  Notice@meriasmita.org", { size: SIZE_SM }),
      blank(),
      centered("LEGAL NOTICE TEMPLATES", { bold: true, size: 32 }),
      centered("Prepared for Legal Review", { italics: true }),
      blank(),
      blank(),
      infoTable([
        ["Date",             "15 June 2026"],
        ["Version",          "3.0 — Final Draft for Review"],
        ["Prepared by",      "Jamsaq Studio (technical) — AI-assisted drafting"],
        ["Review sought",    "IFF (internetfreedom.in) / SFLC.in"],
        ["Reference file",   "prisma/template-seeds.ts"],
        ["Templates",        "IT_RULES_2021 · DMCA · IT_RULES_AND_DMCA · HASH_ADVISORY"],
      ]),
      blank(),
      blank(),
      new Paragraph({
        children: [run("DRAFT — PENDING LEGAL REVIEW — DO NOT DISPATCH", { bold: true, size: SIZE_SM })],
        alignment: AlignmentType.CENTER,
        border: {
          top: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
          bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
          left: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
          right: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
        },
        spacing: { before: 160, after: 160 },
      }),
      blank(), blank(),
      centered("These templates are AI-generated. They require review and written sign-off", { italics: true, size: SIZE_SM }),
      centered("by an advocate enrolled with a Bar Council before any live notice is dispatched.", { italics: true, size: SIZE_SM }),

      // ── Notes for Reviewer ──
      pb(),
      heading("NOTES FOR LEGAL REVIEWER"),
      para("This document contains four notice templates that the Asmita platform uses to send NCII takedown requests to online platforms on behalf of Indian survivors. The templates are stored in the platform's database (prisma/template-seeds.ts) and are dispatched by an administrator only after: (a) the Complainant has submitted a URL or perceptual hash; (b) the Complainant has signed a digital declaration; and (c) an administrator has reviewed and approved the case. The reviewedByLegal flag in the database must be set to true by the reviewing advocate before any live dispatch can occur."),
      blank(),
      subheading("Items Requiring Independent Verification"),
      para("1.   All section and rule numbers must be verified against India Code (indiacode.nic.in) and the official Gazette before approval."),
      para("2.   MeitY NCII SOP v.1 (October 2025): verify this SOP is published at meity.gov.in and confirm the Madras High Court order reference (W.P. No. 25017/2025, dated 15.07.2025) is accurate."),
      para("3.   BNS Section 77 (voyeurism): verify against the published Bharatiya Nyaya Sanhita, 2023 gazette text."),
      para("4.   15 U.S.C. § 6851 (TAKE IT DOWN Act): confirm current applicability to each target platform, particularly Indian-only operators."),
      para("5.   IT Rules 2021 amendments: confirm no further amendments have been issued after the drafting of these templates that would alter the Rule numbers or obligations cited."),
      para("6.   POCSO: these templates are for adult complainants only. A separate POCSO-compliant template is required for any minor complainant and must be drafted and approved separately."),
      blank(),
      subheading("How Placeholders Work"),
      para("Every template body uses the following placeholder tokens, which are replaced at dispatch time by the Asmita system:"),
      para("{{platformName}}          Name of the target platform (e.g. Meta India / Instagram)"),
      para("{{caseReference}}         Asmita internal case identifier (e.g. ASM-2026-00142)"),
      para("{{url}}                   Replaced at dispatch with a one-time secure portal link — the raw content URL is never included in the email body"),
      para("{{declarationReference}}  Reference identifier of the Complainant's signed digital declaration"),

      // ── Templates ──
      ...buildNotice({
        title: "IT_RULES_2021",
        useWith: "Indian platforms — ShareChat, Josh, Moj, Telegram (Indian operations), and any intermediary subject to the IT Rules 2021. Primary obligation: Rule 3(2)(b) — mandatory 24-hour removal.",
        modeOfService: "Electronic Mail (Email) — Notice@meriasmita.org",
        toBlock: [
          "The Resident Grievance Officer,",
          "{{platformName}},",
          "[Registered Address / Grievance Officer Email]",
        ],
        refNo: "{{caseReference}}",
        subject: "Statutory notice for mandatory removal of non-consensual intimate imagery under Rule 3(2)(b) of the IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021",
        body: IT_RULES_BODY,
      }),

      ...buildNotice({
        title: "DMCA",
        useWith: "US-headquartered platforms — Reddit, Discord, Tumblr, and similar. Primary obligation: 15 U.S.C. § 6851 (TAKE IT DOWN Act) — mandatory 48-hour removal.",
        modeOfService: "Electronic Mail (Email) — Notice@meriasmita.org",
        toBlock: [
          "The Designated Agent / Trust and Safety Team,",
          "{{platformName}},",
          "[DMCA Designated Agent Address]",
        ],
        refNo: "{{caseReference}}",
        subject: "Non-consensual intimate imagery removal under 15 U.S.C. § 6851 (TAKE IT DOWN Act, 2025) and 17 U.S.C. § 512(c)(3) (DMCA)",
        body: DMCA_BODY,
      }),

      ...buildNotice({
        title: "IT_RULES_AND_DMCA",
        useWith: "Global platforms with both Indian operations and US legal presence — Meta (Instagram/Facebook), Google, X (Twitter), Snapchat, LinkedIn, YouTube. Both Rule 3(2)(b) (24h) and § 6851 (48h) apply; shorter deadline governs.",
        modeOfService: "Electronic Mail (Email) — Notice@meriasmita.org",
        toBlock: [
          "The Resident Grievance Officer (India) AND",
          "The Designated Agent / Trust and Safety Team (US),",
          "{{platformName}},",
          "[Grievance Officer Email] / [Designated Agent Address]",
        ],
        refNo: "{{caseReference}}",
        subject: "Joint statutory notice for removal of non-consensual intimate imagery — IT Rules 2021 (India) and 15 U.S.C. § 6851 TAKE IT DOWN Act (United States)",
        body: JOINT_BODY,
      }),

      ...buildNotice({
        title: "HASH_ADVISORY",
        useWith: "Any platform where the Complainant has submitted PDQ perceptual hashes client-side. The hash annex (PDQ fingerprints) is appended below the notice body at dispatch time. The underlying media never reaches the server.",
        modeOfService: "Electronic Mail (Email) — Notice@meriasmita.org",
        toBlock: [
          "The Resident Grievance Officer / Trust and Safety Team,",
          "{{platformName}},",
          "[Grievance Officer Email / Trust and Safety Contact]",
        ],
        refNo: "{{caseReference}}",
        subject: "NCII proactive blocking advisory — perceptual hash submission under Rule 3(2)(b), Rule 4(4), IT Rules 2021, and MeitY NCII SOP v.1 (October 2025)",
        body: HASH_BODY,
      }),

      // ── Disclaimer ──
      pb(),
      heading("LEGAL DISCLAIMER"),
      para("This document contains AI-generated legal information and analysis. It does not constitute legal advice and must not be used as the basis for dispatching any live notice without review and written sign-off by an advocate enrolled with a Bar Council of India."),
      blank(),
      para("Recommended Reviewers:"),
      indent("Internet Freedom Foundation (IFF) — internetfreedom.in"),
      indent("Software Freedom Law Centre India (SFLC.in) — sflc.in"),
      blank(),
      para("Once a template is reviewed and approved, the reviewing advocate should instruct the Asmita administrator to update prisma/template-seeds.ts with the approved notice body and set reviewedByLegal = true in the Asmita database for that template. Production dispatch is gated on this flag and cannot occur without it."),
      blank(),
      para("This document is confidential and intended solely for the purposes of legal review. It must not be shared publicly, filed in court proceedings, or relied upon as legal authority."),
      blank(),
      blank(),
      para("— End of Document —", { bold: true }),
    ],
  }],
});

const buf = await Packer.toBuffer(doc);
writeFileSync(OUT, buf);
console.log("Written:", OUT);
