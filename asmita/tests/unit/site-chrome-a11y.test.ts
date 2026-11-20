import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Web audit WP39: site chrome, navigation, target sizes and CSS accessibility.
// The client components here read the router; the markup tests render the
// server snapshot the way crawl-consent-ui.test.ts does.
const mocks = vi.hoisted(() => ({ pathname: { current: "/" } }));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname.current,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import en from "@/i18n/en.json";
import hi from "@/i18n/hi.json";
import status from "@/i18n/hi-review-status.json";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { LanguageToggle } from "@/components/layout/LanguageToggle";
import { MobileMenu } from "@/components/layout/MobileMenu";
import { navGroups } from "@/components/layout/nav-config";
import { FlowProgress } from "@/components/FlowProgress";
import { CopyDraft } from "@/app/(victim)/case/[caseId]/CopyDraft";
import { EligibilityWizard } from "@/app/eligibility/EligibilityWizard";

const render = (element: ReturnType<typeof createElement>) => renderToStaticMarkup(element);
const src = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const firstTag = (html: string, tag: string) => html.match(new RegExp(`<${tag}[^>]*>`))![0];

beforeEach(() => {
  mocks.pathname.current = "/";
});

describe("skip link and main landmark (A1)", () => {
  it("renders the skip link as the first element of the page chrome, in both locales", () => {
    for (const locale of ["en", "hi"] as const) {
      const html = render(createElement(Header, { locale }));
      // Static rendering hoists an <img> preload link to the very front, so
      // "first" means: the first anchor, before any button or other link.
      const firstAnchor = html.indexOf("<a ");
      const head = html.slice(firstAnchor, firstAnchor + 200);
      expect(head).toContain('href="#main"');
      expect(head).toContain('class="skip-link"');
      expect(head).toContain(locale === "en" ? "Skip to main content" : "मुख्य सामग्री पर जाएँ");
      expect(html.indexOf("<button")).toBeGreaterThan(firstAnchor);
    }
  });

  it("gives main an id and programmatic focus so the link has a target", () => {
    const shell = src("src/components/layout/AppShell.tsx");
    expect(shell).toContain('id="main"');
    expect(shell).toContain("tabIndex={-1}");
  });
});

describe("accessible names come from i18n, not hard-coded English (A24)", () => {
  it("labels the header navigation and logo link in both locales", () => {
    const enHtml = render(createElement(Header, { locale: "en" }));
    expect(enHtml).toContain('aria-label="Primary"');
    expect(enHtml).toContain('aria-label="Asmita home"');
    const hiHtml = render(createElement(Header, { locale: "hi" }));
    expect(hiHtml).toContain('aria-label="मुख्य"');
    expect(hiHtml).toContain('aria-label="अस्मिता होम पेज"');
  });

  it("labels the footer logo link and language group in both locales", () => {
    const enHtml = render(createElement(Footer, { locale: "en" }));
    expect(enHtml).toContain('aria-label="Asmita home"');
    expect(enHtml).toContain('role="group"');
    expect(enHtml).toContain('aria-label="Language"');
    const hiHtml = render(createElement(Footer, { locale: "hi" }));
    expect(hiHtml).toContain('aria-label="अस्मिता होम पेज"');
    expect(hiHtml).toContain('aria-label="भाषा"');
  });

  it("labels the flow progress list in both locales", () => {
    expect(render(createElement(FlowProgress, { step: 2, locale: "en" }))).toContain('aria-label="Progress"');
    expect(render(createElement(FlowProgress, { step: 2, locale: "hi" }))).toContain('aria-label="प्रगति"');
  });

  it("labels the mobile navigation through the i18n key", () => {
    const menu = src("src/components/layout/MobileMenu.tsx");
    expect(menu).toContain('aria-label={t(locale, "nav.mobile")}');
  });
});

describe("mobile menu button (A14, A15)", () => {
  it("names the closed button by its visible text, without an aria-label override", () => {
    const html = render(createElement(MobileMenu, { locale: "en", groups: navGroups("en") }));
    const button = firstTag(html, "button");
    expect(button).toContain('aria-expanded="false"');
    expect(button).toContain('aria-controls="mobile-menu"');
    expect(button).not.toContain("aria-label");
    expect(html).toContain(">Menu</button>");
  });

  it("names the open button by the close text and hides the × glyph", () => {
    const menu = src("src/components/layout/MobileMenu.tsx");
    expect(menu).toContain('aria-hidden="true">×</span>');
    expect(menu).toContain('className="sr-only">{t(locale, "nav.menuClose")}');
  });

  it("returns focus to the menu button on Escape and outside tap", () => {
    const menu = src("src/components/layout/MobileMenu.tsx");
    expect(menu.match(/buttonRef\.current\?\.focus\(\);/g)?.length).toBe(2);
  });

  it("folds the submenus with buttons that control panels, not nested details", () => {
    const menu = src("src/components/layout/MobileMenu.tsx");
    expect(menu).toContain("aria-expanded={expanded}");
    expect(menu).toContain("aria-controls={`mobile-menu-group-${i}`}");
    expect(menu).toContain("hidden={!expanded}");
    expect(menu).not.toContain("<details");
    expect(menu).not.toContain("<summary");
  });
});

describe("language toggle (A16)", () => {
  it("is a labelled group with a thumb-sized target and lang on the Hindi button", () => {
    const html = render(createElement(LanguageToggle, { initialLocale: "en", label: "Language" }));
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Language"');
    expect((html.match(/<button /g) || []).length).toBe(2);
    expect(html).toContain('lang="hi"');
    expect(html).toContain("हिंदी");
    expect(html.match(/lang="/g)?.length).toBe(1);
  });
});

describe("CopyDraft (A19)", () => {
  it("keeps the live region outside the 44px copy button", () => {
    const html = render(
      createElement(CopyDraft, { label: "Notice text", copy: "Copy", copied: "Copied", text: "Hello" }),
    );
    const button = firstTag(html, "button");
    expect(button).toContain("min-h-[44px]");
    const buttonInner = html.slice(html.indexOf(button), html.indexOf("</button>"));
    expect(buttonInner).not.toContain("aria-live");
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('class="sr-only"');
  });
});

describe("eligibility wizard (A20)", () => {
  it("makes the question heading a focus target", () => {
    const html = render(createElement(EligibilityWizard, { locale: "en" }));
    expect(html).toContain('<h2 tabindex="-1"');
  });

  it("gives the back button a 44px target and focuses the heading on every change", () => {
    const wizard = src("src/app/eligibility/EligibilityWizard.tsx");
    expect(wizard).toContain("min-h-[44px]");
    // The old guard skipped question 1 when going back; every change now moves focus.
    expect(wizard).not.toContain("index > 0 || stop");
  });
});

describe("globals.css and layout metadata (P6, P7, P9, P10, P12, A18, A22, A26)", () => {
  const css = src("src/app/globals.css");

  it("leaves no px font sizes: everything scales with the root", () => {
    expect(css).not.toMatch(/font-size:\s*[^;}]*px/);
    expect(css).not.toMatch(/--text-[a-z-]+:\s*[0-9.]+px/);
    const htmlRule = css.match(/^html\s*\{[^}]*\}/m)![0];
    expect(htmlRule).not.toContain("font-size");
  });

  it("announces the text-scale meta through Next metadata", () => {
    expect(src("src/app/layout.tsx")).toContain('"text-scale": "scale"');
  });

  it("keeps a visible keyboard focus ring on inputs (A26)", () => {
    expect(css).toContain(".field:focus-visible");
    expect(css).toContain("outline: 2px solid var(--brand)");
  });

  it("draws input boundaries in smoke, above 3:1 (P6)", () => {
    expect((css.match(/border: 1px solid var\(--color-smoke\)/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it("clears the fixed Quick Exit pill (A18)", () => {
    expect(css).toMatch(/html:has\(\.quick-exit\) body\s*\{\s*padding-bottom/);
    expect(css).toMatch(/html:has\(\.quick-exit\)\s*\{\s*scroll-padding-bottom/);
  });

  it("gives the FAQ chevron empty alternative text (A22)", () => {
    expect(css).toContain('content: "↓" / ""');
  });

  it("wraps prose and long URLs, moves hover lifts behind no-preference, declares the scheme (P9, P10, P12)", () => {
    expect(css).toMatch(/\.reading-body p,\s*\n\.faq-answer\s*\{\s*\n\s*text-wrap: pretty;/);
    expect(css).toMatch(/\.reading-body,\s*\n\.chat-bubble\s*\{\s*\n\s*overflow-wrap: anywhere;/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\n\s*\.link-card:hover \{ transform: translateY\(-2px\); \}/);
    expect(css).toMatch(/\.home-help-tile:hover\s*\{\s*\n\s*transform: translateY\(-1px\);/);
    expect(css).toContain("color-scheme: light");
  });

  it("turns off all transitions under reduced motion", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?transition: none !important/);
  });
});

describe("new chrome strings (i18n parity and review status)", () => {
  const newKeys = [
    "nav.menuClose",
    "nav.skipToMain",
    "nav.primary",
    "nav.mobile",
    "nav.home",
    "nav.language",
    "flow.progress",
  ] as const;

  it("exists in both locales with a real translation", () => {
    for (const key of newKeys) {
      expect((en as Record<string, string>)[key]).toBeTruthy();
      expect((hi as Record<string, string>)[key]).toBeTruthy();
      expect((hi as Record<string, string>)[key]).not.toBe((en as Record<string, string>)[key]);
    }
  });

  it("is listed as machine translated in the Hindi review status", () => {
    expect(status.machineTranslated.keys).toEqual(expect.arrayContaining([...newKeys]));
  });
});
