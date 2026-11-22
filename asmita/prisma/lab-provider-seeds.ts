/**
 * WP114 (research-tools-spec.md): seeds for LabProvider, the directory of
 * companies an abuse report can go to. Public company names and their own
 * public policy/abuse pages only — every URL below was verified against the
 * provider's own site while building this work package (checked 2026-11-22).
 *
 * Deliberately absent: abuse emails. An analyst copies the abuse contact
 * from the provider's own abuse page and verifies the row (verifiedAt);
 * seeds are created unverified and a re-seed never marks one verified or
 * overwrites an analyst's contact or notes.
 */

export type LabProviderSeed = {
  name: string;
  kind: "HOST" | "CDN" | "REGISTRAR" | "PAYMENT_PROCESSOR" | "APP_STORE" | "AD_NETWORK" | "PLATFORM_ACCOUNT";
  website: string;
  abusePageUrl: string | null;
  policyUrl: string | null;
  /** Where the seed's URLs were verified, for the progress log. */
  source: string;
};

export const labProviderSeeds: LabProviderSeed[] = [
  {
    name: "Cloudflare",
    kind: "CDN",
    website: "https://www.cloudflare.com",
    abusePageUrl: "https://www.cloudflare.com/trust-hub/reporting-abuse/",
    policyUrl: "https://www.cloudflare.com/trust-hub/trust-and-safety/",
    source: "cloudflare.com/trust-hub/reporting-abuse (abuse report form, NCSEI category)",
  },
  {
    name: "Fastly",
    kind: "CDN",
    website: "https://www.fastly.com",
    abusePageUrl: "https://support.fastly.com/s/report-abuse-case",
    policyUrl: "https://www.fastly.com/acceptable-use",
    source: "fastly.com/acceptable-use (Section III: reporting violations; DMCA/DSA form)",
  },
  {
    name: "Akamai",
    kind: "CDN",
    website: "https://www.akamai.com",
    abusePageUrl: "https://www.akamai.com/global-services/support/report-abuse",
    policyUrl: null,
    source: "akamai.com/global-services/support/report-abuse (report abuse page)",
  },
  {
    name: "Stripe",
    kind: "PAYMENT_PROCESSOR",
    website: "https://stripe.com",
    abusePageUrl: "https://support.stripe.com/questions/how-do-i-report-a-complaint-to-stripe",
    policyUrl: "https://stripe.com/legal/restricted-businesses",
    source: "stripe.com/legal/restricted-businesses (prohibited businesses)",
  },
  {
    name: "Razorpay",
    kind: "PAYMENT_PROCESSOR",
    website: "https://razorpay.com",
    abusePageUrl: "https://razorpay.com/grievances/",
    policyUrl: "https://razorpay.com/terms",
    source: "razorpay.com/terms (prohibited activities; grievance portal razorpay.com/grievances)",
  },
  {
    name: "PayPal",
    kind: "PAYMENT_PROCESSOR",
    website: "https://www.paypal.com",
    abusePageUrl: "https://www.paypal.com/an/cshelp/aupviolation",
    policyUrl: "https://www.paypal.com/us/legalhub/paypal/acceptableuse-full",
    source: "paypal.com acceptable use policy (\"We encourage you to report violations\")",
  },
  {
    name: "Coinbase Commerce",
    kind: "PAYMENT_PROCESSOR",
    website: "https://commerce.coinbase.com",
    abusePageUrl: null,
    policyUrl: null,
    source: "docs.cloud.coinbase.com/commerce (hosted crypto checkouts); no public abuse page verified",
  },
  {
    name: "Google",
    kind: "PLATFORM_ACCOUNT",
    website: "https://www.google.com",
    abusePageUrl: "https://support.google.com/legal/troubleshooter/1114905",
    policyUrl: "https://policies.google.com/terms",
    source: "support.google.com/legal/troubleshooter (removing content from Google)",
  },
  {
    name: "Google AdSense",
    kind: "AD_NETWORK",
    website: "https://www.google.com/adsense/",
    abusePageUrl: "https://support.google.com/adsense/contact/violation_report",
    policyUrl: "https://support.google.com/adsense/answer/48182",
    source: "support.google.com/adsense/answer/13784654 (report a policy violation)",
  },
  {
    name: "Apple",
    kind: "PLATFORM_ACCOUNT",
    website: "https://www.apple.com",
    abusePageUrl: "https://reportaproblem.apple.com",
    policyUrl: null,
    source: "support.apple.com/en-us/122712 (report suspicious app activity at reportaproblem.apple.com)",
  },
  {
    name: "Telegram",
    kind: "PLATFORM_ACCOUNT",
    website: "https://telegram.org",
    abusePageUrl: "https://telegram.org/faq",
    policyUrl: null,
    source: "telegram.org/faq (\"There's illegal content on Telegram. How do I take it down?\")",
  },
  {
    name: "Discord",
    kind: "PLATFORM_ACCOUNT",
    website: "https://discord.com",
    abusePageUrl: "https://discord.com/safety/360044103651-reporting-abusive-behavior-to-discord",
    policyUrl: "https://discord.com/guidelines",
    source: "discord.com/safety (Reporting Content or Behavior to Discord)",
  },
];
