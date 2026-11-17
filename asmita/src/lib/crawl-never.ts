/*
 * Hosts that must never become a crawl source through the automatic paths
 * (a survivor's submitted link, an approved crawler finding, later a
 * discovered link). This is the built-in half of the never-crawl list; the
 * other half is the CrawlBlockedHost table, which admins manage
 * (full-crawler spec WP1/WP2).
 *
 * Why these categories: sites with their own reporting and hash-matching
 * flows (social platforms), sites whose pages are login-walled or useless to
 * a public-page crawler (webmail, banks, payments, app stores), sites a
 * crawler must never touch at all (government, Asmita itself), and news wires
 * whose only images are editorial. Nothing here stops a SUPER_ADMIN from
 * adding a host by hand; it stops the automatic paths only.
 *
 * A host matches if it equals an entry or is a subdomain of one. Entries may
 * use a single leading "*." and, for registrable-domain patterns like
 * "*.gov.*", one trailing ".*": "*.gov.*" then means "any hostname with a
 * label 'gov'"; "*.nic.in" means nic.in and anything under it.
 *
 * Pure module, no imports, so any path can use it. Hostnames must arrive
 * lowercased with no trailing dot (normalizeNeverCrawlHost).
 */

export const NEVER_CRAWL_HOSTS: readonly string[] = [
  // Major social platforms
  "facebook.com",
  "instagram.com",
  "threads.net",
  "x.com",
  "twitter.com",
  "tiktok.com",
  "snapchat.com",
  "reddit.com",
  "pinterest.com",
  "tumblr.com",
  "linkedin.com",
  "youtube.com",
  "whatsapp.com",
  "telegram.org",
  "discord.com",
  "discord.gg",
  "medium.com",
  "quora.com",
  "vk.com",
  "weibo.com",
  "mastodon.social",
  "bsky.app",
  // Search engines
  "google.com",
  "bing.com",
  "duckduckgo.com",
  "yahoo.com",
  "yandex.com",
  "yandex.ru",
  "baidu.com",
  "ecosia.org",
  "startpage.com",
  "search.brave.com",
  // App stores
  "apps.apple.com",
  "appsto.re",
  // Webmail
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "office.com",
  "office365.com",
  "proton.me",
  "protonmail.com",
  "protonmail.ch",
  "icloud.com",
  "mail.ru",
  "rediffmail.com",
  "aol.com",
  // Banks and payment sites
  "paypal.com",
  "stripe.com",
  "razorpay.com",
  "paytm.com",
  "phonepe.com",
  "payu.in",
  "ccavenue.com",
  "billdesk.com",
  "payoneer.com",
  "wise.com",
  "sbi.co.in",
  "onlinesbi.com",
  "hdfcbank.com",
  "icicibank.com",
  "axisbank.com",
  "kotak.com",
  // Government (India and everywhere else)
  "*.gov.*",
  "*.nic.in",
  // News wire sites
  "reuters.com",
  "apnews.com",
  "ap.org",
  "afp.com",
  "ptinews.com",
  "iansindia.com",
  "aninews.in",
  "businesswire.com",
  "prnewswire.com",
  // Asmita's own domains
  "meriasmita.org",
];

/** Lowercase, no trailing dot, no leading "www.". */
export function normalizeNeverCrawlHost(raw: string): string {
  return raw.trim().toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

/** A host against one entry: equal, or a subdomain (with "*." patterns). */
function matchesEntry(host: string, entry: string): boolean {
  if (!entry.startsWith("*.")) return host === entry || host.endsWith(`.${entry}`);
  const rest = entry.slice(2);
  if (rest.endsWith(".*")) {
    // "*.gov.*": a label of the host is "gov". Single-label hosts never match.
    const label = rest.slice(0, -2);
    const labels = host.split(".");
    return labels.length >= 2 && labels.includes(label);
  }
  return host === rest || host.endsWith(`.${rest}`);
}

/** Whether a host is on the built-in never-crawl list. */
export function isNeverCrawlHost(rawHost: string): boolean {
  const host = normalizeNeverCrawlHost(rawHost);
  if (!host) return false;
  return NEVER_CRAWL_HOSTS.some((entry) => matchesEntry(host, entry));
}

/**
 * A host and every parent domain above it, so a block on "example.com" also
 * answers for "deep.forum.example.com" with one indexed lookup per name:
 * ["deep.forum.example.com", "forum.example.com", "example.com", "com"].
 * Used against the CrawlBlockedHost table, whose rows block their subdomains.
 */
export function hostAndParents(rawHost: string): string[] {
  const host = normalizeNeverCrawlHost(rawHost);
  const out: string[] = [];
  let labels = host.split(".");
  while (labels.length > 0) {
    out.push(labels.join("."));
    labels = labels.slice(1);
  }
  return out;
}
