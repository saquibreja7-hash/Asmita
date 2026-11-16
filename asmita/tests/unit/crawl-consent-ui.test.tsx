import { describe, expect, it } from "vitest";
import en from "@/i18n/en.json";
import hi from "@/i18n/hi.json";
import status from "@/i18n/hi-review-status.json";

const crawlKeys = (dict: Record<string, string>) => Object.keys(dict).filter((k) => k.startsWith("crawl.") || k.startsWith("case.found."));

describe("crawl consent copy", () => {
  it("has every crawl key in both languages, none blank", () => {
    expect(crawlKeys(hi).sort()).toEqual(crawlKeys(en).sort());
    for (const key of crawlKeys(hi)) expect((hi as Record<string, string>)[key]).not.toBe("");
  });

  it("is recorded as AI-translated and not yet human reviewed, with the authorisation English-only", () => {
    expect(status.pendingNativeReview.keys).toEqual(expect.arrayContaining(["crawl.*", "case.found.*"]));
    expect(status.excludedFromTranslation.some((e) => e.includes("Crawl authorisation"))).toBe(true);
  });

  it("says what the owner asked and promises nothing it cannot keep", () => {
    const text = crawlKeys(en as Record<string, string>).map((k) => (en as Record<string, string>)[k]).join(" ").toLowerCase();
    for (const phrase of ["limited list of public websites", "never keeps the images", "trained asmita reviewer", "private groups", "login", "cropped or edited", "at any time", "within about an hour", "cannot be recalled"]) {
      expect(text).toContain(phrase);
    }
    expect(text).not.toMatch(/cannot be reversed|guarantee|will find|will remove/);
  });

  it("starts unticked and the box label is the agreed one", () => {
    expect((en as Record<string, string>)["crawl.checkbox"]).toBe("Search the internet for more copies of my images");
  });
});
