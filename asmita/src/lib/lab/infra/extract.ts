import { extractCryptoAddresses } from "@/lib/lab/infra/crypto-address";
import {
  defaultConfidence,
  hostMatches,
  SIGNATURES,
  type LabInfraCategory,
} from "@/lib/lab/infra/signatures";

/*
 * WP114 (research-tools-spec.md): one normalised piece of evidence about a
 * service, produced by a signature match or an extractor. `value` is the
 * stable identifier (host, tag ID, address, URL) and `evidence` is the
 * short human sentence saying what matched, e.g.
 * "script src host js.stripe.com".
 */

export type LabInfraConfidence = "HIGH" | "MEDIUM" | "LOW";

export type ExtractedFinding = {
  category: LabInfraCategory;
  value: string;
  evidence: string;
  confidence: LabInfraConfidence;
  /** Signature provider name, when the finding came from a signature. */
  provider?: string;
};

const MAX_VALUE_LENGTH = 500;
const MAX_MATCHES_PER_SIGNATURE = 10;
/** At most this many link or crypto findings per category from one page. */
const MAX_FINDINGS_PER_CATEGORY = 50;
/** A tag body longer than this is cut there; real attribute lists are far shorter. */
const MAX_TAG_LENGTH = 4_096;

/*
 * The page is a hostile site's HTML (up to 1 MB), so tag scanning must stay
 * linear: a regex like `<tag\b[^>]*\battr=` rescans to the end of the page
 * from every `<tag` when no `>` follows, which is quadratic. This scanner
 * walks each tag body once, stopping at the next `<` or `>` or after
 * MAX_TAG_LENGTH characters, and only then runs a regex over that bounded
 * body.
 */
function tagBodies(html: string, tag: string): string[] {
  const bodies: string[] = [];
  const lower = html.toLowerCase();
  const needle = `<${tag.toLowerCase()}`;
  let index = lower.indexOf(needle);
  while (index !== -1) {
    const start = index + needle.length;
    // `<scripts` is not `<script`: the tag name must end here.
    const nameEnds = start >= lower.length || !/[a-z0-9_:-]/.test(lower[start]);
    let end = start;
    const limit = Math.min(lower.length, start + MAX_TAG_LENGTH);
    while (end < limit) {
      const code = lower.charCodeAt(end);
      if (code === 60 /* < */ || code === 62 /* > */) break;
      end += 1;
    }
    if (nameEnds) bodies.push(html.slice(start, end));
    index = lower.indexOf(needle, Math.max(end, start));
  }
  return bodies;
}

/** Attribute values of one kind, e.g. every `src` of every <script>. */
function attributeValues(html: string, tag: string, attribute: string): string[] {
  const values: string[] = [];
  const pattern = new RegExp(`(?:^|[\\s"'/])${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i");
  for (const body of tagBodies(html, tag)) {
    const match = pattern.exec(body);
    const value = match?.[1] ?? match?.[2] ?? match?.[3];
    if (value) values.push(value);
  }
  return values;
}

/** The text between tags: every `<...>` with no `<` or `>` inside becomes a space (linear). */
function stripTags(html: string): string {
  return html.replace(/<[^<>]*>/g, " ");
}

/** Cheap pre-check before new URL(): a hostile page can carry 100k relative links, and each failed parse throws. */
function isAbsoluteHttp(value: string): boolean {
  return /^\s*https?:/i.test(value);
}

/** Hostnames of the absolute http(s) URLs among the values. */
function hostsOf(values: string[]): { host: string; url: URL }[] {
  const found: { host: string; url: URL }[] = [];
  for (const value of values) {
    if (!isAbsoluteHttp(value)) continue;
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      if (!url.hostname) continue;
      found.push({ host: url.hostname.toLowerCase(), url });
    } catch {
      // Relative or malformed: never fetched, never matched.
    }
  }
  return found;
}

/** Signature matches over the landing-page HTML and its response headers. */
export function extractHtmlFindings(html: string): ExtractedFinding[] {
  const findings: ExtractedFinding[] = [];
  const scriptHosts = hostsOf(attributeValues(html, "script", "src"));
  const linkHosts = [
    ...hostsOf(attributeValues(html, "a", "href")),
    ...hostsOf(attributeValues(html, "link", "href")),
  ];
  const iframeHosts = hostsOf(attributeValues(html, "iframe", "src"));
  const formHosts = hostsOf(attributeValues(html, "form", "action"));

  for (const signature of SIGNATURES) {
    const confidence = signature.confidence ?? defaultConfidence(signature.match);
    const push = (value: string, evidence: string) => {
      if (value) findings.push({ category: signature.category, value, evidence, confidence, provider: signature.provider });
    };
    if (signature.match.type === "scriptHost") {
      for (const { host } of scriptHosts) {
        if (hostMatches(host, signature.match.host)) push(host, `script src host ${host}`);
      }
    } else if (signature.match.type === "linkHost") {
      for (const { host } of linkHosts) {
        if (hostMatches(host, signature.match.host)) push(host, `link href host ${host}`);
      }
    } else if (signature.match.type === "iframeHost") {
      for (const { host } of iframeHosts) {
        if (hostMatches(host, signature.match.host)) push(host, `iframe src host ${host}`);
      }
    } else if (signature.match.type === "formActionHost") {
      for (const { host } of formHosts) {
        if (hostMatches(host, signature.match.host)) push(host, `form action host ${host}`);
      }
    } else if (signature.match.type === "htmlRegex") {
      // htmlRegex: value is the first capture group when present, else the
      // whole match; only the first few distinct matches are kept.
      const regex = new RegExp(signature.match.pattern, "g");
      const seen = new Set<string>();
      for (const match of html.matchAll(regex)) {
        const value = match[1] ?? match[0];
        if (!value) continue;
        if (seen.has(value)) continue;
        seen.add(value);
        push(value, `html match ${value} (${signature.provider})`);
        if (seen.size >= MAX_MATCHES_PER_SIGNATURE) break;
      }
    }
  }

  findings.push(...extractLinkFindings(html));
  findings.push(...extractCryptoFindings(html));
  return dedupe(findings);
}

/** Response-header signatures, e.g. cf-ray for Cloudflare. */
export function extractHeaderFindings(headers: Headers): ExtractedFinding[] {
  const findings: ExtractedFinding[] = [];
  for (const signature of SIGNATURES) {
    if (signature.match.type !== "header") continue;
    const value = headers.get(signature.match.name);
    if (value === null) continue;
    const regex = new RegExp(signature.match.regex);
    if (!regex.test(value)) continue;
    const confidence = signature.confidence ?? defaultConfidence(signature.match);
    findings.push({
      category: signature.category,
      value: signature.provider,
      evidence: `response header ${signature.match.name}`,
      confidence,
      provider: signature.provider,
    });
  }
  return dedupe(findings);
}

/* ---- extractors the spec asks for, beyond the signature list ---- */

// Mainstream public social platforms, as the complaint workflow's platform
// table already names them; a link to one is a SOCIAL_LINK finding.
const SOCIAL_HOSTS = new Set([
  "facebook.com",
  "instagram.com",
  "threads.net",
  "twitter.com",
  "x.com",
  "youtube.com",
  "tiktok.com",
  "snapchat.com",
  "reddit.com",
  "pinterest.com",
  "linkedin.com",
  "medium.com",
  "whatsapp.com",
]);

const TELEGRAM_HOSTS = new Set(["t.me", "telegram.me"]);
const APP_STORE_HOSTS = new Set(["play.google.com", "apps.apple.com"]);
const MODEL_REPO_HOSTS = new Set(["huggingface.co", "civitai.com"]);
const REFERRAL_PARAMS = new Set(["ref", "aff", "via"]);

function hostOf(url: URL): string {
  return url.hostname.toLowerCase();
}

/** One link-based finding per absolute http(s) URL in the page. */
function extractLinkFindings(html: string): ExtractedFinding[] {
  const findings: ExtractedFinding[] = [];
  const hrefs = [
    ...attributeValues(html, "a", "href"),
    ...attributeValues(html, "link", "href"),
    ...attributeValues(html, "iframe", "src"),
  ];
  for (const href of hrefs) {
    if (!isAbsoluteHttp(href)) continue;
    let url: URL;
    try {
      url = new URL(href);
    } catch {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    const host = hostOf(url);
    const registrable = host.split(".").slice(-2).join(".");

    if (TELEGRAM_HOSTS.has(host) || TELEGRAM_HOSTS.has(registrable)) {
      const segments = url.pathname.split("/").filter(Boolean);
      const last = segments[segments.length - 1] ?? "";
      const isBot = last.toLowerCase().endsWith("bot");
      findings.push({
        category: "TELEGRAM_LINK",
        value: shortUrl(url),
        evidence: isBot ? `telegram bot link ${shortUrl(url)}` : `telegram link ${shortUrl(url)}`,
        confidence: "HIGH",
      });
      continue;
    }
    if (APP_STORE_HOSTS.has(host)) {
      const store = host === "play.google.com" ? "Google Play" : "Apple App Store";
      findings.push({ category: "APP_STORE_LINK", value: shortUrl(url), evidence: `app store link (${store})`, confidence: "HIGH" });
      continue;
    }
    if (MODEL_REPO_HOSTS.has(host) || MODEL_REPO_HOSTS.has(registrable)) {
      findings.push({ category: "MODEL_REPO_LINK", value: shortUrl(url), evidence: `model repository link ${shortUrl(url)}`, confidence: "HIGH" });
      continue;
    }
    if (SOCIAL_HOSTS.has(host) || SOCIAL_HOSTS.has(registrable)) {
      findings.push({ category: "SOCIAL_LINK", value: shortUrl(url), evidence: `social link ${shortUrl(url)}`, confidence: "MEDIUM" });
      continue;
    }
    // Referral or affiliate parameter on an outbound link.
    for (const [key] of url.searchParams) {
      if (REFERRAL_PARAMS.has(key.toLowerCase())) {
        findings.push({
          category: "REFERRAL_LINK",
          value: shortUrl(url),
          evidence: `referral link (parameter ${key})`,
          confidence: "MEDIUM",
        });
        break;
      }
    }
  }
  return capPerCategory(findings);
}

/** Crypto addresses in visible text and links, checksum-validated. */
function extractCryptoFindings(html: string): ExtractedFinding[] {
  const visibleText = stripTags(html);
  const linkText = attributeValues(html, "a", "href").join(" ");
  const findings: ExtractedFinding[] = [];
  for (const address of extractCryptoAddresses(`${visibleText} ${linkText}`)) {
    findings.push({
      category: "CRYPTO_ADDRESS",
      value: address.value,
      evidence: `crypto address (${address.kind})`,
      confidence: "HIGH",
    });
  }
  return capPerCategory(findings);
}

/** A URL trimmed to a sane finding length, without credentials or fragment. */
function shortUrl(url: URL): string {
  const clone = new URL(url.toString());
  clone.username = "";
  clone.password = "";
  clone.hash = "";
  const text = clone.toString();
  // The store refuses values over MAX_VALUE_LENGTH, so the ellipsis fits inside it.
  return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH - 1)}…` : text;
}

/** Distinct findings, at most MAX_FINDINGS_PER_CATEGORY per category: a page stuffed with links cannot flood the registry. */
function capPerCategory(findings: ExtractedFinding[]): ExtractedFinding[] {
  const counts = new Map<string, number>();
  const kept: ExtractedFinding[] = [];
  for (const finding of dedupe(findings)) {
    const count = counts.get(finding.category) ?? 0;
    if (count >= MAX_FINDINGS_PER_CATEGORY) continue;
    counts.set(finding.category, count + 1);
    kept.push(finding);
  }
  return kept;
}

/** One finding per (category, value), first evidence wins. */
function dedupe(findings: ExtractedFinding[]): ExtractedFinding[] {
  const seen = new Map<string, ExtractedFinding>();
  for (const finding of findings) {
    const key = `${finding.category}:${finding.value}`;
    if (!seen.has(key)) seen.set(key, finding);
  }
  return [...seen.values()];
}
