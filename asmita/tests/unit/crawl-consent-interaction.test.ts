// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

// WP34: the crawl tick is a controlled checkbox, and Playwright's check()
// (like any fast reader) reads the DOM state immediately after the click. The
// box must therefore follow her click at once and stay ticked while the
// switch-on request runs — before this fix it bound only to the server's
// answer, so React re-rendered it unchecked the moment she clicked, and the
// e2e failed with "Clicking the checkbox did not change its state". This test
// reproduces exactly that: a real click on the real component, with the POST
// held pending, asserting the box is ticked (and locked) before the server
// ever answers. Placeholder data only.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import en from "@/i18n/en.json";
import { readFileSync } from "node:fs";
import { CrawlConsent } from "@/app/(victim)/case/[caseId]/CrawlConsent";
import { tickChecked, type ConsentState } from "@/app/(victim)/case/[caseId]/crawl-consent-logic";

const draft = { subject: "Authorisation for case X", body: "Body of the authorisation text", templateRef: "ref-1" };
const off: ConsentState = { status: "none", available: true, draft, watchUntil: null };
const signed: ConsentState = { status: "signed", available: true, draft: null, watchUntil: null };

// A faithful Response double for csrfFetch: since WP101 it consumes the body
// (response.text()) inside the exchange, so the double carries the body as
// text too, like every real Response. json() stays for the component's reads.
const res = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  }) as unknown as Response;

let root: Root | null = null;
let container: HTMLElement | null = null;

function render(props: Record<string, unknown>) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(createElement(CrawlConsent, { caseId: "c1", locale: "en", ...props }));
  });
}

/** Flushing timers and microtasks, as the browser would between events. */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

const tickInput = () => document.getElementById("crawl-tick") as HTMLInputElement;

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

describe("the crawl tick follows her click at once", () => {
  it("stays ticked from the click until the server answers, then holds from the consent state", async () => {
    let serverSigned = false;
    let answerPost: ((value: Response) => void) | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/csrf")) return res(200, { token: "csrf-token" });
      if ((init?.method ?? "GET") === "POST") {
        // Hold the switch-on until the assertions below have run.
        return new Promise<Response>((resolve) => {
          answerPost = resolve;
        });
      }
      // The consent GET: the off state until the POST succeeds, signed after.
      return res(200, serverSigned
        ? { status: "signed", available: true, draft: null, signedAt: "2026-11-19T10:00:00.000Z", withdrawnAt: null, fingerprintCount: 1, scope: "WATCH_ONLY", watchUntil: null }
        : { status: "none", available: true, draft, watchUntil: null });
    });
    vi.stubGlobal("fetch", fetchMock);

    const onNowOn = vi.fn();
    render({ initialConsent: off, watch: true, onNowOn });
    await flush();
    expect(tickInput().checked).toBe(false);

    // The click, with the POST still in flight.
    act(() => {
      tickInput().click();
    });

    // The exact contract Playwright's check() relies on, read immediately
    // after the click: the box is ticked (her tick, not the server's) and
    // locked while the request runs. This is the assertion that failed end
    // to end before the fix.
    expect(tickInput().checked).toBe(true);
    expect(tickInput().disabled).toBe(true);
    expect(document.body.textContent).toContain(en["crawl.cta.working"]);
    expect(onNowOn).not.toHaveBeenCalled();

    // Let the click's request chain reach the POST (still unanswered).
    await flush();
    expect(onNowOn).not.toHaveBeenCalled();

    // The server says yes: the box stays ticked, now from the consent state.
    serverSigned = true;
    await act(async () => {
      answerPost?.(res(200, { ok: true, fingerprintCount: 1, scope: "WATCH_ONLY" }));
      await Promise.resolve();
    });
    await flush();
    expect(tickInput().checked).toBe(true);
    expect(tickInput().disabled).toBe(false);
    expect(onNowOn).toHaveBeenCalledTimes(1);
  });

  it("unticks with the reason shown when the server refuses the tick", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/csrf")) return res(200, { token: "csrf-token" });
      if ((init?.method ?? "GET") === "POST") return res(409, { error: "notice_changed_since_preview" });
      return res(200, { status: "none", available: true, draft, watchUntil: null });
    });
    vi.stubGlobal("fetch", fetchMock);

    render({ initialConsent: off, watch: false });
    await flush();

    act(() => {
      tickInput().click();
    });
    expect(tickInput().checked).toBe(true);
    await flush();
    expect(tickInput().checked).toBe(false);
    expect(tickInput().disabled).toBe(false);
    expect(document.body.textContent).toContain(en["crawl.error.changed"]);
  });

  it("an untick on the signed state asks for confirmation and unchecks at once", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      res(200, { status: "signed", available: true, draft: null, signedAt: "2026-11-19T10:00:00.000Z", withdrawnAt: null, fingerprintCount: 1, scope: "SEARCH_AND_NOTICE", watchUntil: null })));

    render({ initialConsent: signed, watch: false });
    await flush();
    expect(tickInput().checked).toBe(true);

    // The stop side: Playwright's uncheck() also reads the state right after
    // the click, so the confirmation path must uncheck synchronously too.
    act(() => {
      tickInput().click();
    });
    expect(tickInput().checked).toBe(false);
    expect(document.body.textContent).toContain(en["crawl.stop.title"]);
  });
});

describe("tickChecked, the decision behind the box", () => {
  it("her tick shows before the server answers; the server state takes over", () => {
    expect(tickChecked({ on: false, pendingOn: true, confirmingStop: false })).toBe(true);
    expect(tickChecked({ on: false, pendingOn: false, confirmingStop: false })).toBe(false);
    expect(tickChecked({ on: true, pendingOn: false, confirmingStop: false })).toBe(true);
    expect(tickChecked({ on: true, pendingOn: false, confirmingStop: true })).toBe(false);
    // The transient commit right after a successful tick: both true stays true.
    expect(tickChecked({ on: true, pendingOn: true, confirmingStop: false })).toBe(true);
  });

  it("the component binds the box to tickChecked, not to the server state alone", () => {
    const source = readFileSync("src/app/(victim)/case/[caseId]/CrawlConsent.tsx", "utf8");
    expect(source).toContain("checked={tickChecked({ on, pendingOn, confirmingStop })}");
    expect(source).not.toContain("checked={on && !confirmingStop}");
  });
});
