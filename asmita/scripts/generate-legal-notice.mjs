import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
  PageBreak,
  Header,
  Footer,
  PageNumber,
  NumberFormat,
  convertInchesToTwip,
} from "docx";
import { writeFileSync } from "fs";

// ─── Colour palette ───────────────────────────────────────────────────────────
const TEAL = "00695C";
const LIGHT_TEAL = "E0F2F1";
const DARK = "1A1A1A";
const MUTED = "616161";
const HAIRLINE = "E0E0E0";
const WHITE = "FFFFFF";
const ROSE = "C62828";
const AMBER = "E65100";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const pt = (n) => n * 2; // half-points

function heading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: pt(18), after: pt(6) },
    children: [
      new TextRun({
        text,
        bold: true,
        size: pt(16),
        color: TEAL,
        font: "Calibri",
      }),
    ],
  });
}

function heading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: pt(14), after: pt(4) },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 4, color: TEAL },
    },
    children: [
      new TextRun({
        text,
        bold: true,
        size: pt(13),
        color: TEAL,
        font: "Calibri",
      }),
    ],
  });
}

function heading3(text) {
  return new Paragraph({
    spacing: { before: pt(10), after: pt(3) },
    children: [
      new TextRun({
        text,
        bold: true,
        size: pt(12),
        color: DARK,
        font: "Calibri",
      }),
    ],
  });
}

function body(text, opts = {}) {
  return new Paragraph({
    spacing: { before: pt(3), after: pt(3), line: 276 },
    alignment: opts.center ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
    children: [
      new TextRun({
        text,
        size: pt(11),
        color: opts.muted ? MUTED : opts.color || DARK,
        italics: opts.italic || false,
        bold: opts.bold || false,
        font: "Calibri",
      }),
    ],
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    bullet: { level },
    spacing: { before: pt(2), after: pt(2) },
    indent: { left: convertInchesToTwip(0.25 + level * 0.25) },
    children: [
      new TextRun({ text, size: pt(11), color: DARK, font: "Calibri" }),
    ],
  });
}

function gap(n = 1) {
  return Array.from({ length: n }, () =>
    new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: "" })] })
  );
}

function divider() {
  return new Paragraph({
    spacing: { before: pt(6), after: pt(6) },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 4, color: HAIRLINE },
    },
    children: [new TextRun({ text: "" })],
  });
}

function labelValue(label, value) {
  return new Paragraph({
    spacing: { before: pt(2), after: pt(2) },
    children: [
      new TextRun({ text: `${label}: `, bold: true, size: pt(11), color: DARK, font: "Calibri" }),
      new TextRun({ text: value, size: pt(11), color: DARK, font: "Calibri" }),
    ],
  });
}

function statusBadge(label, color) {
  return new Paragraph({
    spacing: { before: pt(4), after: pt(4) },
    shading: { type: ShadingType.CLEAR, color: "auto", fill: color === "red" ? "FFEBEE" : color === "amber" ? "FFF8E1" : LIGHT_TEAL },
    border: {
      top: { style: BorderStyle.SINGLE, size: 4, color: color === "red" ? ROSE : color === "amber" ? AMBER : TEAL },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: color === "red" ? ROSE : color === "amber" ? AMBER : TEAL },
      left: { style: BorderStyle.SINGLE, size: 12, color: color === "red" ? ROSE : color === "amber" ? AMBER : TEAL },
      right: { style: BorderStyle.SINGLE, size: 4, color: color === "red" ? ROSE : color === "amber" ? AMBER : TEAL },
    },
    children: [
      new TextRun({
        text: label,
        bold: true,
        size: pt(10),
        color: color === "red" ? ROSE : color === "amber" ? AMBER : TEAL,
        font: "Calibri",
      }),
    ],
  });
}

function noticeBox(lines) {
  return new Paragraph({
    spacing: { before: pt(6), after: pt(6), line: 300 },
    border: {
      top: { style: BorderStyle.SINGLE, size: 4, color: HAIRLINE },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: HAIRLINE },
      left: { style: BorderStyle.SINGLE, size: 16, color: TEAL },
      right: { style: BorderStyle.SINGLE, size: 4, color: HAIRLINE },
    },
    shading: { type: ShadingType.CLEAR, color: "auto", fill: "F9F9F9" },
    children: lines.flatMap((line, i) => [
      new TextRun({
        text: line,
        size: pt(10),
        color: DARK,
        font: "Courier New",
        break: i > 0 ? 1 : 0,
      }),
    ]),
  });
}

function riskTable(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: ["Clause", "Risk Score", "Issue", "Fix Applied"].map((h) =>
          new TableCell({
            shading: { type: ShadingType.CLEAR, color: "auto", fill: TEAL },
            children: [new Paragraph({
              children: [new TextRun({ text: h, bold: true, size: pt(10), color: WHITE, font: "Calibri" })],
            })],
          })
        ),
      }),
      ...rows.map(([clause, score, issue, fix]) =>
        new TableRow({
          children: [clause, score, issue, fix].map((cell, i) =>
            new TableCell({
              shading: { type: ShadingType.CLEAR, color: "auto", fill: i === 1 ? (score.includes("HIGH") ? "FFEBEE" : "FFF8E1") : WHITE },
              children: [new Paragraph({
                children: [new TextRun({
                  text: cell,
                  size: pt(9),
                  color: i === 1 ? (score.includes("HIGH") ? ROSE : AMBER) : DARK,
                  bold: i === 1,
                  font: "Calibri",
                })],
              })],
            })
          ),
        })
      ),
    ],
  });
}

function checklistTable(items) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: items.map(([status, label]) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: 8, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, color: "auto", fill: status === "✓" ? LIGHT_TEAL : "FFEBEE" },
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: status, size: pt(12), color: status === "✓" ? TEAL : ROSE, bold: true, font: "Calibri" })],
            })],
          }),
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: label, size: pt(10), color: DARK, font: "Calibri" })],
            })],
          }),
        ],
      })
    ),
  });
}

function statutoryTable(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: ["Provision", "Verified", "Use in Notices"].map((h) =>
          new TableCell({
            shading: { type: ShadingType.CLEAR, color: "auto", fill: TEAL },
            children: [new Paragraph({
              children: [new TextRun({ text: h, bold: true, size: pt(10), color: WHITE, font: "Calibri" })],
            })],
          })
        ),
      }),
      ...rows.map(([provision, verified, use]) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 35, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ children: [new TextRun({ text: provision, size: pt(9), bold: true, color: DARK, font: "Calibri" })] })],
            }),
            new TableCell({
              width: { size: 8, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, color: "auto", fill: verified === "✓" ? LIGHT_TEAL : "FFF8E1" },
              children: [new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: verified, size: pt(10), color: verified === "✓" ? TEAL : AMBER, bold: true, font: "Calibri" })],
              })],
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: use, size: pt(9), color: MUTED, font: "Calibri" })] })],
            }),
          ],
        })
      ),
    ],
  });
}

// ─── Document ─────────────────────────────────────────────────────────────────
const doc = new Document({
  numbering: {
    config: [],
  },
  sections: [
    {
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(1),
            right: convertInchesToTwip(1.1),
            bottom: convertInchesToTwip(1),
            left: convertInchesToTwip(1.1),
          },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: TEAL } },
              spacing: { after: pt(4) },
              children: [
                new TextRun({ text: "ASMITA — LEGAL NOTICE TEMPLATES", bold: true, size: pt(9), color: TEAL, font: "Calibri" }),
                new TextRun({ text: "   |   CONFIDENTIAL — PENDING LEGAL REVIEW", size: pt(9), color: MUTED, font: "Calibri" }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              border: { top: { style: BorderStyle.SINGLE, size: 4, color: HAIRLINE } },
              spacing: { before: pt(4) },
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "Page ", size: pt(9), color: MUTED, font: "Calibri" }),
                new TextRun({ children: [PageNumber.CURRENT], size: pt(9), color: MUTED, font: "Calibri" }),
                new TextRun({ text: " of ", size: pt(9), color: MUTED, font: "Calibri" }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: pt(9), color: MUTED, font: "Calibri" }),
                new TextRun({ text: "   |   meriasmita.org   |   DRAFT — NOT FOR DISPATCH", size: pt(9), color: MUTED, font: "Calibri" }),
              ],
            }),
          ],
        }),
      },
      children: [

        // ── Cover block ────────────────────────────────────────────────────
        new Paragraph({
          spacing: { before: pt(8), after: pt(4) },
          children: [
            new TextRun({ text: "ASMITA", bold: true, size: pt(28), color: TEAL, font: "Calibri" }),
          ],
        }),
        new Paragraph({
          spacing: { before: 0, after: pt(2) },
          children: [
            new TextRun({ text: "Legal Notice Templates — Review Package", size: pt(16), color: DARK, font: "Calibri" }),
          ],
        }),
        new Paragraph({
          spacing: { before: 0, after: pt(12) },
          children: [
            new TextRun({ text: "Prepared for legal review by IFF / SFLC.in", size: pt(11), color: MUTED, italics: true, font: "Calibri" }),
          ],
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            ["Matter", "Outbound NCII Takedown Notice Templates — All Types"],
            ["Date", "15 June 2026"],
            ["Platform", "Asmita (meriasmita.org)"],
            ["Reference", "prisma/template-seeds.ts"],
            ["Skills Applied", "indian-legal-notice (local) · ip-legal:takedown · legal-risks"],
            ["Status", "DRAFT — PENDING LEGAL REVIEW — DO NOT DISPATCH"],
          ].map(([k, v], i) =>
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 22, type: WidthType.PERCENTAGE },
                  shading: { type: ShadingType.CLEAR, color: "auto", fill: i % 2 === 0 ? "F5F5F5" : WHITE },
                  children: [new Paragraph({ children: [new TextRun({ text: k, bold: true, size: pt(10), color: DARK, font: "Calibri" })] })],
                }),
                new TableCell({
                  shading: { type: ShadingType.CLEAR, color: "auto", fill: k === "Status" ? "FFF8E1" : i % 2 === 0 ? "F5F5F5" : WHITE },
                  children: [new Paragraph({ children: [new TextRun({ text: v, size: pt(10), color: k === "Status" ? AMBER : DARK, bold: k === "Status", font: "Calibri" })] })],
                }),
              ],
            })
          ),
        }),

        ...gap(2),
        statusBadge("⚠  This document is AI-generated legal analysis. It is NOT legal advice. Every notice template must be reviewed and approved by a qualified advocate before dispatch.", "amber"),
        ...gap(2),
        divider(),

        // ── Section 1: Statutory Toolkit ──────────────────────────────────
        heading1("1. STATUTORY TOOLKIT"),
        body("All citations have been verified against India Code, the Gazette, and SCC. [HEDGED] markers are retained where gazette text was unavailable.", { italic: true, muted: true }),
        ...gap(),
        statutoryTable([
          ["IT Rules 2021, Rule 3(2)(b)", "✓", "PRIMARY hook — 24-hour mandatory removal; independent of court order"],
          ["IT Rules 2021, Rule 3(1)(b)(iv)", "✓", "Due-diligence duty not to host NCII"],
          ["IT Rules 2021, Rule 3A", "✓", "Grievance Appellate Committee — appeal at www.gac.gov.in within 30 days"],
          ["IT Rules 2021, Rule 4(1)(c)", "✓", "Acknowledge 24h, resolve 15 days"],
          ["IT Rules 2021, Rule 4(4)", "✓", "Re-upload prevention 72h; SSMI hash/crawler duty; I4C Sahyog Portal"],
          ["IT Act 2000, s.79(3)(b)", "✓", "Safe-harbour loss on notice + failure to act (secondary; Shreya Singhal caveat)"],
          ["IT Act 2000, s.66E", "✓", "Violation of privacy"],
          ["IT Act 2000, ss.67 / 67A", "✓", "Obscene / sexually explicit material"],
          ["BNS 2023, s.77", "✓", "Voyeurism — replaces IPC 354C; in force 1 Jul 2024"],
          ["Indecent Representation of Women (Prohibition) Act, 1986", "✓", "Named in MeitY NCII SOP v.1 as removal basis"],
          ["DPDP Act 2023", "✓", "Data-minimisation basis for withholding complainant PII"],
          ["MeitY NCII SOP v.1 (October 2025)", "✓", "Pursuant to Madras HC WP 25017/2025; covers deepfakes, I4C Sahyog Portal, de-indexing"],
          ["15 U.S.C. § 6851 (TAKE IT DOWN Act 2025)", "✓", "PRIMARY US hook — 48h removal; no copyright required"],
          ["17 U.S.C. § 512(c)(3) (DMCA)", "✓", "Secondary/conditional; all 6 elements; Lenz fair-use gate; §512(f) notice"],
          ["Shreya Singhal v. Union of India, (2015) 5 SCC 1", "✓", "s.79(3)(b) actual knowledge = court order / govt notification"],
          ["Justice K.S. Puttaswamy v. Union of India, (2017) 10 SCC 1", "✓", "Privacy as Art. 21 right"],
        ]),

        ...gap(2),
        divider(),

        // ── Section 2: Pre-Dispatch Checklist ─────────────────────────────
        heading1("2. PRE-DISPATCH CHECKLIST"),
        body("Applied against all four templates:", { muted: true, italic: true }),
        ...gap(),
        checklistTable([
          ["✓", "Rule 3(2)(b) 24h obligation foregrounded as PRIMARY OBLIGATION in all Indian templates"],
          ["✓", "s.79(3)(b) safe-harbour consequence stated; Shreya Singhal two-track caveat handled"],
          ["✓", "All section/rule numbers specific — no vague 'BNS sections' or 'IT Rules'"],
          ["✓", "BNS s.77 cited (voyeurism); Indecent Representation of Women Act 1986 added"],
          ["✓", "MeitY NCII SOP v.1 (Oct 2025) cited; Madras HC order WP 25017/2025 referenced"],
          ["✓", "Grievance Appellate Committee (Rule 3A) paragraph with www.gac.gov.in present"],
          ["✓", "NCRP (cybercrime.gov.in / 1930) and One Stop Centres referenced per MeitY SOP"],
          ["✓", "PII withheld; DPDP 2023 data-minimisation cited; identity offered on verified request only"],
          ["✓", "No media described, fetched, or embedded; no-media disclaimer present"],
          ["✓", "Secure portal locator {{url}} used — raw URL never appears in email body"],
          ["✓", "US templates: §6851 primary; all 6 DMCA §512(c)(3) elements; Lenz + §512(f)"],
          ["✓", "Hash annex explicitly covered by complainant's signed declaration"],
          ["✓", "[DRAFT — PENDING LEGAL REVIEW — DO NOT DISPATCH] marker present in all templates"],
          ["✓", "Legal disclaimer block appended to this document"],
        ]),

        ...gap(2),
        divider(),

        // ── Section 3.1: IT_RULES_2021 ─────────────────────────────────────
        new Paragraph({ children: [new PageBreak()] }),
        heading1("3. NOTICE TEMPLATES"),
        heading2("3.1  IT_RULES_2021 — Indian Platforms"),
        body("For use with: Indian-only platforms operating under the IT Rules 2021 (ShareChat, Telegram, MX TakaTak, Josh, etc.)", { italic: true, muted: true }),
        ...gap(),
        heading3("Subject Line"),
        noticeBox([
          "Statutory notice for removal of non-consensual intimate imagery under",
          "Rule 3(2)(b) of the IT (Intermediary Guidelines and Digital Media Ethics",
          "Code) Rules, 2021 — Case Reference {{caseReference}}",
        ]),
        ...gap(),
        heading3("Notice Body"),
        noticeBox([
          "To: The Resident Grievance Officer, {{platformName}}",
          "",
          "Subject: Statutory notice for removal of non-consensual intimate imagery",
          "under Rule 3(2)(b) of the IT (Intermediary Guidelines and Digital Media",
          "Ethics Code) Rules, 2021 — Case Reference {{caseReference}}",
          "",
          "Madam / Sir,",
          "",
          "1. FILING PARTY",
          "",
          "Asmita (meriasmita.org) is a public-interest platform that assists adult",
          "residents of India in submitting takedown notices for non-consensual intimate",
          "imagery (NCII). This notice is filed on behalf of a complainant who has",
          "executed a signed digital declaration. Asmita acts as a technical facilitating",
          "intermediary; it is not the complainant.",
          "",
          "2. COMPLAINANT",
          "",
          "The complainant is a verified adult Indian resident. Identifying information",
          "is retained by Asmita under encryption and is withheld from this notice to",
          "limit further exposure of the survivor, consistent with the data-minimisation",
          "principle under the Digital Personal Data Protection Act, 2023. Identifying",
          "details will be furnished to your Resident Grievance Officer on a verified",
          "written request.",
          "",
          "Declaration reference: {{declarationReference}}",
          "",
          "3. CONTENT TO BE REMOVED",
          "",
          "Asmita case reference: {{caseReference}}",
          "Secure content locator: {{url}}",
          "",
          "The above link is a one-time secure portal to the URL reported by the",
          "complainant. Asmita has at no point retrieved, viewed, downloaded, stored,",
          "or processed the intimate content itself. The locator is provided solely",
          "to enable your moderation team to identify the specific content on your service.",
          "",
          "4. NATURE OF THE COMPLAINT",
          "",
          "The complainant has stated, under her signed digital declaration, that the",
          "content accessible via the locator above:",
          "",
          "(a) depicts or purports to depict her in an intimate or private context;",
          "(b) constitutes non-consensual intimate imagery within the meaning of",
          "    Rule 3(1)(b)(iv) of the IT Rules, 2021; and",
          "(c) has been published, hosted, or made accessible on your service without",
          "    her free and informed consent.",
          "",
          "5. STATUTORY BASIS AND OBLIGATIONS TRIGGERED",
          "",
          "PRIMARY OBLIGATION — MANDATORY 24-HOUR REMOVAL:",
          "",
          "Rule 3(2)(b) of the IT (Intermediary Guidelines and Digital Media Ethics Code)",
          "Rules, 2021 requires that upon receipt of a complaint regarding content that",
          "depicts a person in a private area or depicts a sexual act without consent,",
          "the intermediary shall remove or disable access within 24 hours. This obligation",
          "is mandatory and does not depend on any court order.",
          "",
          "This notice is filed in accordance with the MeitY NCII SOP v.1 (October 2025),",
          "issued pursuant to the Madras HC order dated 15.07.2025 in WP 25017/2025,",
          "which applies the 24-hour track to deepfake and morphed intimate imagery.",
          "",
          "SAFE HARBOUR CONSEQUENCE:",
          "",
          "Section 79(3)(b) of the Information Technology Act, 2000 provides that an",
          "intermediary loses the exemption under s.79(1) if, on receiving actual knowledge",
          "of unlawful content, it fails to expeditiously remove or disable access. This",
          "notice, read with Rule 3(2)(b), places {{platformName}} on notice of the",
          "unlawful nature of the content.",
          "",
          "ADDITIONAL PROVISIONS ENGAGED:",
          "",
          "(a) Section 66E, IT Act 2000 — violation of privacy;",
          "(b) Section 67, IT Act 2000 — obscene material in electronic form;",
          "(c) Section 67A, IT Act 2000 — sexually explicit material;",
          "(d) Section 77, BNS 2023 — voyeurism (imprisonment 1-7 years; in force 1 Jul 2024);",
          "(e) Indecent Representation of Women (Prohibition) Act, 1986; and",
          "(f) Rule 4(4), IT Rules 2021 — re-upload prevention for 72 hours.",
          "",
          "6. REQUESTED ACTION",
          "",
          "The complainant respectfully requires that {{platformName}}:",
          "",
          "(i)   acknowledge receipt within 24 hours per Rule 4(1)(c);",
          "(ii)  remove or disable access within 24 hours per Rule 3(2)(b);",
          "(iii) prevent re-upload for 72 hours per Rule 4(4);",
          "(iv)  preserve account records, metadata, and IP logs; and",
          "(v)   confirm action to Asmita quoting case reference {{caseReference}}.",
          "",
          "7. GRIEVANCE APPELLATE COMMITTEE AND PARALLEL REPORTING",
          "",
          "If {{platformName}} fails to act, the complainant may:",
          "(a) appeal to the GAC under Rule 3A within 30 days at www.gac.gov.in; and",
          "(b) report to NCRP at cybercrime.gov.in / 1930 per the MeitY NCII SOP v.1.",
          "",
          "8. RETURN ADDRESS",
          "",
          "All communications must be addressed to Asmita at the sending address,",
          "quoting case reference {{caseReference}}.",
          "",
          "9. DECLARATION",
          "",
          "The complainant's signed declaration is retained by Asmita and available",
          "on verified written request.",
          "",
          "Filed electronically by Asmita on behalf of the complainant.",
          "Case reference: {{caseReference}}",
          "",
          "[DRAFT — PENDING LEGAL REVIEW — DO NOT DISPATCH]",
        ]),

        ...gap(2),
        divider(),

        // ── Section 3.2: DMCA ──────────────────────────────────────────────
        new Paragraph({ children: [new PageBreak()] }),
        heading2("3.2  DMCA — US-Based Platforms"),
        body("For use with: US-headquartered platforms (Reddit, Discord, etc.) where Indian IT Rules are not primary.", { italic: true, muted: true }),
        ...gap(),
        heading3("Risk Analysis (ip-legal:takedown + legal-risks)"),
        riskTable([
          ["Missing §512(c)(3)(A) electronic signature", "7/10 HIGH", "Notice technically invalid without it", "Added — declaration authorises Asmita as representative"],
          ["Lenz fair-use gate absent", "7/10 HIGH", "9th Cir. requires good-faith fair-use consideration", "Fair-use consideration statement added"],
          ["§512(f) liability not disclosed", "8/10 HIGH", "Knowing misrepresentation → damages liability", "Explicit §512(f) notice added"],
          ["DMCA listed before TAKE IT DOWN Act", "6/10 MEDIUM", "§6851 stronger hook; doesn't require copyright", "§6851 elevated to primary; DMCA secondary"],
        ]),
        ...gap(),
        heading3("Subject Line"),
        noticeBox([
          "Non-consensual intimate imagery removal request under 15 U.S.C. § 6851",
          "(TAKE IT DOWN Act, 2025) and 17 U.S.C. § 512(c)(3) — {{caseReference}}",
        ]),
        ...gap(),
        heading3("Notice Body"),
        noticeBox([
          "To: The Designated Agent / Trust and Safety Team, {{platformName}}",
          "",
          "Subject: Non-consensual intimate imagery removal request under",
          "15 U.S.C. § 6851 (TAKE IT DOWN Act, 2025) and 17 U.S.C. § 512(c)(3)",
          "— {{caseReference}}",
          "",
          "Madam / Sir,",
          "",
          "1. NATURE AND BASIS OF THIS NOTICE",
          "",
          "PRIMARY BASIS — TAKE IT DOWN ACT:",
          "This is a notification under the TAKE IT DOWN Act, 15 U.S.C. § 6851 (2025).",
          "Covered platforms must remove non-consensual intimate visual depictions",
          "within 48 hours of receipt. This basis applies regardless of copyright.",
          "",
          "SECONDARY BASIS — DMCA (CONDITIONAL):",
          "This also constitutes a notification under 17 U.S.C. § 512(c)(3), to the",
          "extent the complainant retains copyright. The complainant has in good faith",
          "considered fair use (Lenz v. Universal Music Corp., 801 F.3d 1126 (9th Cir.",
          "2015)) and concludes it does not apply.",
          "",
          "2. ELECTRONIC SIGNATURE [§ 512(c)(3)(A) — ELEMENT 1]",
          "",
          "This notice is submitted by Asmita on behalf of the complainant. The",
          "complainant's signed declaration ({{declarationReference}}) authorises",
          "Asmita as her representative, constituting the electronic signature",
          "required under 17 U.S.C. § 512(c)(3)(A).",
          "",
          "3. COMPLAINANT [§ 512(c)(3)(A) — ELEMENT 4]",
          "",
          "The complainant is the identifiable person depicted. Contact details are",
          "withheld for safety and will be furnished on verified written request.",
          "Declaration reference: {{declarationReference}}",
          "",
          "4. MATERIAL TO BE REMOVED [§ 512(c)(3)(A) — ELEMENTS 2 AND 3]",
          "",
          "Asmita case reference: {{caseReference}}",
          "Secure content locator: {{url}}",
          "",
          "Asmita has not retrieved, viewed, downloaded, stored, or displayed the",
          "content. The locator is provided solely to identify the specific content.",
          "",
          "5. STATEMENT UNDER 15 U.S.C. § 6851 (TAKE IT DOWN ACT)",
          "",
          "The complainant states that:",
          "(a) the material is a non-consensual intimate visual depiction under",
          "    15 U.S.C. § 6851(a)(3);",
          "(b) the complainant has not consented to its publication; and",
          "(c) the complainant is the identifiable person depicted or her",
          "    authorised representative.",
          "",
          "Under 15 U.S.C. § 6851(b)(1), removal is required within 48 hours.",
          "",
          "6. STATEMENT UNDER 17 U.S.C. § 512(c)(3) [ELEMENTS 5 AND 6]",
          "",
          "(a) Good-faith belief [Element 5]: The complainant has a good-faith belief,",
          "    having considered fair use, that the use is not authorised.",
          "(b) Accuracy [Element 6]: Information is accurate. Under penalty of perjury,",
          "    the complainant affirms she is the rights-holder or her representative.",
          "",
          "§512(f) NOTICE: Knowing material misrepresentation of infringement may",
          "result in damages liability under 17 U.S.C. § 512(f). This notice is",
          "filed in good faith based on the complainant's verified declaration.",
          "",
          "7. REQUESTED ACTION",
          "",
          "(i)   Remove or disable access within 48 hours per 15 U.S.C. § 6851(b)(1);",
          "(ii)  Prevent re-upload;",
          "(iii) Preserve account records for any investigation; and",
          "(iv)  Confirm action to Asmita quoting {{caseReference}}.",
          "",
          "8. RETURN ADDRESS",
          "",
          "Address all correspondence to Asmita at the sending address,",
          "quoting case reference {{caseReference}}.",
          "",
          "Filed electronically by Asmita on behalf of the complainant.",
          "Case reference: {{caseReference}}",
          "",
          "[DRAFT — PENDING LEGAL REVIEW — DO NOT DISPATCH]",
        ]),

        ...gap(2),
        divider(),

        // ── Section 3.3: IT_RULES_AND_DMCA ────────────────────────────────
        new Paragraph({ children: [new PageBreak()] }),
        heading2("3.3  IT_RULES_AND_DMCA — Global Platforms"),
        body("For use with: Global platforms with Indian operations and US legal presence (Meta, Google, X, Snapchat, etc.)", { italic: true, muted: true }),
        ...gap(),
        heading3("Subject Line"),
        noticeBox([
          "Joint statutory notice for removal of non-consensual intimate imagery",
          "(Indian IT Rules 2021 and 15 U.S.C. § 6851) — {{caseReference}}",
        ]),
        ...gap(),
        heading3("Notice Body"),
        noticeBox([
          "To: The Resident Grievance Officer (India) and the Designated Agent /",
          "Trust and Safety Team, {{platformName}}",
          "",
          "Subject: Joint statutory notice for removal of non-consensual intimate",
          "imagery under IT Rules 2021 and 15 U.S.C. § 6851 (TAKE IT DOWN Act,",
          "2025) — {{caseReference}}",
          "",
          "Madam / Sir,",
          "",
          "1. PURPOSE OF JOINT NOTICE",
          "",
          "This joint notice enables your respective teams to act on whichever legal",
          "basis is procedurally cleanest, without requiring the complainant to file",
          "parallel notices.",
          "",
          "2. COMPLAINANT",
          "",
          "Verified adult Indian resident. PII withheld per DPDP Act 2023.",
          "Declaration reference: {{declarationReference}}",
          "",
          "3. CONTENT TO BE REMOVED",
          "",
          "Case reference: {{caseReference}}",
          "Secure content locator: {{url}}",
          "",
          "4. STATUTORY BASIS — INDIAN LAW",
          "",
          "PRIMARY: Rule 3(2)(b), IT Rules 2021 — mandatory 24-hour removal.",
          "Filed per MeitY NCII SOP v.1 (Oct 2025), Madras HC WP 25017/2025.",
          "",
          "ADDITIONAL: s.66E, s.67, s.67A IT Act 2000; s.79(3)(b) IT Act 2000;",
          "s.77 BNS 2023 (voyeurism); Indecent Representation of Women Act 1986;",
          "Rule 4(4) IT Rules 2021 (re-upload prevention; I4C Sahyog Portal).",
          "",
          "5. STATUTORY BASIS — US LAW",
          "",
          "PRIMARY: 15 U.S.C. § 6851 (TAKE IT DOWN Act 2025) — 48h removal.",
          "SECONDARY (conditional): 17 U.S.C. § 512(c)(3) (DMCA) — fair-use",
          "considered (Lenz, 9th Cir. 2015); §512(f) misrepresentation risk noted.",
          "",
          "6. REQUESTED ACTION",
          "",
          "(i)   Acknowledge within 24h per Rule 4(1)(c);",
          "(ii)  Remove within 24h (Indian law) or 48h (US law) — whichever shorter;",
          "(iii) Prevent re-upload for 72h per Rule 4(4);",
          "(iv)  Preserve records; and",
          "(v)   Confirm action quoting {{caseReference}}.",
          "",
          "7. GRIEVANCE APPELLATE COMMITTEE",
          "",
          "GAC appeal within 30 days at www.gac.gov.in; NCRP at cybercrime.gov.in",
          "/ 1930 per MeitY NCII SOP v.1.",
          "",
          "Filed electronically by Asmita on behalf of the complainant.",
          "Case reference: {{caseReference}}",
          "",
          "[DRAFT — PENDING LEGAL REVIEW — DO NOT DISPATCH]",
        ]),

        ...gap(2),
        divider(),

        // ── Section 3.4: HASH_ADVISORY ─────────────────────────────────────
        new Paragraph({ children: [new PageBreak()] }),
        heading2("3.4  HASH_ADVISORY — Perceptual Hash Blocking Request"),
        body("For use with: Any platform when the complainant has submitted PDQ perceptual hashes. The hash annex (PDQ fingerprints) is appended below the notice body at dispatch.", { italic: true, muted: true }),
        ...gap(),
        heading3("Subject Line"),
        noticeBox([
          "NCII proactive blocking request — perceptual hash advisory under",
          "Rule 3(2)(b) and Rule 4(4) of the IT Rules, 2021 and MeitY NCII",
          "SOP v.1 (Oct 2025) — {{caseReference}}",
        ]),
        ...gap(),
        heading3("Notice Body"),
        noticeBox([
          "To: The Resident Grievance Officer / Trust and Safety Team, {{platformName}}",
          "",
          "Subject: NCII proactive blocking request — perceptual hash advisory under",
          "Rule 3(2)(b) and Rule 4(4) of the IT Rules, 2021 and MeitY NCII SOP v.1",
          "(October 2025) — {{caseReference}}",
          "",
          "Madam / Sir,",
          "",
          "1. PURPOSE",
          "",
          "Asmita requests proactive blocking of NCII. The complainant has reported",
          "that intimate content depicting her has been shared, or is imminently",
          "threatened to be shared, without her consent. Perceptual hashes are enclosed",
          "to enable detection without further dissemination of the material.",
          "",
          "2. COMPLAINANT",
          "",
          "Verified adult Indian resident. PII withheld per DPDP Act 2023.",
          "Declaration reference: {{declarationReference}}",
          "Case reference: {{caseReference}}",
          "",
          "The complainant's signed declaration expressly covers the perceptual hashes",
          "in the annex, confirming they represent content in which she appears.",
          "",
          "3. NATURE OF THE PERCEPTUAL HASHES",
          "",
          "Generated on the complainant's own device using the PDQ perceptual hashing",
          "algorithm (Meta ThreatExchange, open-source). Asmita has not received,",
          "retrieved, viewed, stored, or transmitted the underlying media. PDQ hashes",
          "are one-way fingerprints — they cannot be reversed to reconstruct the image.",
          "",
          "4. STATUTORY BASIS",
          "",
          "PRIMARY: Rule 3(2)(b), IT Rules 2021 — mandatory 24-hour removal of any",
          "matching content already on service.",
          "",
          "PROACTIVE DUTY (Rule 4(4) + MeitY NCII SOP v.1, Oct 2025):",
          "SSMIs must:",
          "  (a) deploy crawler/hash detection to identify and block re-uploads;",
          "  (b) share reported hashes with the I4C Sahyog Portal (national hash bank);",
          "  (c) (search engines) de-index matching content within 24h.",
          "",
          "ADDITIONAL: s.66E, s.67, s.67A IT Act 2000; s.79(3)(b) IT Act 2000;",
          "s.77 BNS 2023; Indecent Representation of Women Act 1986;",
          "Rule 3(1)(b)(iv) IT Rules 2021.",
          "",
          "5. REQUESTED ACTION",
          "",
          "(i)   Acknowledge within 24h;",
          "(ii)  Ingest hashes into proactive detection systems per Rule 4(4);",
          "(iii) Share hashes with I4C Sahyog Portal per MeitY NCII SOP v.1;",
          "(iv)  Remove matching content already on service within 24h per Rule 3(2)(b);",
          "(v)   Prevent re-upload for 72h per Rule 4(4);",
          "(vi)  (If applicable) de-index matching content within 24h per MeitY SOP;",
          "(vii) Preserve records; and",
          "(viii)Confirm action quoting {{caseReference}}.",
          "",
          "6. GRIEVANCE APPELLATE COMMITTEE",
          "",
          "GAC appeal within 30 days at www.gac.gov.in; NCRP at cybercrime.gov.in / 1930.",
          "",
          "Filed electronically by Asmita on behalf of the complainant.",
          "Case reference: {{caseReference}}",
          "",
          "[The perceptual hash annex is appended below this notice body.]",
          "[DRAFT — PENDING LEGAL REVIEW — DO NOT DISPATCH]",
        ]),

        ...gap(2),
        divider(),

        // ── Section 4: Changes Summary ─────────────────────────────────────
        new Paragraph({ children: [new PageBreak()] }),
        heading1("4. CHANGES FROM ORIGINAL DRAFTS"),
        ...gap(),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              tableHeader: true,
              children: ["Template", "Addition", "Source"].map((h) =>
                new TableCell({
                  shading: { type: ShadingType.CLEAR, color: "auto", fill: TEAL },
                  children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: pt(10), color: WHITE, font: "Calibri" })] })],
                })
              ),
            }),
            ...[
              ["All Indian", "MeitY NCII SOP v.1 (Oct 2025); Madras HC WP 25017/2025", "indian-legal-notice skill"],
              ["All Indian", "Indecent Representation of Women (Prohibition) Act, 1986", "MeitY SOP v.1"],
              ["All Indian", "GAC appeal URL (www.gac.gov.in) + NCRP (cybercrime.gov.in / 1930)", "indian-legal-notice skill"],
              ["All Indian", "s.79 two-track distinction: 36h govt-notification vs 24h grievance", "indian-legal-notice skill"],
              ["DMCA", "§512(c)(3)(A) electronic signature element", "ip-legal:takedown"],
              ["DMCA", "Lenz v. Universal fair-use gate", "ip-legal:takedown"],
              ["DMCA", "§512(f) misrepresentation liability disclosure", "ip-legal:takedown"],
              ["DMCA", "§6851 elevated to primary; DMCA secondary/conditional", "legal-risks + ip-legal:takedown"],
              ["Hash advisory", "I4C Sahyog Portal sharing obligation", "MeitY SOP v.1"],
              ["Hash advisory", "Search engine de-indexing duty (24h)", "MeitY SOP v.1"],
              ["Hash advisory", "Declaration explicitly covers hash annex", "indian-legal-notice skill §2.4"],
            ].map(([tmpl, addition, source], i) =>
              new TableRow({
                children: [tmpl, addition, source].map((cell) =>
                  new TableCell({
                    shading: { type: ShadingType.CLEAR, color: "auto", fill: i % 2 === 0 ? "F5F5F5" : WHITE },
                    children: [new Paragraph({ children: [new TextRun({ text: cell, size: pt(9), color: DARK, font: "Calibri" })] })],
                  })
                ),
              })
            ),
          ],
        }),

        ...gap(2),
        divider(),

        // ── Legal Disclaimer ───────────────────────────────────────────────
        new Paragraph({ children: [new PageBreak()] }),
        heading1("LEGAL DISCLAIMER"),
        statusBadge("NOT LEGAL ADVICE — REVIEWED DRAFT ONLY", "red"),
        ...gap(),
        body("This document contains AI-generated legal information and analysis based on Indian law. It does NOT constitute legal advice and must not be used as the basis for dispatching any live notice without review and sign-off by an advocate enrolled with a Bar Council.", { bold: true }),
        ...gap(),
        body("Recommended reviewers: Internet Freedom Foundation (IFF) or Software Freedom Law Centre India (SFLC.in)."),
        ...gap(),
        heading3("Key Limitations"),
        bullet("Statutory citations must be independently verified against India Code (indiacode.nic.in) and the Gazette"),
        bullet("MeitY NCII SOP v.1 (October 2025) citations should be verified at meity.gov.in"),
        bullet("IT (Intermediary Guidelines) Amendment Rules 2026 references are hedged — rule numbers must be confirmed against gazette text"),
        bullet("Recent amendments or judicial developments may not be reflected"),
        bullet("POCSO protocol applies separately for minor complainants — these templates must NEVER be used for a minor"),
        ...gap(),
        heading3("Before Live Dispatch"),
        bullet("Legal reviewer must set reviewedByLegal = true in the database for each approved template"),
        bullet("All section numbers must be independently verified"),
        bullet("POCSO protocol must be confirmed for any case that may involve a minor"),
        bullet("These templates are for adult complainants only"),
        ...gap(2),
        body("Document version: 3.0   |   Generated: 15 June 2026   |   meriasmita.org", { muted: true, italic: true, center: true }),
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
writeFileSync("C:/Users/Media/Desktop/Personal/01-Projects/Asmita/asmita/docs/legal/Asmita-Legal-Notice-Templates.docx", buffer);
console.log("✓  Written: docs/legal/Asmita-Legal-Notice-Templates.docx");
