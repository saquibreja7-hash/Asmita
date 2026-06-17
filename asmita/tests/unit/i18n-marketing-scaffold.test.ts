import { describe, expect, it } from "vitest";
import en from "@/i18n/en.json";
import hi from "@/i18n/hi.json";
import { t } from "@/lib/i18n";

describe("i18n marketing scaffold", () => {
  it("has full key parity between en.json and hi.json", () => {
    const enKeys = Object.keys(en).sort();
    const hiKeys = Object.keys(hi).sort();
    expect(hiKeys).toEqual(enKeys);
  });

  it("keeps the existing chrome keys translated in Hindi (not blanked by the scaffold)", () => {
    expect((hi as Record<string, string>)["support.title"]).not.toBe("");
    expect((hi as Record<string, string>)["nav.howItWorks"]).not.toBe("");
  });

  it("has Hindi translations for all homepage marketing keys", () => {
    const homepageKeys = Object.keys(hi).filter((key) => key.startsWith("home."));
    expect(homepageKeys.length).toBeGreaterThan(0);
    for (const key of homepageKeys) {
      expect((hi as Record<string, string>)[key]).not.toBe("");
    }
  });

  it("returns Hindi value for translated homepage keys", () => {
    expect(t("hi", "home.hero.cta" as never)).toBe("केस शुरू करें");
    expect(t("hi", "home.hero.sub" as never)).toBe("निशुल्क, गोपनीय, और आपकी गरिमा के लिए बना।");
  });

  it("returns the Hindi value when one is present", () => {
    expect(t("hi", "nav.start" as never)).toBe("शुरू करें");
  });
});
