import { NextResponse } from "next/server";
import { z } from "zod";
import { CHAT_SYSTEM_PROMPT, PROMPT_CANARY } from "@/lib/chat-knowledge";
import { verifyCsrfRequest } from "@/lib/csrf";
import { containsUrlLikeText } from "@/lib/feedback";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { logSecurityEvent } from "@/lib/security-log";

/*
 * The home page chat. The browser keeps the conversation and sends it with
 * each message; we add the instructions and knowledge (chat-knowledge.ts) and
 * ask Sarvam's model for a reply with SARVAM_CHAT_KEY, which never leaves the
 * Worker. Messages pass through here but are never stored or logged.
 */

const SARVAM_CHAT_API = "https://api.sarvam.ai/v1/chat/completions";
const ROUTE = "/api/chat";

// The chat never takes links. Answered here, without calling the model.
const LINK_REPLY = {
  en: "Please do not send links here. Links go only into the form at meriasmita.org/start, never into this chat. That keeps you safe. Would you like me to explain how the form works?",
  hi: "कृपया यहाँ लिंक न भेजें। लिंक केवल meriasmita.org/start पर दिए गए फ़ॉर्म में ही जाएँ, इस चैट में नहीं। इससे आपकी सुरक्षा बनी रहती है। क्या मैं बताऊँ कि फ़ॉर्म कैसे काम करता है?",
};

// A person who says they are under 18 gets the minor pathway from here, not
// from the model, and keeps getting it for the rest of the chat.
const MINOR_REPLY = {
  en: "Thank you for telling me. None of this is your fault. Because you are under 18, a special team helps with this: please call CHILDLINE 1098, free and open 24 hours, in many Indian languages. You can also use takeitdown.ncmec.org, which removes images without the image being sent to anyone. Is there one adult you trust, like a parent or a teacher, you could tell today?",
  hi: "मुझे बताने के लिए धन्यवाद। इसमें आपकी कोई गलती नहीं है। 18 साल से कम उम्र होने की वजह से एक खास टीम इसमें मदद करती है: कृपया चाइल्डलाइन 1098 पर कॉल करें, यह मुफ़्त है, 24 घंटे खुली रहती है और कई भारतीय भाषाओं में बात करती है। आप takeitdown.ncmec.org का भी उपयोग कर सकते हैं, जो तस्वीर किसी को भेजे बिना उसे हटाने में मदद करता है। क्या कोई ऐसा बड़ा है जिस पर आप भरोसा करते हैं, जैसे माता-पिता या कोई टीचर, जिसे आप आज बता सकें?",
};

// A stated age under 18 ("I am 15", "16 years old", "मैं 15 साल", "main 16 saal").
// Narrow on purpose: a missed case still reaches the model, whose instructions
// carry the same pathway.
const UNDER_18 = [
  /\b(i am|i'm|im|my age is|aged?)\s*(1[0-7]|[5-9])(\s*(years?|yrs?)(\s*old)?)?\s*($|[,.!?;]|\band\b|\bbut\b)/i,
  /\b(1[0-7]|[5-9])\s*(years?|yrs?)\s*old\b/i,
  /(मैं|मेरी उम्र|उम्र)\s*(1[0-7]|[5-9])\s*(साल|वर्ष)/,
  /\b(main|mai|meri umar|meri umr|umar|umr)\s*(1[0-7]|[5-9])\s*(saal|sal|varsh)\b/i,
];
function statesUnder18(text: string) {
  return UNDER_18.some((pattern) => pattern.test(text));
}

// Sent instead of any reply that repeats the instructions.
const PRIVATE_REPLY = {
  en: "I cannot share how I am set up. I am here to help with images or videos shared without consent. What would you like to know?",
  hi: "मैं यह नहीं बता सकती कि मुझे कैसे सेट किया गया है। मैं बिना सहमति के शेयर की गई तस्वीरों या वीडियो में मदद के लिए यहाँ हूँ। आप क्या जानना चाहेंगे?",
};

function leaksInstructions(reply: string) {
  return reply.includes(PROMPT_CANARY) || /# (Who you are|Safety rules|How to write|Support directory)|Never break these/i.test(reply);
}

const schema = z.object({
  locale: z.enum(["en", "hi"]).default("en"),
  messages: z
    .array(
      z.discriminatedUnion("role", [
        z.object({ role: z.literal("user"), content: z.string().trim().min(1).max(500) }),
        z.object({ role: z.literal("assistant"), content: z.string().max(1500) }),
      ]),
    )
    .min(1)
    .max(20),
});

// Defence in depth against images smuggled as text: data URLs or long base64 runs.
function looksLikeMedia(text: string) {
  return /data:[a-z]+\/[a-z0-9.+-]+;base64/i.test(text) || /[A-Za-z0-9+/=]{200,}/.test(text);
}

function envLimit(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) {
    await logSecurityEvent({ event: "csrf_failed", route: ROUTE });
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const { locale, messages } = parsed.data;
  const last = messages[messages.length - 1];
  if (last.role !== "user") {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  if (messages.some((m) => looksLikeMedia(m.content))) {
    await logSecurityEvent({ event: "media_payload_rejected", route: ROUTE });
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  let ipLimit: Awaited<ReturnType<typeof checkRateLimitAsync>>;
  let globalLimit = { allowed: false, remaining: 0 };
  try {
    // Messages, not chats, are what cost credits, so both limits count messages.
    ipLimit = await checkRateLimitAsync(`chat-message-ip:${getClientIp(request)}`, 40, 60 * 60_000, { shared: true });
    // Only messages within their IP limit count towards the daily cap, so one
    // source cannot use up everyone's chat.
    if (ipLimit.allowed) {
      globalLimit = await checkRateLimitAsync(
        "chat-message-global",
        envLimit("CHAT_DAILY_MESSAGE_LIMIT", 500),
        24 * 60 * 60_000,
      );
    }
  } catch (error) {
    await logSecurityEvent({
      event: "rate_limit_unavailable",
      route: ROUTE,
      reason: error instanceof Error ? error.message : "unknown_rate_limit_error",
    });
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }
  if (!ipLimit.allowed || !globalLimit.allowed) {
    await logSecurityEvent({
      event: "rate_limit_exceeded",
      route: ROUTE,
      reason: ipLimit.allowed ? "chat_daily_cap" : "chat_ip",
    });
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const userTurns = messages.filter((m) => m.role === "user");
  if (userTurns.some((m) => statesUnder18(m.content))) {
    return NextResponse.json({ reply: MINOR_REPLY[locale] }, { headers: { "cache-control": "no-store" } });
  }
  // Every user turn, not only the last: the browser sends the history, so an
  // earlier turn could carry a link the page never let through.
  if (userTurns.some((m) => containsUrlLikeText(m.content))) {
    return NextResponse.json({ reply: LINK_REPLY[locale] }, { headers: { "cache-control": "no-store" } });
  }

  const apiKey = process.env.SARVAM_CHAT_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "chat_unavailable" }, { status: 503 });
  }

  let response: Response;
  try {
    response = await fetch(SARVAM_CHAT_API, {
      method: "POST",
      headers: { "api-subscription-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        model: "sarvam-105b",
        // Thinking off: replies are short and fast, and cost less.
        reasoning_effort: null,
        temperature: 0.3,
        max_tokens: 600,
        messages: [
          { role: "system", content: CHAT_SYSTEM_PROMPT },
          {
            role: "system",
            content: `The website is shown in ${locale === "hi" ? "Hindi" : "English"}. Use that language until the person writes in another.`,
          },
          ...messages,
        ],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    console.error("[chat] Sarvam request failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "chat_unavailable" }, { status: 502 });
  }
  if (!response.ok) {
    console.error(`[chat] Sarvam returned ${response.status}`);
    return NextResponse.json(
      { error: response.status === 429 ? "rate_limited" : "chat_unavailable" },
      { status: response.status === 429 ? 429 : 502 },
    );
  }
  const data = (await response.json().catch(() => null)) as {
    choices?: { message?: { content?: unknown } }[];
  } | null;
  const reply = data?.choices?.[0]?.message?.content;
  if (typeof reply !== "string" || !reply.trim()) {
    console.error("[chat] Sarvam returned no reply text");
    return NextResponse.json({ error: "chat_unavailable" }, { status: 502 });
  }
  const safeReply = leaksInstructions(reply) ? PRIVATE_REPLY[locale] : reply.trim().slice(0, 1500);
  return NextResponse.json({ reply: safeReply }, { headers: { "cache-control": "no-store" } });
}
