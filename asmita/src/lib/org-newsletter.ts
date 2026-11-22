import { randomBytes } from "node:crypto";
import { z } from "zod";
import { decryptField, encryptField } from "@/lib/encryption";
import { hashEmail, sha256 } from "@/lib/hash";
import { writeAuditLog } from "@/lib/audit";
import { csvCell } from "@/lib/csv-cell";

/*
 * Newsletter sign-ups (docs/org/spec.md, WP56), double opt-in. The address
 * is encrypted at rest; only its sha256 (emailHash) is stored in the clear
 * for dedup. Both the single-use confirm token (7 days) and the
 * per-subscriber unsubscribe token are stored hashed. Newsletter sends go
 * out from an external tool; this list is export-only.
 */

export const NEWSLETTER_STATUSES = ["PENDING", "CONFIRMED", "UNSUBSCRIBED"] as const;
export type NewsletterStatus = (typeof NEWSLETTER_STATUSES)[number];

/** Unconfirmed sign-ups are deleted after this long (retention, 56.7). */
export const NEWSLETTER_CONFIRM_TTL_MS = 7 * 24 * 60 * 60_000;

const MAX_MEMORY_SUBSCRIBERS = 1000;

export const newsletterSignupSchema = z
  .object({
    email: z.string().trim().toLowerCase().max(254).email(),
    locale: z.enum(["en", "hi"]).default("en"),
    source: z.string().trim().min(1).max(80),
    // Hidden from people; a filled value means a bot.
    fax: z.string().max(200).optional(),
  })
  .strict();

export type NewsletterSubscriber = {
  id: string;
  emailHash: string;
  status: NewsletterStatus;
  locale: "en" | "hi";
  source: string;
  confirmedAt: string | null;
  unsubscribedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Memory rows also carry the encrypted address and the hashed tokens. */
type MemorySubscriber = NewsletterSubscriber & {
  emailEnc: string;
  confirmTokenHash: string | null;
  unsubscribeTokenHash: string | null;
};

/** Local development and tests without a database keep subscribers here, capped. */
export const newsletterSubscribers: MemorySubscriber[] = [];

function devNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

function remember(subscriber: MemorySubscriber) {
  newsletterSubscribers.push(subscriber);
  if (newsletterSubscribers.length > MAX_MEMORY_SUBSCRIBERS) {
    newsletterSubscribers.splice(0, newsletterSubscribers.length - MAX_MEMORY_SUBSCRIBERS);
  }
}

function rowToSubscriber(row: Record<string, unknown>): NewsletterSubscriber {
  return {
    id: row.id as string,
    emailHash: row.emailHash as string,
    status: row.status as NewsletterStatus,
    locale: (row.locale as "en" | "hi") ?? "en",
    source: row.source as string,
    confirmedAt: row.confirmedAt ? new Date(row.confirmedAt as string).toISOString() : null,
    unsubscribedAt: row.unsubscribedAt ? new Date(row.unsubscribedAt as string).toISOString() : null,
    createdAt: new Date(row.createdAt as string).toISOString(),
    updatedAt: new Date(row.updatedAt as string).toISOString(),
  };
}

export function appBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://meriasmita.org").replace(/\/+$/, "");
}

/**
 * Sign up, or re-sign-up. The response is the same whether the address is
 * new, pending or already confirmed, so the form can never be used to
 * probe who is on the list. Already-confirmed addresses get no email and
 * no state change.
 */
export async function subscribeToNewsletter(input: z.infer<typeof newsletterSignupSchema>): Promise<{
  ok: true;
  /** The confirm token, when a confirmation email is needed. */
  confirmToken: string | null;
  /** The per-subscriber unsubscribe token (goes into newsletter emails). */
  unsubscribeToken: string | null;
  email: string;
}> {
  const email = input.email;
  const emailHash = hashEmail(email);
  const existing = await findByEmailHash(emailHash);
  if (existing?.status === "CONFIRMED") {
    return { ok: true, confirmToken: null, unsubscribeToken: null, email };
  }
  const confirmToken = randomBytes(24).toString("hex");
  const confirmTokenHash = sha256(confirmToken);
  const now = new Date().toISOString();
  if (existing) {
    // Pending or unsubscribed: a fresh single-use token, clock restarted.
    if (devNoDb()) {
      const current = newsletterSubscribers.find((entry) => entry.emailHash === emailHash);
      if (current) {
        current.status = "PENDING";
        current.locale = input.locale;
        current.confirmTokenHash = confirmTokenHash;
        current.updatedAt = now;
      }
    } else {
      const { db } = await import("@/lib/db");
      await db.newsletterSubscriber.update({
        where: { emailHash },
        data: { status: "PENDING", locale: input.locale, confirmTokenHash, unsubscribedAt: null },
      });
    }
    return { ok: true, confirmToken, unsubscribeToken: null, email };
  }
  const unsubscribeToken = randomBytes(24).toString("hex");
  const record: MemorySubscriber = {
    id: crypto.randomUUID(),
    emailEnc: encryptField(email),
    emailHash,
    locale: input.locale,
    status: "PENDING",
    confirmTokenHash,
    unsubscribeTokenHash: sha256(unsubscribeToken),
    source: input.source,
    confirmedAt: null,
    unsubscribedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  if (devNoDb()) {
    remember(record);
  } else {
    const { db } = await import("@/lib/db");
    await db.newsletterSubscriber.create({
      data: {
        emailEnc: record.emailEnc,
        emailHash,
        locale: input.locale,
        status: "PENDING",
        confirmTokenHash,
        unsubscribeTokenHash: record.unsubscribeTokenHash,
        source: input.source,
      },
    });
  }
  return { ok: true, confirmToken, unsubscribeToken, email };
}

async function findByEmailHash(emailHash: string): Promise<NewsletterSubscriber | null> {
  if (devNoDb()) return newsletterSubscribers.find((entry) => entry.emailHash === emailHash) ?? null;
  const { db } = await import("@/lib/db");
  const row = await db.newsletterSubscriber.findUnique({ where: { emailHash } });
  return row ? rowToSubscriber(row) : null;
}

/** The confirm link in the email. */
export function newsletterConfirmUrl(confirmToken: string) {
  return `${appBaseUrl()}/newsletter/confirm?token=${confirmToken}`;
}

/** The unsubscribe link in every newsletter email. */
export function newsletterUnsubscribeUrl(unsubscribeToken: string) {
  return `${appBaseUrl()}/newsletter/unsubscribe?token=${unsubscribeToken}`;
}

/**
 * Confirm a sign-up with the single-use token from the email. Tokens
 * expire after NEWSLETTER_CONFIRM_TTL_MS; using one clears it.
 */
export async function confirmNewsletterSubscriber(token: string): Promise<
  { ok: true; email: string; locale: "en" | "hi" } | { ok: false; error: "token_invalid" }
> {
  const confirmTokenHash = sha256(token);
  const cutoff = new Date(Date.now() - NEWSLETTER_CONFIRM_TTL_MS);
  let email: string | null = null;
  let locale: "en" | "hi" = "en";
  if (devNoDb()) {
    const current = newsletterSubscribers.find(
      (entry) => entry.confirmTokenHash === confirmTokenHash && new Date(entry.updatedAt) >= cutoff,
    );
    if (!current) return { ok: false, error: "token_invalid" };
    current.status = "CONFIRMED";
    current.confirmTokenHash = null;
    current.confirmedAt = new Date().toISOString();
    current.updatedAt = current.confirmedAt;
    email = safeDecrypt(current.emailEnc);
    locale = current.locale;
  } else {
    const { db } = await import("@/lib/db");
    const row = await db.newsletterSubscriber.findFirst({ where: { confirmTokenHash } });
    if (!row || row.updatedAt < cutoff) return { ok: false, error: "token_invalid" };
    const updated = await db.newsletterSubscriber.update({
      where: { id: row.id },
      data: { status: "CONFIRMED", confirmTokenHash: null, confirmedAt: new Date() },
    });
    email = safeDecrypt(updated.emailEnc);
    locale = (updated.locale as "en" | "hi") ?? "en";
  }
  if (!email) return { ok: false, error: "token_invalid" };
  return { ok: true, email, locale };
}

/** Unsubscribe with the per-subscriber token from any email. Idempotent. */
export async function unsubscribeNewsletterSubscriber(token: string): Promise<{ ok: true; email: string } | { ok: false; error: "token_invalid" }> {
  const unsubscribeTokenHash = sha256(token);
  let email: string | null = null;
  if (devNoDb()) {
    const current = newsletterSubscribers.find((entry) => entry.unsubscribeTokenHash === unsubscribeTokenHash);
    if (!current) return { ok: false, error: "token_invalid" };
    current.status = "UNSUBSCRIBED";
    current.unsubscribedAt = new Date().toISOString();
    current.updatedAt = current.unsubscribedAt;
    email = safeDecrypt(current.emailEnc);
  } else {
    const { db } = await import("@/lib/db");
    const row = await db.newsletterSubscriber.findFirst({ where: { unsubscribeTokenHash } });
    if (!row) return { ok: false, error: "token_invalid" };
    const updated = await db.newsletterSubscriber.update({
      where: { id: row.id },
      data: { status: "UNSUBSCRIBED", unsubscribedAt: new Date() },
    });
    email = safeDecrypt(updated.emailEnc);
  }
  if (!email) return { ok: false, error: "token_invalid" };
  return { ok: true, email };
}

function safeDecrypt(payload: string): string | null {
  try {
    return decryptField(payload);
  } catch {
    return null;
  }
}

export type NewsletterCounts = { pending: number; confirmed: number; unsubscribed: number; total: number };

export async function newsletterCounts(): Promise<NewsletterCounts> {
  const rows = await allSubscribers();
  const counts: NewsletterCounts = { pending: 0, confirmed: 0, unsubscribed: 0, total: rows.length };
  for (const row of rows) {
    if (row.status === "PENDING") counts.pending += 1;
    if (row.status === "CONFIRMED") counts.confirmed += 1;
    if (row.status === "UNSUBSCRIBED") counts.unsubscribed += 1;
  }
  return counts;
}

async function allSubscribers(): Promise<NewsletterSubscriber[]> {
  if (devNoDb()) return [...newsletterSubscribers];
  const { db } = await import("@/lib/db");
  const rows = await db.newsletterSubscriber.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map(rowToSubscriber);
}

/** CSV of confirmed subscribers: email, locale, confirmed date. Audit-logged. */
export async function exportNewsletterCsv(actorId: string): Promise<string> {
  const confirmed = (await allSubscribers()).filter((row) => row.status === "CONFIRMED");
  const lines = ["email,locale,confirmedAt"];
  for (const row of confirmed) {
    const email = await decryptEmail(row.emailHash);
    lines.push(`${csvCell(email)},${row.locale},${row.confirmedAt ?? ""}`);
  }
  await writeAuditLog({
    eventType: "ORG_NEWSLETTER_EXPORTED",
    entityType: "NewsletterSubscriber",
    actorId,
    data: { count: confirmed.length },
  });
  return `${lines.join("\n")}\n`;
}

async function decryptEmail(emailHash: string): Promise<string> {
  if (devNoDb()) {
    const row = newsletterSubscribers.find((entry) => entry.emailHash === emailHash);
    return row ? safeDecrypt(row.emailEnc) ?? "" : "";
  }
  const { db } = await import("@/lib/db");
  const row = await db.newsletterSubscriber.findUnique({ where: { emailHash }, select: { emailEnc: true } });
  return row ? safeDecrypt(row.emailEnc) ?? "" : "";
}

