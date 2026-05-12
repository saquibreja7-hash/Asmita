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
    process.env.NOTICE_EMAIL_FROM = "notices@asmita.in";
    process.env.TRANSACTIONAL_EMAIL_FROM = "updates@asmita.in";

    expect(getNoticeEmailFrom()).toBe("notices@asmita.in");
    expect(getTransactionalEmailFrom()).toBe("updates@asmita.in");

    process.env.NOTICE_EMAIL_FROM = originalNotice;
    process.env.TRANSACTIONAL_EMAIL_FROM = originalTransactional;
  });
});
