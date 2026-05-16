import { sha256 } from "@/lib/hash";

export type NoticeDraftInput = {
  referenceNumber: string;
  platformName: string;
  domain: string;
  submittedAt: string;
};

export type NoticeTemplateInput = Record<
  string,
  string | number | boolean | null | undefined
>;

const forbiddenNoticeVariables = new Set([
  "phone",
  "aadhaar",
  "aadhaarNumber",
  "victimPhone",
]);

const MAX_TEMPLATE_LENGTH = 20_000;
const MAX_VARIABLE_LENGTH = 2_000;
const MAX_RENDERED_LENGTH = 40_000;

// Strips ASCII control characters that would break SMTP headers, PDF
// rendering, or terminal output. Allows tab, LF, and CR.
const FORBIDDEN_CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

export function renderNoticeTemplate(
  template: string,
  variables: NoticeTemplateInput
) {
  if (template.length > MAX_TEMPLATE_LENGTH) {
    throw new Error("notice_template_too_long");
  }

  const missing = new Set<string>();
  const rendered = template.replace(
    /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g,
    (_match, key: string) => {
      if (forbiddenNoticeVariables.has(key)) {
        throw new Error(`forbidden_notice_variable:${key}`);
      }
      const value = variables[key];
      if (value === null || value === undefined || value === "") {
        missing.add(key);
        return "";
      }
      const asString = String(value);
      if (asString.length > MAX_VARIABLE_LENGTH) {
        throw new Error(`notice_variable_too_long:${key}`);
      }
      if (FORBIDDEN_CONTROL_CHARS.test(asString)) {
        throw new Error(`notice_variable_control_chars:${key}`);
      }
      return asString;
    }
  );

  if (missing.size > 0) {
    throw new Error(
      `missing_notice_variables:${Array.from(missing).sort().join(",")}`
    );
  }

  if (rendered.length > MAX_RENDERED_LENGTH) {
    throw new Error("notice_rendered_too_long");
  }

  return rendered;
}

export function assertNoticeBodySafe(body: string) {
  const forbiddenPatterns = [/\baadhaar\b/i, /\bphone\b/i, /\bmobile\b/i];
  if (forbiddenPatterns.some((pattern) => pattern.test(body))) {
    throw new Error("forbidden_pii_in_notice_body");
  }
  if (FORBIDDEN_CONTROL_CHARS.test(body)) {
    throw new Error("forbidden_control_chars_in_notice_body");
  }
}

/**
 * Subjects are sent in SMTP headers. CR or LF in a subject would let an
 * attacker inject additional headers (BCC, X-Custom, etc.). Reject any
 * subject containing newline characters or other control bytes.
 */
export function assertNoticeSubjectSafe(subject: string) {
  if (subject.length === 0 || subject.length > 998) {
    throw new Error("notice_subject_length");
  }
  if (/[\r\n]/.test(subject) || FORBIDDEN_CONTROL_CHARS.test(subject)) {
    throw new Error("notice_subject_control_chars");
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

  assertNoticeSubjectSafe(subject);
  assertNoticeBodySafe(body);

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
