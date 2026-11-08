// Builds the formatted notice pack for legal review straight from
// prisma/template-seeds.ts, so the document counsel reviews is word for word
// what the app sends. Run from asmita/: node scripts/generate-notice-pack.mjs
// Output: docs/legal/Asmita-Legal-Notices-2026-11.docx
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  AlignmentType, BorderStyle, Document, Footer, Header, HighlightColor, LevelFormat,
  Packer, PageBreak, PageNumber, Paragraph, Tab, Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";
import { templateSeeds } from "../prisma/template-seeds.ts";

const OUT = fileURLToPath(new URL("../docs/legal/Asmita-Legal-Notices-2026-11.docx", import.meta.url));
const FONT = "Times New Roman";
const INK = "1A1A1A";
const MUTED = "5F6368";
const RED = "B3261E";
const BRAND = "7A2E4D";

const VARIABLES = {
  caseReference: "Case reference",
  platformName: "Platform name",
  url: "Reported URL",
  declarationReference: "Declaration reference",
  originalSentAt: "Date and time the complaint was served",
};

const ABOUT = {
  IT_RULES_2021: {
    title: "Complaint under Rule 3(2)(b), IT Rules 2021",
    use: "Emailed to the Grievance Officer of an Indian or India-facing platform, with the survivor's signed copy attached.",
  },
  DMCA: {
    title: "TAKE IT DOWN Act and DMCA notice (United States)",
    use: "Emailed to the designated agent of a United States platform. US law: not redrafted in November 2026. See memo item 6 before relying on it.",
  },
  IT_RULES_AND_DMCA: {
    title: "Joint complaint, India and United States",
    use: "Emailed to platforms with both an Indian Grievance Officer and a United States designated agent.",
  },
  HASH_ADVISORY: {
    title: "Request for proactive blocking by perceptual hash",
    use: "Emailed with the fingerprint annex the app builds at dispatch. No URL is included.",
  },
  ESCALATION_L1: {
    title: "24-hour follow-up to the platform (covering letter)",
    use: "Sent automatically 24 hours after a complaint with no acknowledgement on record, followed by the complaint's text. Held until both this letter and the complaint are legally reviewed.",
  },
  FIR_PACKAGE: {
    title: "Survivor's written complaint to the police",
    use: "Given to the survivor to complete, sign and file herself. Asmita never files it for her. Not yet shown in the app.",
  },
};

// ---------- inline formatting ----------

const TOKEN = /(\{\{\s*[a-zA-Z]+\s*\}\}|\[CITATION REQUIRED - verify with legal advisor\]|\[DRAFT - PENDING LEGAL REVIEW - DO NOT DISPATCH\]|\[[^[\]]{3,}\])/g;

function runs(text, base = {}) {
  const out = [];
  for (const part of text.split(TOKEN)) {
    if (!part) continue;
    const variable = part.match(/^\{\{\s*([a-zA-Z]+)\s*\}\}$/);
    if (variable) {
      out.push(new TextRun({ ...base, text: `[${VARIABLES[variable[1]] ?? variable[1]}]`, highlight: HighlightColor.LIGHT_GRAY, font: FONT }));
    } else if (part.startsWith("[CITATION REQUIRED")) {
      out.push(new TextRun({ ...base, text: "[VERIFY: citation required, confirm with legal advisor]", highlight: HighlightColor.YELLOW, font: FONT, size: 20 }));
    } else if (part.startsWith("[DRAFT - PENDING")) {
      out.push(new TextRun({ ...base, text: part, bold: true, color: RED, font: FONT }));
    } else if (part.startsWith("[") && part.endsWith("]")) {
      // Fill-in blanks in the survivor's police complaint, and annex notes.
      out.push(new TextRun({ ...base, text: part, highlight: HighlightColor.LIGHT_GRAY, italics: true, font: FONT }));
    } else {
      out.push(new TextRun({ ...base, text: part, font: FONT }));
    }
  }
  return out;
}

const p = (text, opts = {}, base = {}) =>
  new Paragraph({ spacing: { after: 120, line: 300 }, alignment: AlignmentType.JUSTIFIED, ...opts, children: runs(text, base) });

// A numbered item whose wrapped lines align with its text, not its marker.
function hanging(line, left, width) {
  const [, marker, rest] = line.match(/^(\S+)\s+(.*)$/);
  return new Paragraph({
    spacing: { after: 120, line: 300 }, alignment: AlignmentType.JUSTIFIED,
    indent: { left, hanging: width }, tabStops: [{ type: "left", position: left }],
    children: [new TextRun({ text: marker, font: FONT }), new TextRun({ children: [new Tab()], font: FONT }), ...runs(rest)],
  });
}

// ---------- notice body ----------

function bodyParagraphs(type, body) {
  const out = [];
  for (const raw of body.split("\n")) {
    const line = raw.trimEnd();
    if (!line) continue;
    if (line.startsWith("[DRAFT - PENDING")) {
      out.push(p(line, { alignment: AlignmentType.CENTER, spacing: { before: 240, after: 120 } }));
    } else if (/^-{6,}.*-{6,}$/.test(line)) {
      const label = line.replace(/-/g, "").trim();
      out.push(p(label, { alignment: AlignmentType.CENTER, spacing: { before: 360, after: 120 }, border: { top: { style: BorderStyle.SINGLE, size: 6, color: MUTED, space: 6 } } }, { bold: true, size: 20, color: MUTED }));
      out.push(p("[The text of the original complaint, from its own reviewed template, follows here unchanged.]", { alignment: AlignmentType.CENTER }));
    } else if (/^To[:,]/.test(line)) {
      out.push(p(line, { alignment: AlignmentType.LEFT, spacing: { after: 0 } }, { bold: true }));
    } else if (/^Subject:/.test(line)) {
      out.push(p(line, { alignment: AlignmentType.LEFT, spacing: { before: 200, after: 200 } }, { bold: true, underline: {} }));
    } else if (/^\d+\.\s+[A-Z][A-Z ,'()/&-]+$/.test(line)) {
      // Numbered section heading, e.g. "4. LEGAL BASIS".
      out.push(p(line, { alignment: AlignmentType.LEFT, keepNext: true, spacing: { before: 240, after: 120 } }, { bold: true }));
    } else if (/^[A-Z][A-Z0-9 ,'()/.&-]{6,}:$/.test(line) || /^[A-Z][A-Z0-9 ,;'()/.&-]{6,}\([A-Za-z0-9 ,;.()]+\):$/.test(line)) {
      // Sub-heading such as "OFFENCES THE CONTENT MAY DISCLOSE:".
      out.push(p(line, { alignment: AlignmentType.LEFT, keepNext: true, spacing: { before: 160, after: 80 } }, { bold: true, size: 22 }));
    } else if (/^\(([ivx]+|[a-z])\)\s/.test(line)) {
      out.push(hanging(line, 720, 540));
    } else if (/^\d+\.\d+\s/.test(line) || /^\d+\.\s{2}/.test(line)) {
      out.push(hanging(line, 540, 540));
    } else if (/^(Yours faithfully,|For and on behalf|Asmita \(meriasmita\.org\)$|Notice@meriasmita\.org$)/.test(line)) {
      out.push(p(line, { alignment: AlignmentType.LEFT, spacing: { before: line.startsWith("Yours") ? 240 : 0, after: line.startsWith("Yours") ? 360 : 0 } }, line.startsWith("Asmita") ? { bold: true } : {}));
    } else {
      out.push(p(line));
    }
  }
  if (type === "HASH_ADVISORY") out.push(...annexSample());
  return out;
}

function letterhead() {
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [new TextRun({ text: "ASMITA", bold: true, size: 36, color: BRAND, font: FONT, characterSpacing: 60 })] }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 240 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: BRAND, space: 8 } },
      children: [new TextRun({ text: "meriasmita.org  |  Notice@meriasmita.org", size: 18, color: MUTED, font: FONT })],
    }),
    new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 0 }, children: [new TextRun({ text: "Ref: ", bold: true, font: FONT }), ...runs("{{caseReference}}")] }),
    new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 0 }, children: [new TextRun({ text: "Date: ", bold: true, font: FONT }), ...runs("[Date of dispatch]")] }),
    new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 240 }, children: [new TextRun({ text: "By email", italics: true, font: FONT })] }),
  ];
}

function annexSample() {
  const cell = (text, bold = false) => new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: runs(text, { bold, size: 20 }) })] });
  return [
    new Paragraph({ children: [new PageBreak()] }),
    p("ANNEX: PERCEPTUAL HASHES (PDQ)", { alignment: AlignmentType.CENTER, spacing: { after: 200 } }, { bold: true }),
    p("[Built by the app at dispatch from the fingerprints the Complainant signed for (src/lib/case-hash-annex.ts). Only approved fingerprints she signed for are listed.]"),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ children: [cell("No.", true), cell("PDQ hash (64 hexadecimal characters)", true)] }),
        new TableRow({ children: [cell("1"), cell("[hash]")] }),
        new TableRow({ children: [cell("2"), cell("[hash]")] }),
      ],
    }),
  ];
}

// ---------- front and back matter ----------

const banner = () =>
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: [new TableCell({
      shading: { fill: "FCE8E6" },
      margins: { top: 160, bottom: 160, left: 200, right: 200 },
      children: [
        p("AI-ASSISTED DRAFT: REQUIRES REVIEW BY AN ADVOCATE BEFORE ANY USE", { alignment: AlignmentType.CENTER }, { bold: true, color: RED }),
        p("These are starting points, not final notices. Nothing here may be sent until an advocate enrolled with a Bar Council reviews each template and Asmita records that review (reviewedByLegal) in production. Every item highlighted VERIFY must be resolved first.", { alignment: AlignmentType.CENTER }, { size: 20 }),
      ],
    })] })],
  });

const heading = (text, size = 28) => p(text, { alignment: AlignmentType.LEFT, spacing: { before: 240, after: 160 }, keepNext: true }, { bold: true, size, color: BRAND });
const bullet = (text) => new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 80 }, children: runs(text, { size: 22 }) });
const check = (text) => new Paragraph({ spacing: { after: 80 }, indent: { left: 360 }, children: [new TextRun({ text: "☐  ", font: "Segoe UI Symbol" }), ...runs(text, { size: 22 })] });

function frontMatter() {
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 480, after: 120 }, children: [new TextRun({ text: "ASMITA", bold: true, size: 48, color: BRAND, font: FONT, characterSpacing: 80 })] }),
    p("Notice templates for legal review", { alignment: AlignmentType.CENTER, spacing: { after: 60 } }, { size: 32, bold: true }),
    p("Indian law: IT Act 2000, IT Rules 2021 (as amended to 10 February 2026), MeitY NCII SOP (October 2025), BNS 2023, BNSS 2023", { alignment: AlignmentType.CENTER, spacing: { after: 60 } }, { size: 22, color: MUTED }),
    p("Draft of 8 November 2026", { alignment: AlignmentType.CENTER, spacing: { after: 300 } }, { size: 22, color: MUTED }),
    banner(),
    heading("What is in this pack", 24),
    ...templateSeeds.map((t, i) => bullet(`Template ${i + 1}: ${ABOUT[t.templateType]?.title ?? t.templateType} (${t.templateType})`)),
    heading("How to read the highlighting", 24),
    bullet("Grey, in square brackets: a value the app fills in when it sends the notice, or a blank the survivor completes."),
    bullet("Yellow VERIFY tag: the citation was checked against an official source but is not in Asmita's approved sources (PRD Section 4 and the MeitY SOP). The reviewer confirms it or strikes it. In the app the same tag reads CITATION REQUIRED."),
    bullet("The red DRAFT line appears in every template and is removed only after review."),
    heading("Reviewer note", 24),
    p("Sources: IT Rules 2021, MeitY consolidation \"updated as on 10.02.2026\" (meity.gov.in), MeitY FAQ on the 2026 amendment, MeitY NCII SOP v.1 (October 2025), IT Act 2000 (India Code), BNS 2023 and BNSS 2023 (Gazette); checked on 8 November 2026 by two independent AI passes against those sources [regulator site, checked 2026-11-08]. Research connectors: the Descrybe connector in the legal-clinic plugin covers United States law only and was not used for Indian authority. No Indian case-law database was connected; the case cited (Puttaswamy) is from model knowledge and is tagged.", {}, { size: 22 }),
    p("Every correction, the citation register and twelve open decisions are in docs/legal/notice-redraft-2026-11.md.", {}, { size: 22 }),
  ];
}

function backMatter() {
  return [
    new Paragraph({ children: [new PageBreak()] }),
    heading("Reviewer checklist"),
    check("Read each template in full. Does it say what Asmita should say to a platform, or to the police?"),
    check("Every VERIFY item: confirmed against the Gazette or India Code, or struck."),
    check("Rule 3(2)(b): the two-hour period and the words \"prima facie\" and \"all reasonable and practicable measures\" are right as of the date of review."),
    check("Facts about the Complainant: only that she declared she is an adult and verified her email address. Nothing that Asmita does not hold."),
    check("Hash advisory: the search request rests on the SOP, not on Rule 3(2)(b)."),
    check("Police complaint: BNSS section 173 points (any area, woman officer, free copy, Superintendent of Police) are right."),
    check("United States notice and the United States part of the joint notice: checked by a United States practitioner (memo item 6)."),
    check("The twelve decisions in the memo are answered."),
    check("Only then: record the review in production (reviewedByLegal, reviewedByName, reviewedAt) for each template, and set ESCALATION_DRAFTS_REVIEWED for the survivor's copyable wording."),
    heading("What this pack does not do"),
    bullet("It does not decide strategy. It follows the route Asmita uses: a complaint under Rule 3(2)(b), then the Grievance Appellate Committee and the National Cybercrime Reporting Portal."),
    bullet("It does not verify its own legal statements. Every one is a proposition for the reviewer to confirm."),
    bullet("It does not send anything. The app refuses to send a template until it is marked as legally reviewed."),
    heading("Before any of this leaves Asmita"),
    p("Sending a notice to a platform, or handing a police complaint to a survivor, has legal consequences for her. An advocate reviews, edits and approves each template first, and only then is the draft marker removed. This is AI-generated legal information based on Indian law, not legal advice. Recent amendments or judicial developments may not be reflected. The POCSO protocol applies separately for minors; no template here may be used for a minor.", {}, { size: 22 }),
  ];
}

// ---------- assemble ----------

const children = [...frontMatter()];
templateSeeds.forEach((t, i) => {
  const about = ABOUT[t.templateType] ?? { title: t.templateType, use: "" };
  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(p(`TEMPLATE ${i + 1} OF ${templateSeeds.length}  |  ${t.templateType}`, { alignment: AlignmentType.LEFT, spacing: { after: 40 } }, { size: 18, color: MUTED, bold: true }));
  children.push(p(about.title, { alignment: AlignmentType.LEFT, spacing: { after: 40 } }, { size: 26, bold: true, color: BRAND }));
  children.push(p(about.use, { alignment: AlignmentType.LEFT, spacing: { after: 60 } }, { size: 20, italics: true, color: MUTED }));
  children.push(p(`${t.templateType === "FIR_PACKAGE" ? "Subject line" : "Email subject"}: ${t.subjectTemplate}`, { alignment: AlignmentType.LEFT, spacing: { after: 300 }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "DADCE0", space: 8 } } }, { size: 20, color: MUTED }));
  if (t.templateType !== "FIR_PACKAGE") children.push(...letterhead());
  children.push(...bodyParagraphs(t.templateType, t.bodyTemplate));
  children.push(p("Authorities relied on", { alignment: AlignmentType.LEFT, spacing: { before: 360, after: 80 }, keepNext: true, border: { top: { style: BorderStyle.SINGLE, size: 4, color: "DADCE0", space: 8 } } }, { bold: true, size: 20, color: MUTED }));
  for (const c of t.legalCitations) children.push(bullet(c));
});
children.push(...backMatter());

const doc = new Document({
  creator: "Asmita",
  title: "Asmita notice templates for legal review",
  description: "AI-assisted draft generated from prisma/template-seeds.ts. Requires advocate review.",
  styles: { default: { document: { run: { font: FONT, size: 24, color: INK } } } },
  numbering: { config: [{ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] }] },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1300, bottom: 1300, left: 1300, right: 1300 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "AI-ASSISTED DRAFT  |  PENDING LEGAL REVIEW  |  DO NOT DISPATCH", size: 16, color: RED, bold: true, font: FONT })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], size: 16, color: MUTED, font: FONT })] })] }) },
    children,
  }],
});

writeFileSync(OUT, await Packer.toBuffer(doc));
console.log("Wrote", OUT);
