import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { EscalationLadder } from "@/app/(victim)/case/[caseId]/EscalationLadder";

const sent = "2026-11-01T10:00:00.000Z";
const at = (days: number) => new Date(new Date(sent).getTime() + days * 86_400_000);
const render = (props: Partial<Parameters<typeof EscalationLadder>[0]> = {}) => {
  const element = EscalationLadder({
      locale: "en",
      platform: "WhatsApp",
      route: "EMAIL",
      startedAt: sent,
      status: "NOTICE_SENT",
      reference: "ASMITA-2026-00042",
      draftsEnabled: false,
      now: at(0.5),
      ...props,
  });
  return element ? renderToStaticMarkup(element) : "";
};

describe("EscalationLadder", () => {
  it("before the deadline shows the steps and dates, with no actions yet", () => {
    const html = render();
    expect(html).toContain("Notice sent to WhatsApp");
    expect(html).toContain("WhatsApp&#x27;s deadline to remove it");
    expect(html).toContain("Opens");
    expect(html).not.toContain("cybercrime.gov.in");
  });

  it("after a week opens the complaint and the appeal", () => {
    const html = render({ now: at(8) });
    expect(html).toContain("https://cybercrime.gov.in/");
    expect(html).toContain("https://gac.gov.in/");
    expect(html).toContain("WhatsApp has had 7 days");
  });

  it("drafts appear only when legal review allows, and carry no link", () => {
    expect(render({ now: at(8) })).not.toContain("Wording you can copy");
    const html = render({ now: at(8), draftsEnabled: true });
    expect(html).toContain("Wording you can copy");
    expect(html).toContain("[paste the link here]");
    expect(html).toContain("Rule 3(2)(b)");
    expect(html).toContain("ASMITA-2026-00042");
  });

  it("a refusal says so and opens the appeal at once", () => {
    const html = render({ responseType: "REJECTED", responseAt: at(0.2).toISOString(), now: at(0.3) });
    expect(html).toContain("WhatsApp refused to remove it");
    expect(html).toContain("https://gac.gov.in/");
  });

  it("renders nothing once the link is removed", () => {
    expect(render({ status: "REMOVED", now: at(8) })).toBe("");
  });

  it("speaks Hindi when asked", () => {
    expect(render({ locale: "hi", now: at(8) })).toContain("शिकायत अपील समिति");
  });
});
