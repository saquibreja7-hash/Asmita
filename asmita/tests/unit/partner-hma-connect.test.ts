import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { HmaConnect } from "@/app/(admin)/platform-partners/[partnerId]/HmaConnect";

const render = () => renderToStaticMarkup(createElement(HmaConnect));
// The markup escapes quotes and angle brackets; the code-snippet assertions
// read the unescaped text.
const asText = (html: string) =>
  html
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&");

// WP111 (research-tools spec, item 3): the "Connect with HMA" quick start
// on the partner page — collapsible, three copyable steps, and structurally
// incapable of showing a real key (the placeholder names it, the component
// is given nothing).
describe("HmaConnect render", () => {
  it("is a collapsed disclosure with the three steps inside", () => {
    const html = render();
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).toContain("Connect with HMA");
    expect(html).not.toMatch(/<details[^>]*open/);
  });

  it("shows the derived-image, config and exchange-creation snippets", () => {
    const html = render();
    const text = asText(html);
    expect(text).toContain("FROM ghcr.io/meta/threatexchange/hma:1.2.2");
    expect(text).toContain("pip install /wheels/tx_extension_asmita-1.0.0-py3-none-any.whl");
    expect(text).toContain("from tx_extension_asmita import AsmitaSignalExchangeAPI");
    expect(text).toContain("AsmitaSignalExchangeAPI,");
    expect(text).toContain("POST /c/exchanges");
    expect(text).toContain('"bank": "ASMITA_NCII"');
    expect(text).toContain('"api": "asmita"');
    expect(text).toContain('"base_url"');
    expect(text).toContain("/api/partner/v1");
  });

  it("names the once-shown key and never carries key material", () => {
    const text = asText(render());
    expect(text).toContain("<the key you were shown>");
    expect(text).toContain("only once");
    // No key shape anywhere in the block: not a partner key, not a secret.
    expect(text).not.toMatch(/ppk_[A-Za-z0-9]/);
  });

  it("gives every step its own copy button, no clipboard required to render", () => {
    const html = render();
    const copies = html.match(/Copy the code for step /g) ?? [];
    expect(copies).toHaveLength(3);
    expect((html.match(/<pre/g) ?? []).length).toBe(3);
  });
});
