import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { CrawlConsent } from "@/app/(victim)/case/[caseId]/CrawlConsent";

describe("CrawlConsent", () => {
  it("renders nothing visible before the server has said what is available", () => {
    const html = renderToStaticMarkup(<CrawlConsent caseId="c1" locale="en" />);
    expect(html).not.toContain("Search the internet");
    expect(html).toContain('aria-live="polite"');
  });
});
