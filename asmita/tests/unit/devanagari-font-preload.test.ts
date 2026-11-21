import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Synthetic cookie + module mocks: no network, no real font bytes.
const fake = vi.hoisted(() => ({ lang: "" }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "asmita_lang" ? { value: fake.lang } : undefined),
  }),
}));
vi.mock("next/font/google", () => ({
  Noto_Sans: () => ({ variable: "--font-ui" }),
}));
const DEVANAGARI_400_URL = vi.hoisted(
  () => "/_next/static/media/noto-sans-devanagari-devanagari-400-normal.C0DE.woff2"
);
vi.mock("@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff2", () => ({
  default: DEVANAGARI_400_URL,
}));

import RootLayout from "@/app/layout";

async function renderLayout() {
  const tree = await RootLayout({ children: createElement("p", null, "synthetic") });
  return renderToStaticMarkup(tree);
}

describe("Devanagari font preload (WP45 P5)", () => {
  it("preloads the regular Devanagari woff2 on Hindi pages, with crossorigin", async () => {
    fake.lang = "hi";
    const markup = await renderLayout();
    expect(markup).toContain('lang="hi"');
    expect(markup).toContain('rel="preload"');
    expect(markup).toContain(`href="${DEVANAGARI_400_URL}"`);
    expect(markup).toContain('as="font"');
    expect(markup).toContain('type="font/woff2"');
    expect(markup).toContain('crossorigin="anonymous"');
  });

  it("does not preload the Devanagari font on English pages", async () => {
    fake.lang = "en";
    const markup = await renderLayout();
    expect(markup).toContain('lang="en"');
    expect(markup).not.toContain('as="font"');
    expect(markup).not.toContain("devanagari-400");
  });
});
