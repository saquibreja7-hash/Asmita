import { z } from "zod";
import raw from "./signatures.json";

/*
 * WP114 (research-tools-spec.md): the versioned signature list the
 * infrastructure scanner matches a landing page and its response headers
 * against. Written by us from the providers' own documentation — every
 * entry carries the documentation URL that shows the host or header, in
 * its `source` field. Nothing here is copied from Wappalyzer or any GPL
 * fork; the hosts, headers and ID patterns are public, documented
 * integration endpoints of the named companies (the same companies the
 * provider directory holds, so an abuse report can go to them).
 *
 * ANALYTICS_ID values are always tag IDs (G-…, GTM-…, pixel numbers), never
 * a shared script host: clustering (cluster.ts) links services on equal
 * values, and every site on the same analytics product shares its script
 * host.
 */

const matchSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("scriptHost"), host: z.string().trim().toLowerCase().min(3).max(200) }).strict(),
  z.object({ type: z.literal("linkHost"), host: z.string().trim().toLowerCase().min(3).max(200) }).strict(),
  z.object({ type: z.literal("iframeHost"), host: z.string().trim().toLowerCase().min(3).max(200) }).strict(),
  z.object({ type: z.literal("formActionHost"), host: z.string().trim().toLowerCase().min(3).max(200) }).strict(),
  z.object({ type: z.literal("header"), name: z.string().trim().toLowerCase().min(1).max(100), regex: z.string().min(1).max(200) }).strict(),
  z.object({ type: z.literal("htmlRegex"), pattern: z.string().min(2).max(500) }).strict(),
]);

export const LAB_INFRA_CATEGORIES = [
  "HOSTING_ASN",
  "CDN",
  "REGISTRAR",
  "NAMESERVER",
  "MAIL",
  "TLS_ISSUER",
  "PAYMENT",
  "CRYPTO_ADDRESS",
  "AUTH_SSO",
  "ANALYTICS_ID",
  "ADS",
  "APP_STORE_LINK",
  "TELEGRAM_LINK",
  "SOCIAL_LINK",
  "REFERRAL_LINK",
  "MODEL_REPO_LINK",
] as const;
export type LabInfraCategory = (typeof LAB_INFRA_CATEGORIES)[number];

const signatureSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    category: z.enum(LAB_INFRA_CATEGORIES),
    provider: z.string().trim().min(1).max(200),
    match: matchSchema,
    confidence: z.enum(["HIGH", "MEDIUM", "LOW"]).optional(),
    /** The provider's own documentation URL showing that host or header. */
    source: z.string().url().max(500),
  })
  .strict();

const fileSchema = z
  .object({ signatureVersion: z.string().trim().min(1).max(40), signatures: z.array(signatureSchema).min(1) })
  .strict();

const parsed = fileSchema.parse(raw);

/** The signatures, in file order. Duplicate ids are a bug in the file. */
export const SIGNATURES = parsed.signatures;
export const SIGNATURE_VERSION = parsed.signatureVersion;

if (new Set(SIGNATURES.map((signature) => signature.id)).size !== SIGNATURES.length) {
  throw new Error("[infra/signatures] duplicate signature id");
}

/** Default confidence per match type when the entry does not say. */
export function defaultConfidence(match: { type: string }): "HIGH" | "MEDIUM" {
  return match.type === "header" ? "MEDIUM" : "HIGH";
}

/**
 * Whether `host` is the signature's host or a subdomain of it. Only exact
 * hosts or subdomains match; js.stripe.com does not match stripe.example.
 */
export function hostMatches(host: string, signatureHost: string): boolean {
  return host === signatureHost || host.endsWith(`.${signatureHost}`);
}

/** How a finding category maps onto a chokepoint kind, for provider lookup. */
export const CATEGORY_TO_CHOKEPOINT_KIND: Partial<Record<LabInfraCategory,
  "HOST" | "CDN" | "REGISTRAR" | "PAYMENT_PROCESSOR" | "APP_STORE" | "AD_NETWORK" | "PLATFORM_ACCOUNT">> = {
  HOSTING_ASN: "HOST",
  CDN: "CDN",
  REGISTRAR: "REGISTRAR",
  PAYMENT: "PAYMENT_PROCESSOR",
  APP_STORE_LINK: "APP_STORE",
  ADS: "AD_NETWORK",
  AUTH_SSO: "PLATFORM_ACCOUNT",
  ANALYTICS_ID: "PLATFORM_ACCOUNT",
};
