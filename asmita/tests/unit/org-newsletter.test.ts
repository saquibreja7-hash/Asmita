import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/newsletter/route";
import { POST as CONFIRM } from "@/app/api/newsletter/confirm/route";
import { POST as UNSUBSCRIBE } from "@/app/api/newsletter/unsubscribe/route";
import { createCsrfPair } from "@/lib/csrf";
import { sha256 } from "@/lib/hash";
import {
  NEWSLETTER_CONFIRM_TTL_MS,
  newsletterCounts,
  newsletterSubscribers,
  subscribeToNewsletter,
  confirmNewsletterSubscriber,
  unsubscribeNewsletterSubscriber,
} from "@/lib/org-newsletter";

// The newsletter double opt-in (docs/org/spec.md, 56.7): hashed single-use
// tokens, a 7-day confirm window, and non-disclosure — the same response
// whether an address is new, pending or already confirmed.

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

describe("newsletter double opt-in (store)", () => {
  beforeEach(() => vi.stubEnv("DATABASE_URL", ""));
  afterEach(() => {
    vi.unstubAllEnvs();
    newsletterSubscribers.splice(0, newsletterSubscribers.length);
  });

  it("signs up as PENDING with hashed tokens and no plaintext email hash", async () => {
    const result = await subscribeToNewsletter({ email: "reader@example.invalid", locale: "en", source: "newsletter" });
    expect(result.ok).toBe(true);
    expect(result.confirmToken).toMatch(/^[a-f0-9]{48}$/);
    expect(result.unsubscribeToken).toMatch(/^[a-f0-9]{48}$/);
    const [saved] = newsletterSubscribers;
    expect(saved.status).toBe("PENDING");
    expect(saved.emailHash).toBe(sha256("reader@example.invalid"));
    expect(saved.confirmTokenHash).toBe(sha256(result.confirmToken!));
    expect(saved.unsubscribeTokenHash).toBe(sha256(result.unsubscribeToken!));
    // Only the encrypted address is stored, never plaintext.
    expect(saved.emailEnc).not.toContain("reader@example.invalid");
  });

  it("confirms with the token, single use, and clears the confirm token", async () => {
    const signup = await subscribeToNewsletter({ email: "reader@example.invalid", locale: "hi", source: "newsletter" });
    expect(signup.confirmToken).toBeTruthy();
    const confirmed = await confirmNewsletterSubscriber(signup.confirmToken!);
    expect(confirmed.ok).toBe(true);
    expect(confirmed.ok && confirmed.email).toBe("reader@example.invalid");
    expect(newsletterSubscribers[0].status).toBe("CONFIRMED");
    expect(newsletterSubscribers[0].confirmTokenHash).toBeNull();
    // Single use: the same token is refused the second time.
    expect(await confirmNewsletterSubscriber(signup.confirmToken!)).toEqual({ ok: false, error: "token_invalid" });
  });

  it("expires confirm tokens after 7 days", async () => {
    const signup = await subscribeToNewsletter({ email: "slow@example.invalid", locale: "en", source: "footer" });
    // Wind the clock past the TTL by backdating updatedAt (the issue time).
    newsletterSubscribers[0].updatedAt = new Date(Date.now() - NEWSLETTER_CONFIRM_TTL_MS - 60_000).toISOString();
    expect(await confirmNewsletterSubscriber(signup.confirmToken!)).toEqual({ ok: false, error: "token_invalid" });
    expect(newsletterSubscribers[0].status).toBe("PENDING");
  });

  it("unsubscribes with the per-subscriber token, idempotently", async () => {
    const signup = await subscribeToNewsletter({ email: "leaving@example.invalid", locale: "en", source: "newsletter" });
    await confirmNewsletterSubscriber(signup.confirmToken!);
    const first = await unsubscribeNewsletterSubscriber(signup.unsubscribeToken!);
    expect(first.ok && first.email).toBe("leaving@example.invalid");
    expect(newsletterSubscribers[0].status).toBe("UNSUBSCRIBED");
    const again = await unsubscribeNewsletterSubscriber(signup.unsubscribeToken!);
    expect(again.ok).toBe(true);
    expect(await unsubscribeNewsletterSubscriber("deadbeef".repeat(6))).toEqual({ ok: false, error: "token_invalid" });
  });

  it("re-signing an unsubscribed address restarts the double opt-in; a confirmed one changes nothing", async () => {
    const signup = await subscribeToNewsletter({ email: "return@example.invalid", locale: "en", source: "newsletter" });
    await confirmNewsletterSubscriber(signup.confirmToken!);
    const again = await subscribeToNewsletter({ email: "return@example.invalid", locale: "en", source: "footer" });
    // Already confirmed: no token, no email, no state change.
    expect(again.confirmToken).toBeNull();
    expect(again.unsubscribeToken).toBeNull();
    expect(newsletterSubscribers).toHaveLength(1);
    expect(newsletterSubscribers[0].status).toBe("CONFIRMED");

    await unsubscribeNewsletterSubscriber(signup.unsubscribeToken!);
    const back = await subscribeToNewsletter({ email: "return@example.invalid", locale: "en", source: "footer" });
    expect(back.confirmToken).toBeTruthy();
    expect(newsletterSubscribers[0].status).toBe("PENDING");
  });

  it("counts by status", async () => {
    const first = await subscribeToNewsletter({ email: "a@example.invalid", locale: "en", source: "t" });
    await subscribeToNewsletter({ email: "b@example.invalid", locale: "en", source: "t" });
    await confirmNewsletterSubscriber(first.confirmToken!);
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

  it("answers ok for a new address and stores nothing when the honeypot is filled", async () => {
    expect((await POST(req({ email: "ok@example.invalid", source: "t" }))).status).toBe(200);
    expect(newsletterSubscribers).toHaveLength(1);
    const bot = await POST(req({ email: "bot@example.invalid", source: "t", fax: "1" }));
    expect(bot.status).toBe(200);
    expect(newsletterSubscribers).toHaveLength(1);
  });

  it("gives the same response for an address that is already confirmed (non-disclosure)", async () => {
    const first = await POST(req({ email: "known@example.invalid", source: "t" }));
    const before = await first.json();
    const signup = newsletterSubscribers[0];
    signup.status = "CONFIRMED";
    signup.confirmTokenHash = null;
    const second = await POST(req({ email: "known@example.invalid", source: "t" }));
    const after = await second.json();
    expect(second.status).toBe(first.status);
    expect(after).toEqual(before);
    // Nothing was re-sent: still exactly one subscriber.
    expect(newsletterSubscribers).toHaveLength(1);
  });

  it("confirms through the API with CSRF and refuses unknown tokens", async () => {
    const signup = await subscribeToNewsletter({ email: "route@example.invalid", locale: "en", source: "t" });
    const bad = await CONFIRM(req({ token: "nonsense-not-hex" }, "/api/newsletter/confirm"));
    expect(bad.status).toBe(400);
    const noCsrf = await CONFIRM(req({ token: signup.confirmToken }, "/api/newsletter/confirm", { csrf: false }));
    expect(noCsrf.status).toBe(403);
    const good = await CONFIRM(req({ token: signup.confirmToken }, "/api/newsletter/confirm"));
    expect(good.status).toBe(200);
    expect(newsletterSubscribers[0].status).toBe("CONFIRMED");
  });

  it("unsubscribes through the API", async () => {
    const signup = await subscribeToNewsletter({ email: "gone@example.invalid", locale: "en", source: "t" });
    await confirmNewsletterSubscriber(signup.confirmToken!);
    const response = await UNSUBSCRIBE(req({ token: signup.unsubscribeToken }, "/api/newsletter/unsubscribe"));
    expect(response.status).toBe(200);
    expect(newsletterSubscribers[0].status).toBe("UNSUBSCRIBED");
  });
});
