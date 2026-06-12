import { Resend } from "resend";

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
  return process.env.TRANSACTIONAL_EMAIL_FROM || process.env.RESEND_FROM_EMAIL || "updates@meriasmita.org";
}

export function getNoticeEmailFrom() {
  return process.env.NOTICE_EMAIL_FROM || process.env.EMAIL_FROM || "notices@meriasmita.org";
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
  }));
}

export async function sendNoticeDraft(to: string, subject: string, text: string) {
  if (!process.env.RESEND_API_KEY) {
    return { id: "dev-notice-message" };
  }
  return assertEmailSent(await getResend().emails.send({
    from: getNoticeEmailFrom(),
    to,
    subject,
    text,
  }));
}

export function createVictimConfirmationEmail(referenceNumber: string, dashboardUrl: string) {
  const subject = `Asmita case ${referenceNumber}`;
  const text = [
    `Your Asmita case has been created: ${referenceNumber}.`,
    `You can track progress here: ${dashboardUrl}`,
    "For privacy, this email does not include any submitted URLs.",
  ].join("\n");
  return { subject, text };
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
  // Locale is plumbed but Hindi copy is intentionally NOT drafted here.
  // hi-review-status.json policy: trauma-informed survivor communication
  // must be authored by a native Hindi speaker, not auto-translated. When
  // a translated version lands, branch on locale to return it; until then
  // every recipient gets the English text below.
  void locale;
  return {
    subject: `Update on Asmita case ${referenceNumber}`,
    text: [
      "Hello,",
      "",
      `For Asmita case ${referenceNumber}, we sent a notice to the platform 48 hours ago and have not yet received a response.`,
      "",
      "Our team is now reviewing your case. If the platform still has not acted within five more days, we will help prepare a legal support package you can take to the police.",
      "",
      `Open your dashboard: ${dashboardUrl}`,
      "",
      "For privacy, this email contains no submitted URLs or personal information.",
    ].join("\n"),
  };
}

export async function sendL2VictimNotification(
  to: string,
  referenceNumber: string,
  dashboardUrl: string,
  locale: Locale = "en",
) {
  const { subject, text } = createL2VictimNotificationEmail(referenceNumber, dashboardUrl, locale);
  if (!process.env.RESEND_API_KEY) {
    return { id: `dev-l2-${referenceNumber}` };
  }
  return assertEmailSent(await getResend().emails.send({
    from: getTransactionalEmailFrom(),
    to,
    subject,
    text,
  }));
}

export function createL3FirReadyEmail(
  referenceNumber: string,
  dashboardUrl: string,
  pdfDownloadUrl: string,
  locale: Locale = "en",
) {
  // Hindi copy intentionally not drafted here. See createL2VictimNotificationEmail.
  void locale;
  return {
    subject: `Legal support package ready for Asmita case ${referenceNumber}`,
    text: [
      "Hello,",
      "",
      `Seven days have passed since we sent the takedown notice for Asmita case ${referenceNumber} without resolution.`,
      "",
      "Your legal support package is now ready. You can take this PDF to the police when filing a First Information Report (FIR), or to a lawyer.",
      "",
      `Download the PDF: ${pdfDownloadUrl}`,
      `View your case dashboard: ${dashboardUrl}`,
      "",
      "The package summarizes case activity and does not include any intimate images or videos. For privacy, this email contains no submitted URLs.",
    ].join("\n"),
  };
}

export async function sendL3FirReadyNotification(
  to: string,
  referenceNumber: string,
  dashboardUrl: string,
  pdfDownloadUrl: string,
  locale: Locale = "en",
) {
  const { subject, text } = createL3FirReadyEmail(referenceNumber, dashboardUrl, pdfDownloadUrl, locale);
  if (!process.env.RESEND_API_KEY) {
    return { id: `dev-l3-${referenceNumber}` };
  }
  return assertEmailSent(await getResend().emails.send({
    from: getTransactionalEmailFrom(),
    to,
    subject,
    text,
  }));
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
  const { subject, text } = createVictimConfirmationEmail(referenceNumber, dashboardUrl);
  if (!process.env.RESEND_API_KEY) {
    return { id: `dev-confirmation-${referenceNumber}` };
  }
  return assertEmailSent(await getResend().emails.send({
    from: getTransactionalEmailFrom(),
    to,
    subject,
    text,
  }));
}

function assertEmailSent(result: unknown): EmailSendResult {
  const response = result as { data?: { id?: string } | null; error?: { message?: string } | null };
  if (response?.error) {
    throw new Error(`email_send_failed:${response.error.message || "unknown_resend_error"}`);
  }
  return response.data ? { id: response.data.id, data: response.data } : (result as EmailSendResult);
}
