import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfRequest } from "@/lib/csrf";
import { logSecurityEvent } from "@/lib/security-log";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { containsUrlLikeText } from "@/lib/url-like-text";
import { recordPartnerApplication } from "@/lib/platform-partners";
import {
  normaliseDomain,
  PARTNER_INTERESTS,
  PLATFORM_TYPES,
  USER_BASES,
  type PartnerInterest,
  type PlatformType,
  type UserBase,
} from "@/lib/platform-partners-shared";

// Platform partner programme sign-up (/for-platforms). Public and
// unauthenticated, so: CSRF, a body cap, strict schema, rate limits per
// network and per domain, and a hidden field that only bots fill in.

const MAX_BODY_BYTES = 8 * 1024;
const keys = <T extends Record<string, string>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];
const text = (min: number, max: number) => z.string().trim().min(min).max(max);

const schema = z
  .object({
    organisationName: text(2, 120),
    platformName: text(2, 120),
    website: text(4, 300),
    platformType: z.enum(keys(PLATFORM_TYPES)),
    userBase: z.enum(keys(USER_BASES)),
    contactName: text(2, 100),
    contactRole: text(2, 100),
    contactEmail: z.string().trim().toLowerCase().max(254).email(),
    contactPhone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{7,20}$/)
      .optional()
      .or(z.literal("").transform(() => undefined)),
    interests: z.array(z.enum(keys(PARTNER_INTERESTS))).min(1).max(4),
    message: z.string().trim().max(1500).optional(),
    authorised: z.literal(true),
    // Hidden from people; a filled value means a bot.
    fax: z.string().max(200).optional(),
  })
  .strict();

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) {
    await logSecurityEvent({ event: "csrf_failed", route: "/api/partners" });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const limit = await checkRateLimitAsync(`partners-ip:${getClientIp(request)}`, 10, 60 * 60_000, { shared: true });
  if (!limit.allowed) {
    await logSecurityEvent({ event: "rate_limit_exceeded", route: "/api/partners" });
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const raw = await request.text().catch(() => "");
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    body = null;
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return NextResponse.json({ error: "invalid_payload", field: typeof field === "string" ? field : undefined }, { status: 400 });
  }
  const data = parsed.data;

  // A bot filled the hidden field: answer as if it worked, store nothing.
  if (data.fax) return NextResponse.json({ ok: true });

  const websiteDomain = normaliseDomain(data.website);
  if (!websiteDomain) {
    return NextResponse.json({ error: "invalid_payload", field: "website" }, { status: 400 });
  }
  // The message is for the conversation, not for reporting content: links
  // there could be addresses of intimate content, which this form must not hold.
  if (containsUrlLikeText(data.message ?? "")) {
    return NextResponse.json({ error: "links_not_allowed", field: "message" }, { status: 400 });
  }
  const perDomain = await checkRateLimitAsync(`partners-domain:${websiteDomain}`, 3, 24 * 60 * 60_000);
  if (!perDomain.allowed) {
    return NextResponse.json({ error: "already_received" }, { status: 429 });
  }

  await recordPartnerApplication({
    organisationName: data.organisationName,
    platformName: data.platformName,
    websiteDomain,
    platformType: data.platformType as PlatformType,
    userBase: data.userBase as UserBase,
    contactName: data.contactName,
    contactRole: data.contactRole,
    contactEmail: data.contactEmail,
    contactPhone: data.contactPhone,
    interests: [...new Set(data.interests)] as PartnerInterest[],
    message: data.message || undefined,
  });
  return NextResponse.json({ ok: true });
}
