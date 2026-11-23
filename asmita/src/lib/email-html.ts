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
const PAGE = "#eef4f2"; // a soft teal tint behind the card
const BAND = "#e3f0ed"; // light header band, so the teal logo reads in both themes
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

/** Asmita's logo, served from Asmita's own site (the same file as the site header). */
function logoUrl() {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://meriasmita.org").replace(/\/+$/, "");
  return `${base}/asmita-wordmark-v2.png`;
}

function wordmark(noLinks = false) {
  if (noLinks) {
    return `<span style="display:inline-block;font-family:${SERIF};font-size:28px;line-height:47px;color:${BRAND};">Asmita</span>`;
  }
  // 317x94 source shown at 160x47. The alt text is styled so a blocked image
  // still reads as the wordmark.
  return `<img src="${escapeHtml(logoUrl())}" width="160" height="47" alt="Asmita" style="display:inline-block;border:0;outline:none;text-decoration:none;height:auto;max-width:160px;font-family:${SERIF};font-size:28px;line-height:47px;color:${BRAND};">`;
}

function signoff(noLinks = false) {
  const team = `<p class="a-ink" style="margin:0 0 3px 0;font-size:15px;font-weight:700;color:${INK};">Team Asmita</p>`;
  if (noLinks) return team;
  return `${team}
    <p style="margin:2px 0 0 0;font-size:13px;"><a href="https://meriasmita.org" class="a-brand" style="color:${BRAND};text-decoration:none;font-weight:600;">meriasmita.org</a></p>`;
}

function shell(input: { lang: string; preheader: string; body: string; footer: string; signoff: string; noLinks?: boolean }) {
  // The preheader padding keeps inbox previews from pulling body text.
  const preheader = `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(input.preheader)}${"&#8199;&#65279;&#847;".repeat(40)}</div>`;
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
    .a-card { background:#1b2120 !important; border-color:#2c3533 !important; }
    .a-ink { color:#eef2f1 !important; }
    .a-text { color:#c9d2cf !important; }
    .a-muted { color:#94a19d !important; }
    .a-box { background:#173330 !important; border-color:#24504b !important; }
    .a-brand { color:#7fd1c5 !important; }
    .a-line { border-color:#2c3533 !important; }
    .a-band { background:${BAND} !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${PAGE};" class="a-page">
  ${preheader}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="a-page" style="background:${PAGE};">
    <tr><td align="center" style="padding:32px 14px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="a-card" style="background:${CARD};border-radius:18px;overflow:hidden;box-shadow:0 8px 30px rgba(15,79,73,0.10);">
            <tr><td align="center" class="a-band" style="background:${BAND};padding:30px 32px;">${wordmark(input.noLinks)}</td></tr>
            <tr><td style="padding:38px 36px 6px 36px;font-family:${SANS};">${input.body}</td></tr>
            ${input.signoff ? `<tr><td style="padding:0 36px 8px 36px;font-family:${SANS};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="a-line" style="border-top:1px solid ${LINE};padding-top:24px;">${input.signoff}</td></tr></table></td></tr>` : ""}
            ${input.footer ? `<tr><td style="padding:14px 36px 30px 36px;font-family:${SANS};">${input.footer}</td></tr>` : `<tr><td style="padding:0 0 24px 0;"></td></tr>`}
          </table>
        </td></tr>
        <tr><td align="center" style="padding:18px 6px 0 6px;font-family:${SANS};">
          <p class="a-muted" style="margin:0;font-size:12px;line-height:1.6;color:${MUTED};">${input.noLinks ? "Asmita" : "Asmita &middot; meriasmita.org"}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Survivor-facing email: heading, short paragraphs, an optional boxed value and button. */
export function renderEmailHtml(input: EmailHtmlInput): string {
  const paragraphs = input.paragraphs
    .map((p) => `<p class="a-text" style="margin:0 0 16px 0;font-size:16px;line-height:1.7;color:${TEXT};">${escapeHtml(p)}</p>`)
    .join("");

  let highlight = "";
  if (input.highlight) {
    const isCode = input.highlightStyle === "code";
    const label = input.highlightLabel
      ? `<p class="a-muted" style="margin:0 0 10px 0;font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${MUTED};">${escapeHtml(input.highlightLabel)}</p>`
      : "";
    const value = `<p class="a-brand" style="margin:0;font-family:${MONO};font-size:${isCode ? "34px" : "22px"};font-weight:600;letter-spacing:${isCode ? "0.32em" : "0.06em"};line-height:1.2;color:${BRAND};">${escapeHtml(input.highlight)}</p>`;
    highlight = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 22px 0;">
      <tr><td class="a-box" align="${isCode ? "center" : "left"}" style="background:${BRAND_SOFT};border-radius:12px;padding:${isCode ? "24px 16px" : "20px 24px"};">${label}${value}</td></tr>
    </table>`;
  }

  const cta = input.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 14px 0;"><tr><td style="border-radius:999px;background:${BRAND};">
         <a href="${escapeHtml(input.cta.url)}" style="display:inline-block;padding:13px 26px;font-family:${SANS};font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:999px;">${escapeHtml(input.cta.label)}</a>
       </td></tr></table>
       <p class="a-muted" style="margin:0 0 18px 0;font-size:12px;line-height:1.6;color:${MUTED};word-break:break-all;">Or open: ${escapeHtml(input.cta.url)}</p>`
    : "";

  const footer = [...(input.footerNotes ?? []), SAFETY_NOTE]
    .map((n) => `<p class="a-muted" style="margin:0 0 8px 0;font-size:12.5px;line-height:1.6;color:${MUTED};">${escapeHtml(n)}</p>`)
    .join("");

  const body = `<p class="a-ink" style="margin:0 0 20px 0;font-size:23px;font-weight:700;line-height:1.35;letter-spacing:-0.2px;color:${INK};">${escapeHtml(input.title)}</p>
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
