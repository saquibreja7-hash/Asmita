import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "@/i18n/en.json";
import hi from "@/i18n/hi.json";
import status from "@/i18n/hi-review-status.json";

/*
 * WP29 (legal pages): the privacy policy and the terms of use describe every
 * new feature - image and video fingerprints, the crawler, watch mode and
 * removal checks, partner sharing, SSCD, platform partner sign-ups, and the
 * 24-hour ask in notices. These tests pin what the owner asked for: stable
 * section ids tick boxes elsewhere can link to, copy that exists in both
 * dictionaries (English only by design), the 19 November 2026 date, no
 * coloured left-border stripes, and no law citation outside the allowed set.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const privacySrc = read("src/app/(public)/privacy/page.tsx");
const termsSrc = read("src/app/(public)/terms/page.tsx");
const legalSrc = read("src/app/legal/page.tsx");
const E = en as Record<string, string>;
const H = hi as Record<string, string>;

// Every section id WP29 adds, so tick boxes elsewhere can link to them.
const NEW_PRIVACY_IDS = [
  "fingerprints",
  "video",
  "crawler",
  "watch",
  "partner-sharing",
  "sscd",
  "platform-partners",
] as const;

// The WP29 keys are exactly the privacy keys whose two dictionaries agree:
// every new or reworded paragraph is English only (owner decision), so the
// Hindi value is the English text until a Hindi pass is run on them. The one
// exception is the date stamp, which keeps its Hindi label. When a Hindi
// pass runs, the derived set becomes empty on purpose and this test follows.
const wp29Keys = Object.keys(en)
  .filter((k) => k.startsWith("privacy.") && E[k] === H[k] && E[k] !== "")
  .filter((k) => k !== "privacy.hero.version")
  .sort();

const wp29Text = wp29Keys.map((k) => E[k]).join(" ");
// JSX strings wrap across lines; normalise whitespace for phrase checks.
const termsText = termsSrc.replace(/\s+/g, " ");

describe("legal pages: structure and links", () => {
  it("gives every new privacy section a stable id with a matching contents entry", () => {
    for (const id of NEW_PRIVACY_IDS) {
      expect(privacySrc).toContain(`<ReadingSection id="${id}"`);
      expect(privacySrc).toMatch(new RegExp(`\\{ id: "${id}",\\s*title: t\\(locale, "privacy\\.toc\\.`));
    }
  });

  it("keeps the contents list and the rendered sections in step, with unique ids", () => {
    const tocIds = [...privacySrc.matchAll(/\{ id: "([\w-]+)",\s*title:/g)].map((m) => m[1]);
    const sectionIds = [...privacySrc.matchAll(/<ReadingSection id="([\w-]+)"/g)].map((m) => m[1]);
    expect(new Set(tocIds).size).toBe(tocIds.length);
    expect(new Set(sectionIds).size).toBe(sectionIds.length);
    expect(tocIds.sort()).toEqual(sectionIds.sort());
  });

  it("keeps the terms page sections and contents in step, and adds the search-and-watch section", () => {
    const tocIds = [...termsSrc.matchAll(/\{ id: "([\w-]+)", title:/g)].map((m) => m[1]);
    const sectionIds = [...termsSrc.matchAll(/<ReadingSection id="([\w-]+)"/g)].map((m) => m[1]);
    expect(new Set(tocIds).size).toBe(tocIds.length);
    expect(tocIds.sort()).toEqual(sectionIds.sort());
    expect(termsSrc).toContain('<ReadingSection id="search-and-watch"');
  });

  it("serves /legal as the terms page", () => {
    expect(legalSrc.trim()).toBe('export { default } from "@/app/(public)/terms/page";');
  });

  it("carries no coloured left-border stripes", () => {
    expect(privacySrc).not.toMatch(/border-l/);
    expect(termsSrc).not.toMatch(/border-l/);
  });

  it("stamps 19 November 2026 on both pages", () => {
    expect(E["privacy.hero.version"]).toContain("Last updated · 19 November 2026");
    expect(termsSrc).toContain("Last updated · 19 November 2026");
  });
});

describe("legal pages: i18n keys", () => {
  it("has every key the privacy page references, literal and list-built", () => {
    const keys = new Set<string>();
    for (const m of privacySrc.matchAll(/t\(locale, "(privacy\.[^"]+)"/g)) keys.add(m[1]);
    for (const m of privacySrc.matchAll(/(?:cards|rows)\(locale, "(\w+)", \[([^\]]*)\]/g)) {
      const items = [...m[2].matchAll(/"(\w+)"/g)].map((i) => i[1]);
      for (const item of items) {
        keys.add(`privacy.${m[1]}.${item}.bold`);
        keys.add(`privacy.${m[1]}.${item}.detail`);
      }
    }
    expect(keys.size).toBeGreaterThan(150);
    for (const key of keys) expect(E[key], key).toBeTypeOf("string");
    for (const key of keys) expect(H[key], key).toBeTypeOf("string");
  });

  it("found the WP29 English-only copy (update the derivation when a Hindi pass runs)", () => {
    expect(wp29Keys.length).toBeGreaterThan(90);
    for (const key of wp29Keys) {
      expect(key).toMatch(/^privacy\.(fp|video|crawl|watch|pshare|sscd|ppartners|toc\.|tldr\.|s0\d|s1\d)/);
      expect(key).not.toMatch(/^privacy\.s02\./); // untouched sections keep their Hindi
    }
  });

  it("records the WP29 sections as excluded from translation", () => {
    expect(status.excludedFromTranslation.some((e: string) => e.includes("/privacy") && e.includes("WP29"))).toBe(true);
  });
});

describe("legal pages: the copy itself", () => {
  it("states the owner's facts, not more", () => {
    for (const phrase of [
      "within 24 hours", // notices ask platforms to act within 24 hours
      "12 months", // the re-upload watch window
      "at most 1,000 codes", // the vPDQ frame cap
      "not one frame of it is ever sent", // the video never leaves her device
      "Cloudflare", // crawler hosting
      "Mumbai", // where the stored records stay
      "one day, three days and seven days", // removal checks
      "Never your image, your video or your name", // partner sharing
      "encrypted at rest", // partner-programme contacts
      "deleted with your fingerprint, your authorisation or your case", // SSCD retention
    ]) {
      expect(wp29Text, phrase).toContain(phrase);
    }
    for (const phrase of [
      "within 24 hours",
      "images or videos, generated on your device",
      "authorised representative",
      "12 months",
      "one, three and seven days",
      "never your images or your name",
    ]) {
      expect(termsText, phrase).toContain(phrase);
    }
  });

  it("keeps the SSCD layer honestly switched off", () => {
    expect(E["privacy.sscd.i5.bold"]).toContain("off until switched on");
    expect(E["privacy.sscd.p1"]).toContain("Asmita has designed a second matching layer");
  });

  it("cites no law outside the allowed set, and leaves nothing untagged", () => {
    // Instruments the pages may cite: already on these pages, PRD Section 4,
    // or the MeitY NCII SOP (October/November 2025). The full policy and the
    // terms are scanned, not just the new copy, so a stray citation anywhere
    // on a legal page fails here. Anything else would need the
    // "[CITATION REQUIRED - verify with legal advisor]" tag, and no legal
    // page ships with an open tag.
    const allowed = [
      "Digital Personal Data Protection Act",
      "DPDP Act",
      "Information Technology Act",
      "IT Rules",
      "Bharatiya Nyaya Sanhita",
      "Section 7",
      "Section 199",
    ];
    const fullText = `${Object.keys(en)
      .filter((k) => k.startsWith("privacy."))
      .map((k) => E[k])
      .join(" ")} ${termsText}`.replace(/\s+/g, " ");
    const mentions =
      fullText.match(/[A-Za-z][\w\s(),.]{0,70}(?:Act|Rules)|Bharatiya Nyaya Sanhita|Section \d+/g) ?? [];
    expect(mentions.length).toBeGreaterThan(5);
    for (const mention of mentions) {
      expect(
        allowed.some((a) => mention.includes(a)),
        `unapproved law mention: ${mention}`,
      ).toBe(true);
    }
    expect(fullText).not.toContain("[CITATION REQUIRED");
  });

  it("never promises removal, and keeps the human review in the story", () => {
    for (const text of [wp29Text, termsText]) {
      expect(text).toMatch(/reviewer|a person reviews/i);
      expect(text).not.toMatch(/guarantee removal|will find every copy|we will remove/i);
    }
  });
});
