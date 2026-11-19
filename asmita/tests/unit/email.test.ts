import { describe, expect, it } from "vitest";
import {
  createDeletionCompletedEmail,
  createDeletionRequestedEmail,
  createEscalationSentEmail,
  createLegalPackageReadyEmail,
  createNoticeSentEmail,
  createVictimConfirmationEmail,
  getNoticeEmailFrom,
  getTransactionalEmailFrom,
} from "@/lib/email";

describe("createVictimConfirmationEmail", () => {
  it("includes only the case reference and dashboard link", () => {
    const email = createVictimConfirmationEmail("ASMITA-2026-00001", "https://asmita.test/case/case-1");

    expect(email.subject).toContain("ASMITA-2026-00001");
    expect(email.text).toContain("https://asmita.test/case/case-1");
    expect(email.text).toContain("does not include any submitted URLs");
    expect(email.text).not.toContain("instagram.com");
    expect(email.html).toContain("Keep your case reference safe.");
    for (const part of [email.subject, email.text, email.html]) {
      expect(part).not.toMatch(/police|â€”|�/i);
    }
  });

  it("creates privacy-preserving lifecycle emails", () => {
    const dashboardUrl = "https://asmita.test/case/case-1";
    const templates = [
      createNoticeSentEmail("ASMITA-2026-00001", dashboardUrl),
      createEscalationSentEmail("ASMITA-2026-00001", dashboardUrl, 2),
      createLegalPackageReadyEmail("ASMITA-2026-00001", dashboardUrl),
      createDeletionRequestedEmail("ASMITA-2026-00001", "2026-06-12T00:00:00.000Z"),
      createDeletionCompletedEmail("ASMITA-2026-00001"),
    ];

    for (const email of templates) {
      expect(email.subject).toContain("ASMITA-2026-00001");
      expect(email.text).not.toContain("instagram.com");
      expect(email.text).not.toContain("Aadhaar");
    }
  });

  it("separates notice sender and transactional sender configuration", () => {
    const originalNotice = process.env.NOTICE_EMAIL_FROM;
    const originalTransactional = process.env.TRANSACTIONAL_EMAIL_FROM;
    process.env.NOTICE_EMAIL_FROM = "notice@meriasmita.org";
    process.env.TRANSACTIONAL_EMAIL_FROM = "update@meriasmita.org";

    expect(getNoticeEmailFrom()).toBe("notice@meriasmita.org");
    expect(getTransactionalEmailFrom()).toBe("update@meriasmita.org");

    process.env.NOTICE_EMAIL_FROM = originalNotice;
    process.env.TRANSACTIONAL_EMAIL_FROM = originalTransactional;
  });
});

describe("email layouts (redesign)", () => {
  it("a notice letter shows the signed text verbatim and adds no words to it", async () => {
    const { renderNoticeLetterHtml } = await import("@/lib/email-html");
    const text = "To: Grievance Officer\n\n1.  Remove <this> & \"that\".\n\nYours faithfully,\nAsmita";
    const html = renderNoticeLetterHtml("Notice ASMITA-2026-00001", text);
    const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    expect(html).toContain(`white-space:pre-wrap;word-break:break-word;">${escaped}</div>`);
    expect(html).not.toMatch(/<img|https?:\/\/(?!www\.w3)/i);
  });

  it("survivor emails carry no remote resources, a neutral preview line and the safety note", async () => {
    const { renderEmailHtml, SAFETY_NOTE } = await import("@/lib/email-html");
    const html = renderEmailHtml({ title: "Your verification code", paragraphs: ["Enter this code."], highlight: "123456", highlightStyle: "code" });
    expect(html).not.toMatch(/<img|src=|url\(/i);
    expect(html).toContain("A message from Asmita.");
    expect(html).toContain(SAFETY_NOTE.replace(/'/g, "'"));
    expect(html).not.toMatch(/border-left/i);
  });
});
