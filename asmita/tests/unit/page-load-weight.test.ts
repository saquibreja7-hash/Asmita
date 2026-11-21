import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const asmitaDir = fileURLToPath(new URL("../..", import.meta.url));
const css = readFileSync(join(asmitaDir, "src/app/globals.css"), "utf8");
const blockOf = (selector: string) => {
  const match = css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
  expect(match, `globals.css should have a ${selector} rule`).toBeTruthy();
  return match![1];
};

describe("page-load weight (WP45 P3, P5, P8)", () => {
  it("the footer grain is a small SVG tile and the 480 KB JPEG is gone", () => {
    expect(blockOf(".site-footer::after")).toContain('url("/images/textures/grain.svg")');
    expect(css).not.toContain("grain-big.jpg");

    const svg = join(asmitaDir, "public/images/textures/grain.svg");
    expect(existsSync(svg), "grain.svg should exist in public/images/textures").toBe(true);
    expect(statSync(svg).size, "grain.svg should stay a few KB").toBeLessThanOrEqual(4096);
    expect(existsSync(join(asmitaDir, "public/images/textures/grain-big.jpg"))).toBe(false);
  });

  it("the footer grain keeps its soft-light blend and opacity", () => {
    const block = blockOf(".site-footer::after");
    expect(block).toContain("opacity: 0.5");
    expect(block).toContain("mix-blend-mode: soft-light");
  });

  it("the grain tile is procedural feTurbulence, not a raster image", () => {
    const svg = readFileSync(join(asmitaDir, "public/images/textures/grain.svg"), "utf8");
    expect(svg).toContain("feTurbulence");
    expect(svg).toContain('baseFrequency="0.4"');
  });

  it("body keeps Hindi text metrics matched across the Devanagari font swap", () => {
    const body = css.match(/^body\s*\{([^}]*)\}/m);
    expect(body, "globals.css should have a body rule").toBeTruthy();
    expect(body![1]).toContain("font-size-adjust: from-font");
  });

  it("the sticky header is solid parchment, with no backdrop blur", () => {
    const block = blockOf(".site-header");
    expect(block).not.toContain("backdrop-filter");
    expect(block).toContain("background: var(--color-parchment)");
  });

  it("no page marks more than one image eager (one LCP candidate per page)", () => {
    const pages: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name === "page.tsx") pages.push(path);
      }
    };
    walk(join(asmitaDir, "src/app"));
    expect(pages.length).toBeGreaterThan(20);
    for (const page of pages) {
      const eagerMarks = readFileSync(page, "utf8").match(/\beager\b/g) ?? [];
      expect(eagerMarks.length, `${page} should pass eager at most once`).toBeLessThanOrEqual(1);
    }
  });
});
