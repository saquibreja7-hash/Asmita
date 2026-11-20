/*
 * WP43: accessibility of the "Is this image AI-made?" page (A4, A5, A6).
 *
 * The hidden file input is never a tab stop and always carries an accessible
 * name, so the visible button is the only tab stop (A6). The checking state is
 * a polite status, the result card is announced by moving focus to its
 * heading, and every error message is an assertive alert (A5, A4). The idle
 * markup is rendered with renderToStaticMarkup; the conditional states (they
 * appear only while a file is being read, which a static render cannot reach)
 * are pinned on the source, the same way admin-crawler-ui.test.ts pins markup
 * it cannot render. The live behaviour is asserted by the Playwright spec.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import en from "@/i18n/en.json";
import hi from "@/i18n/hi.json";
import { ImageChecker } from "@/app/(public)/check-image/ImageChecker";

const source = readFileSync(join(process.cwd(), "src/app/(public)/check-image/ImageChecker.tsx"), "utf8");

// The age gate is up, so the input renders disabled — exactly what she sees
// before ticking the age confirmation. The deep check is on and configured.
const idle = renderToStaticMarkup(
  createElement(ImageChecker, { locale: "en", deepCheckEnabled: true, deepCheckConfigured: true }),
);

function fileInput(html: string): string {
  const match = html.match(/<input[^>]*type="file"[^>]*>/);
  expect(match, "the page must render exactly one file input").not.toBeNull();
  return match![0];
}

describe("check-image hidden file input (A6)", () => {
  it("always carries an accessible name and is never a tab stop, so the visible button is the only one", () => {
    const input = fileInput(idle);
    // An accessible name, reused from the visible label above the button.
    expect(input).toContain(`aria-label="${(en as Record<string, string>)["check.upload.label"]}"`);
    // tabIndex={-1} at all times, also once the age gate is passed.
    expect(input).toContain('tabindex="-1"');
    expect(source).not.toMatch(/tabIndex=\{ageConfirmed \? 0 : -1\}/);
    expect(source).toMatch(/aria-label=\{t\(locale, "check\.upload\.label"\)\}[\s\S]{0,200}?tabIndex=\{-1\}/);
  });

  it("stays hidden from sight and from the tab order while the age gate is up", () => {
    const input = fileInput(idle);
    expect(input).toContain("sr-only");
    expect(input).toContain('disabled=""');
    expect(input).toContain('aria-hidden="true"');
    // The visible control it stands in for.
    expect(idle).toContain(`>${(en as Record<string, string>)["check.upload.button"]}</button>`);
  });

  it("uses a label that exists in both languages, so the name is never English-only", () => {
    const enLabel = (en as Record<string, string>)["check.upload.label"];
    const hiLabel = (hi as Record<string, string>)["check.upload.label"];
    expect(enLabel).toBeTruthy();
    expect(hiLabel).toBeTruthy();
    expect(hiLabel).not.toEqual(enLabel);
  });
});

describe("check-image announcements (A5, A4)", () => {
  it("announces the checking state politely", () => {
    expect(source).toMatch(/<p role="status"[^>]*>\{t\(locale, "check\.checking"\)\}<\/p>/);
    expect(source).toMatch(/<p role="status"[^>]*>\{t\(locale, "check\.deep\.checking"\)\}<\/p>/);
  });

  it("announces every error message assertively (role=alert)", () => {
    expect(source).toMatch(/<div role="alert"[^>]*>\s*<p[^>]*>\{t\(locale, "check\.error\.title"\)\}/);
    expect(source).toMatch(/<p role="alert"[^>]*>\{t\(locale, "check\.deep\.error"\)\}<\/p>/);
  });

  it("announces the result card by moving focus to its heading", () => {
    // The result title is a real, programmatically focusable heading.
    expect(source).toMatch(
      /<h2 ref=\{resultHeadingRef\} tabIndex=\{-1\}[^>]*>\s*\{t\(locale, "check\.result\.title"\)\}\s*<\/h2>/,
    );
    // And focus actually moves there when the reading finishes.
    expect(source).toMatch(/if \(status === "done"\) resultHeadingRef\.current\?\.focus\(\);/);
  });

  it("announces the deeper check's result the same way", () => {
    expect(source).toMatch(/ref=\{deepResultRef\}[\s\S]{0,40}?tabIndex=\{-1\}/);
    expect(source).toMatch(/if \(deepStatus === "done"\) deepResultRef\.current\?\.focus\(\);/);
  });

  it("keeps the WP35 and WP38 wording untouched: no new i18n keys were added", () => {
    // WP43 adds ARIA roles only; its one visible reuse is the existing
    // check.upload.label. The result strings are exactly as the copy tests pin them.
    expect(source).toContain('t(locale, "check.result.title")');
    expect(source).toContain('t(locale, "check.checking")');
    expect(source).toContain('t(locale, "check.error.title")');
  });
});
