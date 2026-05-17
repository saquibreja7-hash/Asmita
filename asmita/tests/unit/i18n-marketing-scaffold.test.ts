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

  it("leaves the new homepage marketing keys empty in Hindi pending native-speaker review", () => {
    const homepageKeys = Object.keys(hi).filter((key) => key.startsWith("home."));
    expect(homepageKeys.length).toBeGreaterThan(0);
    for (const key of homepageKeys) {
      expect((hi as Record<string, string>)[key]).toBe("");
    }
  });

  it("falls back to English when the Hindi value is empty (so untranslated pages still render)", () => {
    expect(t("hi", "home.hero.cta" as never)).toBe("Start a case");
    expect(t("hi", "home.hero.sub" as never)).toBe("Free, confidential, and built around your dignity.");
  });

  it("returns the Hindi value when one is present", () => {
    expect(t("hi", "nav.start" as never)).toBe("शुरू करें");
  });
});
