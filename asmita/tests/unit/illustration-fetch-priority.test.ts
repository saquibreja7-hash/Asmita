import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Illustration } from "@/components/Illustration";

describe("Illustration fetch priority (WP45 P4)", () => {
  it("marks the one eager image on a page as high priority", () => {
    const eager = renderToStaticMarkup(createElement(Illustration, { name: "home-hero", eager: true }));
    expect(eager).toContain('loading="eager"');
    expect(eager.toLowerCase()).toContain('fetchpriority="high"');
  });

  it("leaves lazy illustrations unprioritised", () => {
    const lazy = renderToStaticMarkup(createElement(Illustration, { name: "page-about" }));
    expect(lazy).toContain('loading="lazy"');
    expect(lazy.toLowerCase()).not.toContain("fetchpriority");
  });

  it("stays decorative in both modes", () => {
    for (const eager of [true, false]) {
      const markup = renderToStaticMarkup(createElement(Illustration, { name: "home-hero", eager }));
      expect(markup).toContain('alt=""');
      expect(markup).toContain("aria-hidden");
    }
  });
});
