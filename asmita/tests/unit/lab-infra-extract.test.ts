import { describe, expect, it } from "vitest";
import { extractHeaderFindings, extractHtmlFindings } from "@/lib/lab/infra/extract";
import { SIGNATURE_VERSION, SIGNATURES, hostMatches } from "@/lib/lab/infra/signatures";

/*
 * WP114 (research-tools-spec.md): signature matching and the link-based
 * extractors, over invented HTML fixtures. The only real-looking strings in
 * these fixtures are the documented SDK hosts the signatures themselves
 * list (signatures.json carries each provider's documentation URL); the
 * services, landing pages and links around them are invented example.test
 * addresses.
 */

function htmlOf(body: string): string {
  return `<!doctype html><html><head><title>Example undress tool - invented fixture</title></head><body>${body}</body></html>`;
}

function findingsOf(body: string) {
  const all = extractHtmlFindings(htmlOf(body));
  const summary = all.map((f) => `${f.category}:${f.value}`);
  return { all, summary };
}

describe("the signature file", () => {
  it("is versioned, every entry cites a provider documentation source", () => {
    expect(SIGNATURE_VERSION).toMatch(/^[0-9]+$/);
    for (const signature of SIGNATURES) {
      expect(signature.source).toMatch(/^https:\/\//);
      expect(signature.source.length).toBeGreaterThan(10);
    }
  });

  it("host matching is exact or a subdomain, never a suffix trick", () => {
    expect(hostMatches("js.stripe.com", "js.stripe.com")).toBe(true);
    // js.stripe.com is a subdomain of stripe.com — a bare-domain signature
    // matches its subdomains on purpose.
    expect(hostMatches("js.stripe.com", "stripe.com")).toBe(true);
    expect(hostMatches("cdn.js.stripe.com", "js.stripe.com")).toBe(true);
    // But the signature host must appear as whole labels, never inside
    // another name.
    expect(hostMatches("js.stripe.com.example.test", "js.stripe.com")).toBe(false);
    expect(hostMatches("notjs.stripe.com", "js.stripe.com")).toBe(false);
    expect(hostMatches("notjs.stripe.com.example.test", "js.stripe.com")).toBe(false);
  });
});

describe("payment SDK signatures", () => {
  it("matches script hosts for checkout SDKs", () => {
    const { all, summary } = findingsOf(
      `<script src="https://js.stripe.com/v3/"></script>` +
        `<script src="https://checkout.razorpay.com/v1/checkout.js"></script>` +
        `<script src="https://www.paypal.com/sdk/js?client-id=test"></script>`,
    );
    expect(summary).toContain("PAYMENT:js.stripe.com");
    expect(summary).toContain("PAYMENT:checkout.razorpay.com");
    expect(summary).toContain("PAYMENT:www.paypal.com");
    const stripe = all.find((f) => f.value === "js.stripe.com")!;
    expect(stripe.evidence).toBe("script src host js.stripe.com");
    expect(stripe.provider).toBe("Stripe");
    expect(stripe.confidence).toBe("HIGH");
  });

  it("matches hosted checkout links", () => {
    const { summary } = findingsOf(`<a href="https://commerce.coinbase.com/checkout/6da189f179bc31">Upgrade</a>`);
    expect(summary).toContain("PAYMENT:commerce.coinbase.com");
  });

  it("ignores a same-named host on an unrelated domain", () => {
    const { summary } = findingsOf(`<script src="https://js.stripe.com.example.test/v3/"></script>`);
    expect(summary.find((s) => s.startsWith("PAYMENT:"))).toBeUndefined();
  });
});

describe("login widget signatures", () => {
  it("matches script hosts for Google, Apple and Telegram login widgets", () => {
    const { summary } = findingsOf(
      `<script src="https://accounts.google.com/gsi/client" async></script>` +
        `<script src="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js"></script>` +
        `<script src="https://telegram.org/js/telegram-widget.js?22" data-telegram-login="ExampleBot"></script>`,
    );
    expect(summary).toContain("AUTH_SSO:accounts.google.com");
    expect(summary).toContain("AUTH_SSO:appleid.cdn-apple.com");
    expect(summary).toContain("AUTH_SSO:telegram.org");
  });

  it("matches the Discord OAuth authorize URL in the HTML", () => {
    const { all, summary } = findingsOf(`<a href="https://discord.com/oauth2/authorize?client_id=123">Login with Discord</a>`);
    expect(summary).toContain("AUTH_SSO:discord.com/oauth2/authorize");
    expect(all.find((f) => f.category === "AUTH_SSO")!.provider).toBe("Discord");
  });
});

describe("analytics ID extraction", () => {
  it("extracts a GA4 measurement id from the gtag snippet", () => {
    const { all, summary } = findingsOf(
      `<script async src="https://www.googletagmanager.com/gtag/js?id=G-PSW1MY7HB4"></script>`,
    );
    expect(summary).toContain("ANALYTICS_ID:G-PSW1MY7HB4");
    expect(all.find((f) => f.value === "G-PSW1MY7HB4")!.provider).toBe("Google Analytics 4");
  });

  it("extracts a GTM container id and a Meta pixel id", () => {
    const { summary } = findingsOf(
      `<script>(function(w,d,s,l,i){w[l]=w[l]||[]};...)('GTM-K9Q8N7X');</script>` +
        `<script>fbq('init', '123456789012345'); fbq('track', 'PageView');</script>`,
    );
    expect(summary).toContain("ANALYTICS_ID:GTM-K9Q8N7X");
    expect(summary).toContain("ANALYTICS_ID:123456789012345");
  });

  it("does not turn plain words into tag ids", () => {
    const { summary } = findingsOf(`<p>G- is a grade. GTM- is not an id. The G-1234 is too short.</p>`);
    expect(summary.filter((s) => s.startsWith("ANALYTICS_ID:"))).toEqual([]);
  });
});

describe("ads signature", () => {
  it("matches the AdSense script host", () => {
    const { summary } = findingsOf(
      `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1234"></script>`,
    );
    expect(summary).toContain("ADS:pagead2.googlesyndication.com");
  });
});

describe("response-header signatures", () => {
  it("maps cdn headers to provider findings with medium confidence", () => {
    const cloudflare = extractHeaderFindings(new Headers({ "cf-ray": "8f5b6c7d8e9f0a1b-DEL" }));
    expect(cloudflare).toEqual([
      {
        category: "CDN",
        value: "Cloudflare",
        evidence: "response header cf-ray",
        confidence: "MEDIUM",
        provider: "Cloudflare",
      },
    ]);

    const fastly = extractHeaderFindings(new Headers({ "x-served-by": "cache-iad2120-IAD" }));
    expect(fastly[0]!.value).toBe("Fastly");

    const akamai = extractHeaderFindings(new Headers({ server: "AkamaiGHost" }));
    expect(akamai[0]!.value).toBe("Akamai");

    // A server header that does not match stays silent.
    expect(extractHeaderFindings(new Headers({ server: "nginx" }))).toEqual([]);
    expect(extractHeaderFindings(new Headers({ "x-served-by": "example-cache-01" }))).toEqual([]);
  });
});

describe("link extractors", () => {
  it("marks telegram links and bots", () => {
    const { all } = findingsOf(
      `<a href="https://t.me/example_tools_bot">Bot</a> <a href="https://t.me/example_channel">Channel</a>`,
    );
    const telegram = all.filter((f) => f.category === "TELEGRAM_LINK");
    expect(telegram).toHaveLength(2);
    expect(telegram.find((f) => f.value.includes("example_tools_bot"))!.evidence).toContain("telegram bot link");
    expect(telegram.find((f) => f.value.includes("example_channel"))!.evidence).toBe(
      "telegram link https://t.me/example_channel",
    );
  });

  it("marks app store and model repository links", () => {
    const { summary } = findingsOf(
      `<a href="https://play.google.com/store/apps/details?id=com.example.app">Play</a>` +
        `<a href="https://apps.apple.com/app/example/id123">App Store</a>` +
        `<a href="https://huggingface.co/example-org/example-model">Model</a>` +
        `<a href="https://civitai.com/models/12345/example-model">Civitai</a>`,
    );
    expect(summary).toContain("APP_STORE_LINK:https://play.google.com/store/apps/details?id=com.example.app");
    expect(summary.find((s) => s.startsWith("APP_STORE_LINK:https://apps.apple.com"))).toBeDefined();
    expect(summary.find((s) => s.startsWith("MODEL_REPO_LINK:https://huggingface.co/"))).toBeDefined();
    expect(summary.find((s) => s.startsWith("MODEL_REPO_LINK:https://civitai.com/"))).toBeDefined();
  });

  it("marks social links on mainstream hosts", () => {
    const { summary } = findingsOf(
      `<a href="https://www.instagram.com/example.app.page/">Instagram</a>` +
        `<a href="https://x.com/example_app">X</a>` +
        `<a href="https://www.youtube.com/@exampleapp">YouTube</a>`,
    );
    expect(summary).toContain("SOCIAL_LINK:https://www.instagram.com/example.app.page/");
    expect(summary).toContain("SOCIAL_LINK:https://x.com/example_app");
    expect(summary).toContain("SOCIAL_LINK:https://www.youtube.com/@exampleapp");
  });

  it("marks referral parameters and keeps credentials out of values", () => {
    const { all, summary } = findingsOf(
      `<a href="https://billing.example.test/upgrade?ref=example92">Upgrade</a>` +
        `<a href="https://other.example.test/?aff=77">Affiliate</a>` +
        `<a href="https://plain.example.test/">No referral</a>`,
    );
    const referrals = all.filter((f) => f.category === "REFERRAL_LINK");
    expect(referrals).toHaveLength(2);
    expect(referrals.find((f) => f.evidence.includes("parameter ref"))).toBeDefined();
    expect(referrals.find((f) => f.evidence.includes("parameter aff"))).toBeDefined();
    expect(summary).not.toContain("REFERRAL_LINK:https://plain.example.test/");
  });

  it("dedupes a repeated finding", () => {
    const { all } = findingsOf(
      `<script src="https://js.stripe.com/v3/"></script><script src="https://js.stripe.com/v3/"></script>`,
    );
    expect(all.filter((f) => f.value === "js.stripe.com")).toHaveLength(1);
  });
});
