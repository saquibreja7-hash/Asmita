// HTML email layouts: survivor emails and the letter wrapper for notices.
//
// Design constraints (deliberate, do not "improve" away):
// - Discreet: the only image is Asmita's own logo, from Asmita's own domain
//   (owner decision), with alt text that reads "Asmita" when images are
//   blocked. The hidden preheader (what a lock screen or inbox list shows
//   after the subject) is neutral and never says what Asmita is about.
// - Table layout + inline styles: Gmail and Outlook strip most <style>. The
//   one <style> block only adds dark-mode colours where clients honour it.
// - No other remote resources (no fonts, no third-party images, no tracking
//   parameters): the email reads fully with images blocked.
// - A plain-text part is always sent alongside (built by the callers).
// - No coloured left-border accent stripes (owner rule).

const BRAND = "#0f5f58"; // Asmita teal
const BRAND_SOFT = "#eaf4f2";
const INK = "#1c2321";
const TEXT = "#3a4442";
const MUTED = "#6b7672";
const LINE = "#e6e2da";
const PAGE = "#f3f4f2"; // a quiet paper grey behind the letter
const CARD = "#ffffff";

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans','Noto Sans Devanagari',Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";

/** Shown at the foot of every survivor email. */
export const SAFETY_NOTE =
  "Asmita will never ask for your password, your images or any payment. If someone else can see this inbox, you can delete this email.";

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
  /** Optional value set apart in a box: a sign-in code or a case reference. */
  highlight?: string;
  /** Optional small label above the highlight, e.g. "Case reference". */
  highlightLabel?: string;
  /** "code" shows the highlight large and spaced, for a one-time code. */
  highlightStyle?: "code" | "reference";
  /** Optional call-to-action button; its address is also shown as text. */
  cta?: { label: string; url: string };
  /** Footer line(s), such as the privacy note. The safety note is always added. */
  footerNotes?: string[];
  /** Neutral text inbox lists show after the subject. Never name the issue. */
  preheader?: string;
  /** Document language. */
  lang?: "en" | "hi";
  /**
   * No link and no web address anywhere, not even the logo image or the
   * sign-off's site address: for emails that must name no website (the watch
   * "copy found" email). The wordmark is then plain styled text.
   */
  noLinks?: boolean;
};

/** Asmita's logo, served from Asmita's own site (the site header logo, cropped to its edges). */
function logoUrl() {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://meriasmita.org").replace(/\/+$/, "");
  return `${base}/asmita-email-logo.png`;
}

function wordmark(noLinks = false) {
  if (noLinks) {
    return `<span style="display:inline-block;font-family:${SANS};font-size:22px;font-weight:600;line-height:42px;letter-spacing:-0.4px;color:${BRAND};">asmita</span>`;
  }
  // 316x112 source shown at 120x42 (sharp on phones). The alt text is styled
  // so a blocked image still reads as the wordmark.
  return `<img src="${escapeHtml(logoUrl())}" width="120" height="42" alt="Asmita" style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:120px;font-family:${SANS};font-size:22px;font-weight:600;line-height:42px;color:${BRAND};">`;
}

/** Today's date in India, e.g. "26 Nov 2026", shown top right like a letter. */
function letterDate() {
  return new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
}

function signoff(noLinks = false) {
  const close = `<p class="a-text" style="margin:0;font-size:16px;line-height:1.75;color:${TEXT};">With care,<br><strong class="a-ink" style="color:${INK};">Team Asmita</strong></p>`;
  if (noLinks) return close;
  return `${close}
    <p style="margin:4px 0 0 0;font-size:13px;"><a href="https://meriasmita.org" class="a-brand" style="color:${BRAND};text-decoration:none;font-weight:600;">meriasmita.org</a></p>`;
}

// The "quiet letter" layout (owner choice, 2026-11-26): no colour blocks or
// banners, the logo and date at the top, the message as a short note, a
// hairline above the footer. Discreet on a shared phone.
function shell(input: { lang: string; preheader: string; body: string; footer: string; signoff: string; noLinks?: boolean; dated?: boolean }) {
  // The preheader padding keeps inbox previews from pulling body text.
  const preheader = `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(input.preheader)}${"&#8199;&#65279;&#847;".repeat(40)}</div>`;
  const date = input.dated ? `<td align="right" class="a-muted" style="font-family:${SANS};font-size:12px;color:${MUTED};">${escapeHtml(letterDate())}</td>` : "";
  return `<!doctype html>
<html lang="${input.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
  @media (prefers-color-scheme: dark) {
    .a-page { background:#121615 !important; }
    .a-card { background:#1b2120 !important; }
    .a-ink { color:#eef2f1 !important; }
    .a-text { color:#c9d2cf !important; }
    .a-muted { color:#94a19d !important; }
    .a-box { background:#173330 !important; border-color:#24504b !important; }
    .a-brand { color:#7fd1c5 !important; }
    .a-line { border-color:#2c3533 !important; }
    .a-logo { background:#ffffff !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${PAGE};" class="a-page">
  ${preheader}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="a-page" style="background:${PAGE};">
    <tr><td align="center" style="padding:28px 12px 36px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="a-card" style="max-width:540px;background:${CARD};border-radius:8px;">
        <tr><td style="padding:30px 34px 0 34px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td align="left"><span class="a-logo" style="display:inline-block;border-radius:6px;">${wordmark(input.noLinks)}</span></td>
            ${date}
          </tr></table>
        </td></tr>
        <tr><td style="padding:26px 34px 4px 34px;font-family:${SANS};">${input.body}</td></tr>
        ${input.signoff ? `<tr><td style="padding:6px 34px 0 34px;font-family:${SANS};">${input.signoff}</td></tr>` : ""}
        ${input.footer ? `<tr><td style="padding:24px 34px 30px 34px;font-family:${SANS};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="a-line" style="border-top:1px solid ${LINE};padding-top:16px;">${input.footer}</td></tr></table></td></tr>` : `<tr><td style="padding:0 0 26px 0;"></td></tr>`}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Survivor-facing email: a short note, an optional boxed value and a link. */
export function renderEmailHtml(input: EmailHtmlInput): string {
  const paragraphs = input.paragraphs
    .map((p) => `<p class="a-text" style="margin:0 0 18px 0;font-size:16px;line-height:1.75;color:${TEXT};">${escapeHtml(p)}</p>`)
    .join("");

  let highlight = "";
  if (input.highlight) {
    const isCode = input.highlightStyle === "code";
    const label = input.highlightLabel
      ? `<p class="a-muted" style="margin:0 0 8px 0;font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${MUTED};">${escapeHtml(input.highlightLabel)}</p>`
      : "";
    const value = `<p class="a-brand" style="margin:0;font-family:${MONO};font-size:${isCode ? "32px" : "19px"};font-weight:700;letter-spacing:${isCode ? "0.26em" : "0.04em"};line-height:1.25;color:${BRAND};">${escapeHtml(input.highlight)}</p>`;
    highlight = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 24px 0;">
      <tr><td class="a-box" align="left" style="background:${BRAND_SOFT};border:1px solid #d6e8e4;border-radius:10px;padding:${isCode ? "20px 22px" : "16px 20px"};">${label}${value}</td></tr>
    </table>`;
  }

  // A plain underlined link, like a note, with the address written out for
  // clients that strip links.
  const cta = input.cta
    ? `<p style="margin:0 0 6px 0;font-size:16px;line-height:1.75;"><a href="${escapeHtml(input.cta.url)}" class="a-brand" style="color:${BRAND};font-weight:600;text-decoration:underline;text-underline-offset:3px;">${escapeHtml(input.cta.label)}</a></p>
       <p class="a-muted" style="margin:0 0 24px 0;font-size:12px;line-height:1.6;color:${MUTED};word-break:break-all;">${escapeHtml(input.cta.url)}</p>`
    : "";

  const footer = [...(input.footerNotes ?? []), SAFETY_NOTE]
    .map((n) => `<p class="a-muted" style="margin:0 0 6px 0;font-size:12px;line-height:1.6;color:${MUTED};">${escapeHtml(n)}</p>`)
    .join("");

  const body = `<p class="a-ink" style="margin:0 0 16px 0;font-size:19px;font-weight:700;line-height:1.4;color:${INK};">${escapeHtml(input.title)}</p>
    ${paragraphs}
    ${highlight}
    ${cta}`;

  return shell({
    lang: input.lang ?? "en",
    preheader: input.preheader ?? "A message from Asmita.",
    body,
    footer,
    signoff: signoff(input.noLinks),
    noLinks: input.noLinks,
    dated: true,
  });
}

/**
 * A formal notice to a platform, as a letter. The body is the plain-text
 * notice exactly as sent and signed, shown verbatim (escaped, line breaks
 * kept): no text is added, removed or reworded, so the HTML and text parts
 * and the signed PDF cover the same content (CLAUDE.md, notice integrity).
 */
export function renderNoticeLetterHtml(subject: string, text: string): string {
  const body = `<p class="a-muted" style="margin:0 0 6px 0;font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${MUTED};">Notice</p>
    <p class="a-ink" style="margin:0 0 22px 0;font-size:18px;font-weight:600;line-height:1.4;color:${INK};">${escapeHtml(subject)}</p>
    <div class="a-text" style="margin:0 0 18px 0;font-family:${SERIF};font-size:15px;line-height:1.65;color:${TEXT};white-space:pre-wrap;word-break:break-word;">${escapeHtml(text).replace(/\r\n|\n/g, "<br>")}</div>`;
  // No Asmita sign-off block: the signed text carries its own sign-off.
  return shell({ lang: "en", preheader: subject, body, footer: "", signoff: "" });
}
