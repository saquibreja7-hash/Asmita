import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/newsletter/route";
import { POST as CONFIRM } from "@/app/api/newsletter/confirm/route";
import { POST as UNSUBSCRIBE } from "@/app/api/newsletter/unsubscribe/route";
import { createCsrfPair } from "@/lib/csrf";
import { sha256 } from "@/lib/hash";
import { encryptField } from "@/lib/encryption";
import {
  NEWSLETTER_CONFIRM_TTL_MS,
  newsletterCounts,
  newsletterSubscribers,
  subscribeToNewsletter,
  confirmNewsletterSubscriber,
  unsubscribeNewsletterSubscriber,
} from "@/lib/org-newsletter";

// The newsletter sign-up (docs/org/spec.md, 56.7): one click since
// 2026-11-23, no confirmation email. Hashed tokens, non-disclosure (the same
// response whether an address is new or already on the list), and the
// confirm links already sent for older double opt-in sign-ups keep working.

/** An older double opt-in sign-up still waiting for its confirm link. */
function legacyPending(email: string, token: string) {
  const now = new Date().toISOString();
  newsletterSubscribers.push({
    id: crypto.randomUUID(),
    emailEnc: encryptField(email),
    firstNameEnc: null,
    emailHash: sha256(email),
    locale: "en",
    status: "PENDING",
    confirmTokenHash: sha256(token),
    unsubscribeTokenHash: sha256(`${token}-unsub`),
    source: "newsletter",
    confirmedAt: null,
    unsubscribedAt: null,
    createdAt: now,
    updatedAt: now,
  });
}

const TOKEN = "ab".repeat(24);

function req(body: unknown, path = "/api/newsletter", options: { csrf?: boolean } = {}) {
  const csrf = createCsrfPair();
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "cf-connecting-ip": `198.51.100.${Math.floor(Math.random() * 200) + 1}`,
  };
  if (options.csrf !== false) {
    headers.cookie = `asmita_csrf=${csrf.nonce}`;
    headers["x-csrf-token"] = csrf.token;
  }
  return new Request(`https://asmita.test${path}`, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("newsletter one-click sign-up (store)", () => {
  beforeEach(() => vi.stubEnv("DATABASE_URL", ""));
  afterEach(() => {
    vi.unstubAllEnvs();
    newsletterSubscribers.splice(0, newsletterSubscribers.length);
  });

  it("signs up as CONFIRMED straight away, with a hashed unsubscribe token and no plaintext email", async () => {
    const result = await subscribeToNewsletter({ email: "reader@example.invalid", locale: "en", source: "newsletter" });
    expect(result.ok).toBe(true);
    expect(result).not.toHaveProperty("confirmToken");
    expect(result.unsubscribeToken).toMatch(/^[a-f0-9]{48}$/);
    const [saved] = newsletterSubscribers;
    expect(saved.status).toBe("CONFIRMED");
    expect(saved.confirmedAt).toBeTruthy();
    expect(saved.confirmTokenHash).toBeNull();
    expect(saved.emailHash).toBe(sha256("reader@example.invalid"));
    expect(saved.unsubscribeTokenHash).toBe(sha256(result.unsubscribeToken!));
    // Only the encrypted address is stored, never plaintext.
    expect(saved.emailEnc).not.toContain("reader@example.invalid");
  });

  it("still confirms an older pending sign-up with its link, single use", async () => {
    legacyPending("reader@example.invalid", TOKEN);
    const confirmed = await confirmNewsletterSubscriber(TOKEN);
    expect(confirmed.ok && confirmed.email).toBe("reader@example.invalid");
    expect(newsletterSubscribers[0].status).toBe("CONFIRMED");
    expect(newsletterSubscribers[0].confirmTokenHash).toBeNull();
    expect(await confirmNewsletterSubscriber(TOKEN)).toEqual({ ok: false, error: "token_invalid" });
  });

  it("expires an older confirm link after 7 days", async () => {
    legacyPending("slow@example.invalid", TOKEN);
    newsletterSubscribers[0].updatedAt = new Date(Date.now() - NEWSLETTER_CONFIRM_TTL_MS - 60_000).toISOString();
    expect(await confirmNewsletterSubscriber(TOKEN)).toEqual({ ok: false, error: "token_invalid" });
    expect(newsletterSubscribers[0].status).toBe("PENDING");
  });

  it("signing up again confirms an older pending sign-up without a link", async () => {
    legacyPending("waiting@example.invalid", TOKEN);
    await subscribeToNewsletter({ email: "waiting@example.invalid", firstName: "Asha", locale: "hi", source: "footer" });
    expect(newsletterSubscribers).toHaveLength(1);
    expect(newsletterSubscribers[0].status).toBe("CONFIRMED");
    expect(newsletterSubscribers[0].confirmTokenHash).toBeNull();
    expect(newsletterSubscribers[0].locale).toBe("hi");
  });

  it("unsubscribes with the per-subscriber token, idempotently", async () => {
    const signup = await subscribeToNewsletter({ email: "leaving@example.invalid", locale: "en", source: "newsletter" });
    const first = await unsubscribeNewsletterSubscriber(signup.unsubscribeToken!);
    expect(first.ok && first.email).toBe("leaving@example.invalid");
    expect(newsletterSubscribers[0].status).toBe("UNSUBSCRIBED");
    expect(newsletterSubscribers[0].firstNameEnc).toBeNull();
    const again = await unsubscribeNewsletterSubscriber(signup.unsubscribeToken!);
    expect(again.ok).toBe(true);
    expect(await unsubscribeNewsletterSubscriber("deadbeef".repeat(6))).toEqual({ ok: false, error: "token_invalid" });
  });

  it("a subscribed address changes nothing; an unsubscribed one is back on the list in one click", async () => {
    const signup = await subscribeToNewsletter({ email: "return@example.invalid", firstName: "Asha", locale: "en", source: "newsletter" });
    const again = await subscribeToNewsletter({ email: "return@example.invalid", locale: "en", source: "footer" });
    expect(again.unsubscribeToken).toBeNull();
    expect(newsletterSubscribers).toHaveLength(1);
    expect(newsletterSubscribers[0].status).toBe("CONFIRMED");

    await unsubscribeNewsletterSubscriber(signup.unsubscribeToken!);
    await subscribeToNewsletter({ email: "return@example.invalid", firstName: "Asha", locale: "en", source: "footer" });
    expect(newsletterSubscribers).toHaveLength(1);
    expect(newsletterSubscribers[0].status).toBe("CONFIRMED");
    expect(newsletterSubscribers[0].unsubscribedAt).toBeNull();
    expect(newsletterSubscribers[0].firstNameEnc).toBeTruthy();
  });

  it("counts by status", async () => {
    await subscribeToNewsletter({ email: "a@example.invalid", locale: "en", source: "t" });
    legacyPending("b@example.invalid", TOKEN);
    const counts = await newsletterCounts();
    expect(counts).toEqual({ pending: 1, confirmed: 1, unsubscribed: 0, total: 2 });
  });
});

describe("POST /api/newsletter (routes)", () => {
  beforeEach(() => vi.stubEnv("DATABASE_URL", ""));
  afterEach(() => {
    vi.unstubAllEnvs();
    newsletterSubscribers.splice(0, newsletterSubscribers.length);
  });

  it("refuses a request without CSRF", async () => {
    const response = await POST(req({ email: "x@example.invalid", source: "t" }, "/api/newsletter", { csrf: false }));
    expect(response.status).toBe(403);
  });

  it("subscribes a new address in one request and stores nothing when the honeypot is filled", async () => {
    expect((await POST(req({ email: "ok@example.invalid", firstName: "Asha", source: "t" }))).status).toBe(200);
    expect(newsletterSubscribers).toHaveLength(1);
    expect(newsletterSubscribers[0].status).toBe("CONFIRMED");
    const bot = await POST(req({ email: "bot@example.invalid", firstName: "Asha", source: "t", fax: "1" }));
    expect(bot.status).toBe(200);
    expect(newsletterSubscribers).toHaveLength(1);
  });

  it("gives the same response for an address that is already confirmed (non-disclosure)", async () => {
    const first = await POST(req({ email: "known@example.invalid", firstName: "Asha", source: "t" }));
    const before = await first.json();
    const second = await POST(req({ email: "known@example.invalid", firstName: "Asha", source: "t" }));
    const after = await second.json();
    expect(second.status).toBe(first.status);
    expect(after).toEqual(before);
    // Nothing was re-sent: still exactly one subscriber.
    expect(newsletterSubscribers).toHaveLength(1);
  });

  it("confirms an older pending sign-up through the API with CSRF and refuses unknown tokens", async () => {
    legacyPending("route@example.invalid", TOKEN);
    const bad = await CONFIRM(req({ token: "nonsense-not-hex" }, "/api/newsletter/confirm"));
    expect(bad.status).toBe(400);
    const noCsrf = await CONFIRM(req({ token: TOKEN }, "/api/newsletter/confirm", { csrf: false }));
    expect(noCsrf.status).toBe(403);
    const good = await CONFIRM(req({ token: TOKEN }, "/api/newsletter/confirm"));
    expect(good.status).toBe(200);
    expect(newsletterSubscribers[0].status).toBe("CONFIRMED");
  });

  it("unsubscribes through the API", async () => {
    const signup = await subscribeToNewsletter({ email: "gone@example.invalid", locale: "en", source: "t" });
    const response = await UNSUBSCRIBE(req({ token: signup.unsubscribeToken }, "/api/newsletter/unsubscribe"));
    expect(response.status).toBe(200);
    expect(newsletterSubscribers[0].status).toBe("UNSUBSCRIBED");
  });
});
