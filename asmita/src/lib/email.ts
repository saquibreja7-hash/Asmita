import { Resend } from "resend";
import { renderEmailHtml } from "@/lib/email-html";

const PRIVACY_NOTE = "For your privacy, this email contains no submitted URLs or personal information.";

let resend: Resend | null = null;

export type EmailSendResult = {
  id?: string;
  data?: { id?: string } | null;
};

function getResend() {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY || "re_dev_placeholder");
  }
  return resend;
}

export function getTransactionalEmailFrom() {
  return process.env.TRANSACTIONAL_EMAIL_FROM || process.env.RESEND_FROM_EMAIL || "Asmita <Update@meriasmita.org>";
}

export function getNoticeEmailFrom() {
  return process.env.NOTICE_EMAIL_FROM || process.env.EMAIL_FROM || "Asmita <Notice@meriasmita.org>";
}

export async function sendOtp(to: string, otp: string) {
  if (!process.env.RESEND_API_KEY) {
    return { id: `dev-otp-${otp}` };
  }
  return assertEmailSent(await getResend().emails.send({
    from: getTransactionalEmailFrom(),
    to,
    subject: "Your Asmita verification code",
    text: `Your Asmita verification code is ${otp}. It expires in 10 minutes.`,
    html: renderEmailHtml({
      title: "Your verification code",
      paragraphs: ["Enter this code to continue. It expires in 10 minutes."],
      highlight: otp,
      highlightLabel: "Verification code",
      footerNotes: ["If you did not request this code, you can safely ignore this email."],
    }),
  }));
}

export async function sendNoticeDraft(
  to: string,
  subject: string,
  text: string,
  attachments?: { filename: string; content: Buffer }[],
  // Resend keeps a key for 24 hours: a retry with the same key never sends a
  // second email, so a crash between sending and recording cannot double-send.
  idempotencyKey?: string,
) {
  if (!process.env.RESEND_API_KEY) {
    return { id: "dev-notice-message" };
  }
  return assertEmailSent(await getResend().emails.send({
    from: getNoticeEmailFrom(),
    to,
    subject,
    text,
    ...(attachments?.length ? { attachments } : {}),
  }, idempotencyKey ? { idempotencyKey } : undefined));
}

export function createVictimConfirmationEmail(referenceNumber: string, dashboardUrl: string) {
  const subject = `Asmita case ${referenceNumber}`;
  const text = [
    `Your Asmita case has been created: ${referenceNumber}.`,
    `You can track progress here: ${dashboardUrl}`,
    "For privacy, this email does not include any submitted URLs.",
  ].join("\n");
  const html = renderEmailHtml({
    title: "Your case has been created.",
    paragraphs: [
      "We have received your submission. You can check its progress from your dashboard.",
      "Keep your case reference safe. You can use it if you contact us about your case.",
    ],
    highlight: referenceNumber,
    highlightLabel: "Case reference",
    cta: { label: "Open your dashboard", url: dashboardUrl },
    footerNotes: [PRIVACY_NOTE],
  });
  return { subject, text, html };
}

export function createNoticeSentEmail(referenceNumber: string, dashboardUrl: string) {
  return {
    subject: `Notice sent for Asmita case ${referenceNumber}`,
    text: [
      `A notice has been sent for your Asmita case: ${referenceNumber}.`,
      `You can track progress here: ${dashboardUrl}`,
      "For privacy, this email does not include submitted URLs.",
    ].join("\n"),
  };
}

export function createEscalationSentEmail(referenceNumber: string, dashboardUrl: string, level: 1 | 2 | 3) {
  return {
    subject: `Escalation update for Asmita case ${referenceNumber}`,
    text: [
      `Escalation level ${level} has been recorded for your Asmita case: ${referenceNumber}.`,
      `You can track progress here: ${dashboardUrl}`,
      "If the case reaches the 7-day point, your legal support package will be available from the dashboard.",
    ].join("\n"),
  };
}

export type Locale = "en" | "hi";

export function createL2VictimNotificationEmail(
  referenceNumber: string,
  dashboardUrl: string,
  locale: Locale = "en",
) {
  // English only for now, like the other escalation emails.
  void locale;
  const lines = [
    "The platform has not removed the content in the time it is given after a notice.",
    "Your dashboard now shows what you can do next, such as a complaint on the National Cybercrime Reporting Portal, and when each step opens.",
    "If the content has already gone, mark it as removed on your dashboard and these updates will stop.",
  ];
  return {
    subject: `Update on Asmita case ${referenceNumber}`,
    text: [
      "Hello,",
      "",
      `An update on Asmita case ${referenceNumber}.`,
      "",
      ...lines.flatMap((line) => [line, ""]),
      `Open your dashboard: ${dashboardUrl}`,
      "",
      "For privacy, this email contains no submitted URLs or personal information.",
    ].join("\n"),
    html: renderEmailHtml({
      title: "An update on your case.",
      paragraphs: lines,
      highlight: referenceNumber,
      highlightLabel: "Case reference",
      cta: { label: "See your next steps", url: dashboardUrl },
      footerNotes: [PRIVACY_NOTE],
    }),
  };
}

export async function sendL2VictimNotification(
  to: string,
  referenceNumber: string,
  dashboardUrl: string,
  locale: Locale = "en",
  // The escalation sweep runs hourly: the key stops a retry from emailing twice.
  idempotencyKey?: string,
) {
  const { subject, text, html } = createL2VictimNotificationEmail(referenceNumber, dashboardUrl, locale);
  if (!process.env.RESEND_API_KEY) {
    return { id: `dev-l2-${referenceNumber}` };
  }
  return assertEmailSent(await getResend().emails.send({
    from: getTransactionalEmailFrom(),
    to,
    subject,
    text,
    html,
  }, idempotencyKey ? { idempotencyKey } : undefined));
}

export function createL3FirReadyEmail(
  referenceNumber: string,
  dashboardUrl: string,
  locale: Locale = "en",
) {
  // English only for now, like the other escalation emails.
  void locale;
  const lines = [
    "A week has passed and the content has not been marked as removed.",
    // MeitY NCII SOP: with no response from the grievance officer in time, the
    // complainant may appeal to the GAC (Rule 3A) or report on cybercrime.gov.in.
    "You can now appeal to the Grievance Appellate Committee, the government body that hears appeals when a platform does not act, and report it on the National Cybercrime Reporting Portal. Your dashboard has the steps, the official links and the dates.",
    "If the content has already gone, mark it as removed on your dashboard and these updates will stop.",
  ];
  return {
    subject: `Next steps for Asmita case ${referenceNumber}`,
    text: [
      "Hello,",
      "",
      `An update on Asmita case ${referenceNumber}.`,
      "",
      ...lines.flatMap((line) => [line, ""]),
      `Open your dashboard: ${dashboardUrl}`,
      "",
      "For privacy, this email contains no submitted URLs or personal information.",
    ].join("\n"),
    html: renderEmailHtml({
      title: "Your next steps are ready.",
      paragraphs: lines,
      highlight: referenceNumber,
      highlightLabel: "Case reference",
      cta: { label: "See your next steps", url: dashboardUrl },
      footerNotes: [PRIVACY_NOTE],
    }),
  };
}

export async function sendL3FirReadyNotification(
  to: string,
  referenceNumber: string,
  dashboardUrl: string,
  locale: Locale = "en",
  idempotencyKey?: string,
) {
  const { subject, text, html } = createL3FirReadyEmail(referenceNumber, dashboardUrl, locale);
  if (!process.env.RESEND_API_KEY) {
    return { id: `dev-l3-${referenceNumber}` };
  }
  return assertEmailSent(await getResend().emails.send({
    from: getTransactionalEmailFrom(),
    to,
    subject,
    text,
    html,
  }, idempotencyKey ? { idempotencyKey } : undefined));
}

export function createLegalPackageReadyEmail(referenceNumber: string, dashboardUrl: string) {
  return {
    subject: `Legal package ready for Asmita case ${referenceNumber}`,
    text: [
      `Your 7-day legal support package is ready for case ${referenceNumber}.`,
      `Download it from your dashboard: ${dashboardUrl}`,
      "The package summarizes case activity and does not include intimate image or video files.",
    ].join("\n"),
  };
}

export function createDeletionRequestedEmail(referenceNumber: string, hardDeleteAfter: string) {
  return {
    subject: `Deletion scheduled for Asmita case ${referenceNumber}`,
    text: [
      `Deletion has been scheduled for Asmita case ${referenceNumber}.`,
      `Hard deletion is scheduled after: ${hardDeleteAfter}`,
      "Audit metadata for the deletion request may be retained for integrity and compliance.",
    ].join("\n"),
  };
}

export function createDeletionCompletedEmail(referenceNumber: string) {
  return {
    subject: `Deletion completed for Asmita case ${referenceNumber}`,
    text: [
      `Hard deletion has completed for Asmita case ${referenceNumber}.`,
      "Audit metadata for the deletion action may remain, but case PII has been removed.",
    ].join("\n"),
  };
}

export async function sendVictimConfirmation(to: string, referenceNumber: string, dashboardUrl: string) {
  const { subject, text, html } = createVictimConfirmationEmail(referenceNumber, dashboardUrl);
  if (!process.env.RESEND_API_KEY) {
    return { id: `dev-confirmation-${referenceNumber}` };
  }
  return assertEmailSent(await getResend().emails.send({
    from: getTransactionalEmailFrom(),
    to,
    subject,
    text,
    html,
  }, { idempotencyKey: `case-confirmation/${referenceNumber}` }));
}

function assertEmailSent(result: unknown): EmailSendResult {
  const response = result as { data?: { id?: string } | null; error?: { name?: string; message?: string } | null };
  // The same idempotency key with a different payload (or still in flight):
  // an earlier attempt already sent, or is sending, this email.
  if (response?.error?.name === "invalid_idempotent_request" || response?.error?.name === "concurrent_idempotent_requests") {
    throw new Error("email_already_sent");
  }
  if (response?.error) {
    throw new Error(`email_send_failed:${response.error.message || "unknown_resend_error"}`);
  }
  return response.data ? { id: response.data.id, data: response.data } : (result as EmailSendResult);
}
