import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The review loop's client pieces (review-console-spec.md WP141): the
// decision panel's states and its keyboard map. The panel is a client
// component over ids and counts only, so it renders statically once
// next/navigation is stubbed; the state rules and the shortcut map are pure
// modules tested in full.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { DecisionPanel } from "@/app/(admin)/review/[queueKey]/[jobId]/DecisionPanel";
import { panelState, type PanelDecision } from "@/app/(admin)/review/[queueKey]/[jobId]/review-panel-state";
import { panelShortcut } from "@/app/(admin)/review/[queueKey]/[jobId]/review-shortcuts";

const DECISIONS: PanelDecision[] = [
  { code: "approve", label: "Approve link", reasonKind: "approve" },
  { code: "reject", label: "Reject link", reasonKind: "reject" },
];

const BASE = {
  jobId: "job-1",
  queueKey: "links",
  queueName: "Flagged links",
  decisions: DECISIONS,
  requireReasonOnReject: true,
  requireReasonOnApprove: false,
  left: 3,
  claimLost: false,
  canDecide: true,
  protectedQueue: false,
};

function render(overrides: Partial<Parameters<typeof DecisionPanel>[0]> = {}) {
  return renderToStaticMarkup(createElement(DecisionPanel, { ...BASE, ...overrides }));
}

describe("the decision panel's states", () => {
  it("offers the adapter's decisions in order, with keyboard hints", () => {
    const html = render();
    expect(html).toContain("Approve link");
    expect(html).toContain("Reject link");
    expect(html).toContain("2 left in this queue".replace("2", "3"));
    expect(html).toContain("Guidance");
    expect(html).toContain("Skip");
    // The decision inputs are radios: native keyboard semantics.
    expect(html).toMatch(/type="radio"/);
  });

  it("starts with Submit disabled and the reason in words", () => {
    const html = render();
    expect(html).toContain("Choose a decision");
    expect(html).toContain('disabled=""');
    expect(html).toContain('title="Choose a decision"');
  });

  it("says the reason is internal and never leaves", () => {
    const html = render();
    expect(html).toContain("Never sent to the survivor or a platform.");
    expect(html).toContain("Recorded encrypted, internal only.");
  });

  it("shows the lost-claim state instead of decisions, with the way to the next item", () => {
    const html = render({ claimLost: true, lostMessage: "Someone else has this now" });
    expect(html).toContain("Someone else has this now");
    expect(html).toContain("Get the next one");
    expect(html).not.toContain("Approve link");
    expect(html).not.toMatch(/type="radio"/);
  });

  it("offers no decision on the protected minor-hold queue", () => {
    const html = render({ decisions: [], protectedQueue: true, canDecide: false });
    expect(html).toContain("Possible minor");
    expect(html).toContain("two-admin");
    expect(html).not.toMatch(/type="radio"/);
  });

  it("tells a role without the adapter's permission that it cannot decide", () => {
    const html = render({ canDecide: false });
    expect(html).toContain("Your admin role cannot decide items in this queue.");
    expect(html).not.toContain("Approve link");
  });
});

describe("panelState: the submit gate in every state", () => {
  const base = {
    decisions: DECISIONS,
    decision: null as string | null,
    note: "",
    requireReasonOnReject: true,
    requireReasonOnApprove: false,
    canDecide: true,
    lost: false,
    busy: false,
  };

  it("asks for a decision first", () => {
    const state = panelState(base);
    expect(state.submitDisabled).toBe(true);
    expect(state.hint).toBe("Choose a decision");
  });

  it("needs a reason for a reject on a queue that requires one", () => {
    const state = panelState({ ...base, decision: "reject" });
    expect(state.reasonRequired).toBe(true);
    expect(state.reasonMet).toBe(false);
    expect(state.submitDisabled).toBe(true);
    expect(state.hint).toBe("Choose a reason");
  });

  it("accepts the reason once written", () => {
    const state = panelState({ ...base, decision: "reject", note: "Duplicate of another link" });
    expect(state.submitDisabled).toBe(false);
    expect(state.hint).toBe("");
  });

  it("approves without a reason unless the queue demands one", () => {
    const approve = panelState({ ...base, decision: "approve" });
    expect(approve.submitDisabled).toBe(false);
    const strict = panelState({ ...base, decision: "approve", requireReasonOnApprove: true });
    expect(strict.submitDisabled).toBe(true);
    expect(strict.hint).toBe("Choose a reason");
  });

  it("never enables Submit while busy, lost or without permission", () => {
    expect(panelState({ ...base, decision: "approve", busy: true }).submitDisabled).toBe(true);
    expect(panelState({ ...base, decision: "approve", lost: true }).submitDisabled).toBe(true);
    expect(panelState({ ...base, decision: "approve", canDecide: false }).submitDisabled).toBe(true);
    expect(panelState({ ...base, decision: "approve", lost: true }).hint).toBe("");
  });
});

describe("the keyboard map and its suppression", () => {
  const options = { shortcutsOn: true, decisionCount: 2 };

  it("maps the digits to decisions in order", () => {
    expect(panelShortcut({ key: "1", target: null }, options)).toEqual({ type: "decision", index: 0 });
    expect(panelShortcut({ key: "2", target: null }, options)).toEqual({ type: "decision", index: 1 });
  });

  it("ignores a digit with no decision behind it", () => {
    expect(panelShortcut({ key: "9", target: null }, options)).toBeNull();
  });

  it("maps r, s, g and ? to their actions", () => {
    expect(panelShortcut({ key: "r", target: null }, options)).toEqual({ type: "focusReason" });
    expect(panelShortcut({ key: "s", target: null }, options)).toEqual({ type: "skip" });
    expect(panelShortcut({ key: "g", target: null }, options)).toEqual({ type: "guidance" });
    expect(panelShortcut({ key: "?", target: null }, options)).toEqual({ type: "help" });
  });

  it("submits only on Ctrl or Cmd plus Enter", () => {
    expect(panelShortcut({ key: "Enter", ctrlKey: true, target: null }, options)).toEqual({ type: "submit" });
    expect(panelShortcut({ key: "Enter", metaKey: true, target: null }, options)).toEqual({ type: "submit" });
    expect(panelShortcut({ key: "Enter", target: null }, options)).toBeNull();
  });

  it("suppresses single-key shortcuts while typing in a field", () => {
    for (const target of [
      { tagName: "input" },
      { tagName: "TEXTAREA" },
      { tagName: "select" },
      { isContentEditable: true },
    ]) {
      expect(panelShortcut({ key: "1", target }, options), "digit").toBeNull();
      expect(panelShortcut({ key: "r", target }, options), "r").toBeNull();
      expect(panelShortcut({ key: "s", target }, options), "s").toBeNull();
      expect(panelShortcut({ key: "?", target }, options), "?").toBeNull();
    }
    // The chords stay on while typing: they cannot be typed by accident, and
    // submitting from the reason field is the point of Ctrl/Cmd+Enter.
    expect(panelShortcut({ key: "Enter", ctrlKey: true, target: { tagName: "textarea" } }, options)).toEqual({
      type: "submit",
    });
  });

  it("honours the per-admin off switch for single keys only", () => {
    const off = { shortcutsOn: false, decisionCount: 2 };
    expect(panelShortcut({ key: "1", target: null }, off)).toBeNull();
    expect(panelShortcut({ key: "s", target: null }, off)).toBeNull();
    expect(panelShortcut({ key: "?", target: null }, off)).toBeNull();
    expect(panelShortcut({ key: "Enter", ctrlKey: true, target: null }, off)).toEqual({ type: "submit" });
    expect(panelShortcut({ key: "Escape", target: null }, off)).toEqual({ type: "close" });
  });

  it("keeps Escape as the drawer close, including while typing", () => {
    expect(panelShortcut({ key: "Escape", target: null }, options)).toEqual({ type: "close" });
    expect(panelShortcut({ key: "Escape", target: { tagName: "textarea" } }, options)).toEqual({ type: "close" });
  });

  it("ignores every other key", () => {
    expect(panelShortcut({ key: "x", target: null }, options)).toBeNull();
    expect(panelShortcut({ key: "Shift", target: null }, options)).toBeNull();
    expect(panelShortcut({ key: "1", ctrlKey: true, target: null }, options)).toBeNull();
  });
});
