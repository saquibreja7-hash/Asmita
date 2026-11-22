import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// WP155 (docs/lab/open-tools-spec.md): the /lab/open-tools/how-we-choose
// page — the spec's five blocks (what "open" means here, what we check
// before listing, what we do not list, how to suggest a tool or report
// an error, and the ROOST credit), the Lab gate, the English-only body
// with translated chrome in the Hindi locale, and the sitemap and
// translation-status wiring. The live-browser behaviour (the walk, the
// full audit) is asserted by tests/e2e/lab-open-tools-journey.spec.ts
// and tests/e2e/lab-open-tools-audit.spec.ts.

vi.mock("next/link", () => ({
  // next/link needs the app router; a plain anchor carries the same markup
  // contract here (href and children).
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    createElement("a", { href, className }, children),
}));
vi.mock("@/components/layout/AppShell", () => ({
  // AppShell is an async server component (it awaits cookies), which the
  // synchronous renderToStaticMarkup cannot run; the assertions are all
  // about the page's own content, so the shell renders as itself.
  AppShell: ({ children }: { children: React.ReactNode }) => children,
}));
let localeCookie: string | undefined;
vi.mock("next/headers", () => ({
  // getLocale() outside a request: an empty cookie store reads as English;
  // setting the language cookie renders the Hindi chrome.
  cookies: vi.fn(async () => ({
    get: (name: string) => (name === "asmita_lang" && localeCookie ? { value: localeCookie } : undefined),
  })),
}));

import HowWeChoosePage, { metadata } from "@/app/(public)/lab/open-tools/how-we-choose/page";
import OpenToolsPage from "@/app/(public)/lab/open-tools/page";
import { OPEN_TOOLS } from "@/lib/lab/open-tools/catalogue";
import { allPublicPaths, siteMap } from "@/lib/site-map";
import en from "@/i18n/en.json";
import hi from "@/i18n/hi.json";

const asmitaDir = fileURLToPath(new URL("../..", import.meta.url));

const BANNED_WORDS = [
  "revolutionary",
  "cutting-edge",
  "seamless",
  "robust",
  "leverage",
  "empower",
  "harness",
  "game-changer",
  "unlock",
  "state-of-the-art",
  "comprehensive solution",
  "in today's digital landscape",
];

const HOW_KEYS = [
  "lab.openTools.how.title",
  "lab.openTools.how.lede",
  "lab.openTools.how.openMeans",
  "lab.openTools.how.weCheck",
  "lab.openTools.how.notList",
  "lab.openTools.how.suggest",
  "lab.openTools.how.credit",
];

/** A static render with HTML entities decoded, so the assertions can
 * compare against the page's own strings. The page is an async server
 * component (it awaits getLocale), so it is awaited first. */
async function markup() {
  const page = await HowWeChoosePage();
  const html = renderToStaticMarkup(page);
  return html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&");
}

async function hindiMarkup() {
  localeCookie = "hi";
  try {
    return await markup();
  } finally {
    localeCookie = undefined;
  }
}

describe("the how-we-choose page and its Lab gate", () => {
  it("answers 404 while the Lab is off", async () => {
    vi.stubEnv("ENABLE_LAB", "false");
    const rejection = await HowWeChoosePage().then(
      () => null,
      (error: unknown) => error,
    );
    vi.unstubAllEnvs();
    expect(rejection).toBeTruthy();
    const digest = (rejection as { digest?: string })?.digest ?? String(rejection);
    expect(digest).toMatch(/404/);
  });

  it("renders past the gate while the Lab is on", async () => {
    vi.stubEnv("ENABLE_LAB", "true");
    const html = await markup();
    vi.unstubAllEnvs();
    expect(html).toContain("How we choose tools");
  });

  it("carries page metadata", () => {
    expect(metadata.title).toBe("How we choose tools — Open tools — Asmita AI Lab");
    expect((metadata.description ?? "").length).toBeGreaterThan(20);
  });

  it("has its page file behind the route the directory hero and the sitemap name", () => {
    const page = join(asmitaDir, "src", "app", "(public)", "lab", "open-tools", "how-we-choose", "page.tsx");
    expect(existsSync(page)).toBe(true);
    expect(allPublicPaths).toContain("/lab/open-tools/how-we-choose");
    const entry = siteMap
      .flatMap((group) => group.links)
      .find((link) => link.href === "/lab/open-tools/how-we-choose");
    expect(entry?.label).toBe("How we choose tools");
    const sitemapSource = readFileSync(join(asmitaDir, "src", "app", "(public)", "sitemap", "page.tsx"), "utf8");
    expect(sitemapSource).toContain('"/lab/open-tools/how-we-choose":');
  });

  it("is linked from the directory hero", async () => {
    vi.stubEnv("ENABLE_LAB", "true");
    const html = renderToStaticMarkup(await OpenToolsPage() as unknown as React.ReactElement);
    vi.unstubAllEnvs();
    expect(html).toContain('href="/lab/open-tools/how-we-choose"');
  });
});

describe("the how-we-choose page body", () => {
  it("renders the breadcrumb, the title and the lede", async () => {
    const html = await markup();
    expect(html).toContain(">AI Lab</a>");
    expect(html).toContain(">Open tools</a>");
    expect(html).toContain('<span class="ot-crumb-here" aria-current="page">How we choose tools</span>');
    expect(html).toContain('<h1 class="page-title mt-5">How we choose tools</h1>');
    expect(html).toContain("What 'open' means in this directory, what we check before a tool is listed");
  });

  it("renders the five sections in the spec's order, with headings in order", async () => {
    const html = await markup();
    // The spec's five blocks, each an h2 in this order.
    const sections = [
      ["ot-how-open", "What 'open' means here"],
      ["ot-how-check", "What we check before listing"],
      ["ot-how-not", "What we do not list"],
      ["ot-how-suggest", "Suggest a tool or report an error"],
      ["ot-how-credit", "Credit"],
    ] as const;
    const positions = sections.map(([id]) => html.indexOf(`<h2 id="${id}"`));
    expect(positions.every((position) => position > -1)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    for (const [, heading] of sections) {
      expect(html).toContain(`${heading}</h2>`);
    }
    // One h1, then h2 sections only: no level is skipped.
    expect(html.match(/<h1/g)?.length).toBe(1);
    expect(html).not.toMatch(/<h[3-6][\s>]/);
  });

  it("says what open means, and names the three not-open-source services", async () => {
    const html = await markup();
    expect(html).toContain("anyone can download its source code or model weights");
    expect(html).toContain("no paid tier is required for the core function");
    expect(html).toContain("the licence has to allow the uses a real service needs");
    // The three services are exactly the catalogue's not-open-source trio.
    const closed = OPEN_TOOLS.filter((tool) => !tool.openSource);
    expect(closed.map((tool) => tool.slug)).toEqual(["stopncii", "take-it-down", "asmita-fingerprint-feed"]);
    expect(html).toContain("StopNCII.org");
    expect(html).toContain("Take It Down");
    expect(html).toContain("fingerprint feed for approved partner platforms");
    expect(html).toContain("carries the Not open source mark");
  });

  it("lists the five checks", async () => {
    const html = await markup();
    expect(html).toContain("we check five things");
    for (const label of ["Licence", "Maintenance", "Fit", "Privacy", "Limits"]) {
      expect(html).toContain(`<strong>${label}.</strong>`);
    }
    expect(html).toContain("the licence text itself");
    expect(html).toContain("release or a commit in the last 18 months");
    expect(html).toContain("prevent, detect, review, act, share");
    expect(html).toContain("without sending images to a third party");
    expect(html).toContain("'What it cannot do' section, and it is never empty");
    expect(html).toContain("the date we last checked its facts");
  });

  it("lists the three kinds of tool it never lists", async () => {
    const html = await markup();
    expect(html).toContain("Three kinds of tool never get a page here");
    expect(html).toContain("licence forbids commercial use for its core function");
    expect(html).toContain("sending intimate images to an unknown third party");
    expect(html).toContain("Anything that generates sexual content");
  });

  it("points suggestions and error reports at the feedback form", async () => {
    const html = await markup();
    expect(html).toContain("a correction is as welcome as a suggestion");
    expect(html).toContain('href="/feedback" class="btn btn-secondary"');
    expect(html).toContain(">Suggest a tool</a>");
  });

  it("carries the spec's credit sentence with both ROOST repositories", async () => {
    const html = await markup();
    expect(html).toContain("Our list draws on ROOST's");
    expect(html).toContain("directory (CC BY 4.0) and the");
    expect(html).toContain("https://github.com/roostorg/awesome-safety-tools");
    expect(html).toContain("https://github.com/roostorg/model-community");
    expect(html).toContain("ROOST Model Community");
  });

  it("labels every external link with the hidden hint", async () => {
    const html = await markup();
    const external = html.match(/<a class="text-link" href="https:/g) ?? [];
    const hints = html.match(/\(opens the official site\)/g) ?? [];
    expect(external.length).toBe(2);
    expect(hints.length).toBe(external.length);
  });

  it("keeps the owner's banned marketing words and exclamation marks out", async () => {
    const html = await markup();
    for (const word of BANNED_WORDS) {
      expect(html.toLowerCase(), word).not.toContain(word);
    }
    expect(html).not.toContain("!");
  });
});

describe("the Hindi render of how-we-choose", () => {
  it("shows the English-only notice and the translated chrome", async () => {
    const html = await hindiMarkup();
    expect(html).toContain(
      "यह पृष्ठ अंग्रेज़ी में है क्योंकि यह तकनीकी टीमों के लिए लिखा गया है।",
    );
    expect(html).toContain('<h1 class="page-title mt-5">हम टूल कैसे चुनते हैं</h1>');
    expect(html).toContain(">ओपन टूल</a>");
    expect(html).toContain("श्रेय");
    expect(html).toContain("टूल सुझाएँ या त्रुटि बताएँ");
    expect(html).toContain(">टूल सुझाएँ</a>");
  });

  it("keeps the body English, straight from the page module", async () => {
    const html = await hindiMarkup();
    expect(html).toContain("anyone can download its source code or model weights");
    expect(html).toContain("we check five things");
  });
});

describe("the how-we-choose i18n and translation-status wiring", () => {
  it("carries the seven new keys in both dictionaries, non-empty", () => {
    for (const key of HOW_KEYS) {
      expect((en as Record<string, string>)[key].trim().length, `en ${key}`).toBeGreaterThan(0);
      expect((hi as Record<string, string>)[key].trim().length, `hi ${key}`).toBeGreaterThan(0);
    }
  });

  it("keeps the banned words and exclamation marks out of both dictionaries", () => {
    for (const key of HOW_KEYS) {
      for (const dictionary of [en, hi] as Record<string, string>[]) {
        for (const word of BANNED_WORDS) {
          expect(dictionary[key].toLowerCase(), `${key}: ${word}`).not.toContain(word);
        }
        expect(dictionary[key], key).not.toContain("!");
      }
    }
  });

  it("records the route in excludedFromTranslation and the keys as machine translated", () => {
    const status = JSON.parse(readFileSync(join(asmitaDir, "src", "i18n", "hi-review-status.json"), "utf8"));
    const excluded = status.excludedFromTranslation as string[];
    expect(excluded.some((entry) => entry.startsWith("/lab/open-tools/how-we-choose"))).toBe(true);
    expect(status.machineTranslated.keys).toContain("lab.openTools.*");
    expect(status.machineTranslated.by).toContain("WP155");
  });
});
