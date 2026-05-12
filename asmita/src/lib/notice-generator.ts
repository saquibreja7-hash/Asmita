import { sha256 } from "@/lib/hash";

export type NoticeDraftInput = {
  referenceNumber: string;
  platformName: string;
  domain: string;
  submittedAt: string;
};

export type NoticeTemplateInput = Record<string, string | number | boolean | null | undefined>;

const forbiddenNoticeVariables = new Set(["phone", "aadhaar", "aadhaarNumber", "victimPhone"]);

export function renderNoticeTemplate(template: string, variables: NoticeTemplateInput) {
  const missing = new Set<string>();
  const rendered = template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => {
    if (forbiddenNoticeVariables.has(key)) {
      throw new Error(`forbidden_notice_variable:${key}`);
    }
    const value = variables[key];
    if (value === null || value === undefined || value === "") {
      missing.add(key);
      return "";
    }
    return String(value);
  });

  if (missing.size > 0) {
    throw new Error(`missing_notice_variables:${Array.from(missing).sort().join(",")}`);
  }

  return rendered;
}

export function assertNoticeBodySafe(body: string) {
  const forbiddenPatterns = [/\baadhaar\b/i, /\bphone\b/i, /\bmobile\b/i];
  if (forbiddenPatterns.some((pattern) => pattern.test(body))) {
    throw new Error("forbidden_pii_in_notice_body");
  }
}

export function generateNoticeDraft(input: NoticeDraftInput) {
  const subject = `PENDING LEGAL REVIEW: NCII takedown request ${input.referenceNumber}`;
  const body = [
    "PENDING_REVIEW_BY_LEGAL: This draft must not be sent until reviewedByLegal is true.",
    "",
    `Case reference: ${input.referenceNumber}`,
    `Platform: ${input.platformName}`,
    `Domain: ${input.domain}`,
    `Submitted at: ${input.submittedAt}`,
    "",
    "The complainant reports non-consensual intimate content. Please route to the verified grievance process and act under applicable law after legal review.",
  ].join("\n");

  return {
    subject,
    body,
    payloadHash: sha256(body),
    reviewedByLegal: false,
  };
}

export function verifyNoticePayload(body: string, expectedHash: string) {
  return sha256(body) === expectedHash;
}
