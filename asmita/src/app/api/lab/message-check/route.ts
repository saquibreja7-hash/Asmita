import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfRequest } from "@/lib/csrf";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { logSecurityEvent } from "@/lib/security-log";
import { labEnabled } from "@/lib/lab/flags";
import { checkMessagePatterns, routeToMinorSupport } from "@/lib/lab/message-check/patterns";
import { messageCheckDailyLimit, summariseMessage } from "@/lib/lab/message-check/sarvam-summary";
import { classifySextortion } from "@/lib/lab/sextortion/classify";
import { inferStage } from "@/lib/lab/sextortion/taxonomy";
import { sextortionAdvice } from "@/lib/lab/sextortion/advice";
import { backedFindings } from "@/lib/lab/message-check/findings";

/*
 * WP93 + WP117 (docs/lab/beta-spec.md, docs/research/research-tools-spec.md
 * Track D): the public message check API, /api/lab/message-check. A visitor
 * pastes the text of a threatening message (text only, max 4,000
 * characters); the WP93 pattern rules in code AND the WP117 sextortion
 * classifier both run — the classifier entirely in memory, in this isolate,
 * no network — and the optional Sarvam summary runs only when
 * SARVAM_CHAT_KEY is set. Nothing is stored or logged — the pasted text
 * never reaches a console line, an audit entry or a counter key — and no
 * link inside the text is ever fetched.
 *
 * Gate: 503 lab_disabled while the Lab is off (on in dev and test).
 * A stated age under 18 in the text, or the classifier's MINOR_SIGNAL,
 * routes to the minor pathway from code, before anything is answered and
 * before the model is ever called.
 *
 * The response carries ids, never prose or scores: rule ids (WP93's stable
 * set), taxonomy labels above their thresholds AND backed by the flag, a
 * lexicon term or a rule (findings.ts), the combination rule's
 * boolean, and advice ids chosen from the stage. The page turns them into
 * plain sentences in both languages.
 */

const ROUTE = "/api/lab/message-check";

// Text only. 4,000 characters is the WP's cap; a valid payload stays far
// below this envelope even in Hindi or with emoji (up to 4 UTF-8 bytes a
// character), so anything bigger is refused before it is parsed.
const MAX_BODY_CHARS = 16 * 1024;
const CHECKS_PER_IP_PER_HOUR = 10;

const schema = z
  .object({
    text: z.string().trim().min(1).max(4000),
    locale: z.enum(["en", "hi"]).default("en"),
  })
  .strict();

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!labEnabled()) return noStore({ error: "lab_disabled" }, 503);
  if (!verifyCsrfRequest(request)) {
    await logSecurityEvent({ event: "csrf_failed", route: ROUTE });
    return noStore({ error: "csrf_failed" }, 403);
  }

  // Cap the body before parsing, the same two steps as the crawler routes:
  // the declared length first, then the text actually read.
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_CHARS) return noStore({ error: "payload_too_large" }, 413);
  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) return noStore({ error: "payload_too_large" }, 413);

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return noStore({ error: "invalid_payload" }, 400);
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return noStore({ error: "invalid_payload" }, 400);
  const { text, locale } = parsed.data;

  // A check a minute is generous for a person, and stops a scraper: the
  // per-IP bucket is shared (the E2E bypass lifts it), the site-wide daily
  // cap is not. Both count checks, so one source cannot spend everyone's cap.
  let ipLimit: Awaited<ReturnType<typeof checkRateLimitAsync>>;
  let dailyLimit = { allowed: false, remaining: 0 };
  try {
    ipLimit = await checkRateLimitAsync(`lab-message-check-ip:${getClientIp(request)}`, CHECKS_PER_IP_PER_HOUR, 60 * 60_000, { shared: true });
    if (ipLimit.allowed) {
      dailyLimit = await checkRateLimitAsync("lab-message-check-global", messageCheckDailyLimit(), 24 * 60 * 60_000);
    }
  } catch (error) {
    await logSecurityEvent({
      event: "rate_limit_unavailable",
      route: ROUTE,
      reason: error instanceof Error ? error.message : "unknown_rate_limit_error",
    });
    return noStore({ error: "service_unavailable" }, 503);
  }
  if (!ipLimit.allowed || !dailyLimit.allowed) {
    await logSecurityEvent({
      event: "rate_limit_exceeded",
      route: ROUTE,
      reason: ipLimit.allowed ? "message_check_daily_cap" : "message_check_ip",
    });
    return noStore({ error: "rate_limited" }, 429);
  }

  // A stated age under 18 anywhere in the text, or the classifier's
  // MINOR_SIGNAL: the minor pathway from code, before anything is answered
  // and before the model is called. Nothing about the message is analysed
  // or kept — the person is sent to /minor-support. The classifier runs in
  // memory only; a false MINOR_SIGNAL routes a person to support early,
  // which is the safe side to err on.
  const ruleMinor = routeToMinorSupport(text);
  const classification = classifySextortion(text);
  if (ruleMinor || classification.labels.includes("MINOR_SIGNAL")) {
    await logSecurityEvent({ event: "minor_route_blocked", route: ROUTE, reason: ruleMinor ? "stated_under_18" : "minor_signal_label" });
    return noStore({ minor: true, redirectTo: "/minor-support" });
  }

  // Both engines always run, with or without the key: the WP93 rules and
  // the WP117 classifier. The page merges their findings; neither is a
  // verdict, and no score leaves this isolate.
  const matches = checkMessagePatterns(text);
  // A classifier label alone is never reported: it needs the flag, a
  // lexicon term for the same label, or a WP93 rule for the same element
  // behind it, and VICTIM_PLEA on its own is never a finding (findings.ts).
  // Short harmless text ("hi", "ok") therefore gets no labels, no advice
  // and the "no common pattern matched" copy.
  const findings = backedFindings({ text, labels: classification.labels, flagged: classification.flagged, matches });
  // Advice follows the stage the reported labels evidence (taxonomy.ts);
  // the stage itself is never shown.
  const stage = inferStage(findings.labels);
  const advice = sextortionAdvice({
    stage,
    flagged: classification.flagged,
    detectedSomething: findings.finding,
  });

  // One optional Sarvam call for a short plain-language summary. The text in
  // the message is never fetched as a link, and a failure changes nothing:
  // the pattern results below still answer.
  const summary = await summariseMessage(locale, text);

  return noStore({ matches, labels: findings.labels, flagged: classification.flagged, advice, summary });
}
