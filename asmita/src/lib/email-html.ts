// Survivor-facing HTML email layout.
//
// Design constraints (deliberate, do not "improve" away):
// - Discreet: no imagery, no large logo, nothing that reveals the email's
//   purpose from a lock-screen preview or a shared family inbox at a glance.
// - Table layout + inline styles only: Gmail/Outlook strip <style> blocks.
// - No external resources (no remote images/fonts): avoids tracking-pixel
//   appearance and renders fully with images blocked.
// - Plain-text part is always sent alongside (built by the callers).

const TEAL = "#0f766e";
const INK = "#1f2937";
const MUTED = "#6b7280";
const HAIRLINE = "#e5e7eb";
const BG = "#f4f4f5";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type EmailHtmlInput = {
  /** Short heading inside the card, e.g. "Your case has been created." */
  title: string;
  /** Paragraphs of body copy. Rendered in order. */
  paragraphs: string[];
  /** Optional large monospace value (case reference or OTP code). */
  highlight?: string;
  /** Optional small label above the highlight, e.g. "Case reference". */
  highlightLabel?: string;
  /** Optional call-to-action button. */
  cta?: { label: string; url: string };
  /** Footer line(s); the privacy note belongs here. */
  footerNotes?: string[];
};

export function renderEmailHtml(input: EmailHtmlInput): string {
  const paragraphs = input.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.7;color:${INK};">${escapeHtml(p)}</p>`,
    )
    .join("");

  const highlight = input.highlight
    ? `${
        input.highlightLabel
          ? `<p style="margin:18px 0 6px 0;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${MUTED};">${escapeHtml(input.highlightLabel)}</p>`
          : ""
      }<p style="margin:0 0 18px 0;font-family:Consolas,Menlo,monospace;font-size:22px;letter-spacing:0.08em;color:${TEAL};">${escapeHtml(input.highlight)}</p>`
    : "";

  const cta = input.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px 0;"><tr><td style="border-radius:10px;background:${TEAL};">
         <a href="${escapeHtml(input.cta.url)}" style="display:inline-block;padding:11px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(input.cta.label)}</a>
       </td></tr></table>`
    : "";

  const footer = (input.footerNotes ?? [])
    .map(
      (n) =>
        `<p style="margin:0 0 6px 0;font-size:12px;line-height:1.6;color:${MUTED};">${escapeHtml(n)}</p>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:${BG};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid ${HAIRLINE};border-radius:14px;">
        <tr><td style="padding:28px 32px 8px 32px;">
          <p style="margin:0 0 22px 0;font-size:13px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${TEAL};">Asmita</p>
          <p style="margin:0 0 16px 0;font-size:19px;font-weight:600;line-height:1.4;color:${INK};">${escapeHtml(input.title)}</p>
          ${paragraphs}
          ${highlight}
          ${cta}
        </td></tr>
        <tr><td style="padding:14px 32px 24px 32px;border-top:1px solid ${HAIRLINE};">
          ${footer}
        </td></tr>
      </table>
      <p style="margin:14px 0 0 0;font-size:11px;color:${MUTED};">Asmita &middot; meriasmita.org &middot; free and confidential</p>
    </td></tr>
  </table>
</body>
</html>`;
}
