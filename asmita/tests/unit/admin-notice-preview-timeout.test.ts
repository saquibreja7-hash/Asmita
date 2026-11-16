import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PREVIEW_IDLE_SECONDS, startIdleTimer } from "@/app/(admin)/findings/preview-timeout";
import { COPY_CAUTION, downloadPdf, PDF_DOWNLOAD_CAUTION, PDF_FILE_NAME } from "@/app/(admin)/findings/findings-client";
import { AddressDisplay } from "@/app/(admin)/findings/AddressDisplay";

// The notice preview (both addresses and the PDF bytes) is dropped after a
// period of inactivity; the PDF download asks first and carries no case
// reference; copying an address carries the same caution. Placeholder data only.

describe("preview idle timer", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date("2026-11-17T00:00:00Z") }));
  afterEach(() => vi.useRealTimers());

  it("is two minutes by default", () => expect(PREVIEW_IDLE_SECONDS).toBe(120));

  it("expires once after the idle period, counting down on the way", () => {
    const onExpire = vi.fn();
    const ticks: number[] = [];
    const timer = startIdleTimer({ onExpire, onTick: (s) => ticks.push(s) });
    vi.advanceTimersByTime(119_000);
    expect(onExpire).not.toHaveBeenCalled();
    expect(timer.secondsLeft()).toBe(1);
    expect(timer.expired()).toBe(false);
    vi.advanceTimersByTime(1_000);
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(timer.expired()).toBe(true);
    expect(timer.secondsLeft()).toBe(0);
    expect(ticks.at(-1)).toBe(0);
    expect(ticks.slice(0, 3)).toEqual([119, 118, 117]);
    vi.advanceTimersByTime(600_000);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("activity restarts the count; activity after expiry does not revive it", () => {
    const onExpire = vi.fn();
    const timer = startIdleTimer({ onExpire, idleSeconds: 10 });
    vi.advanceTimersByTime(9_000);
    timer.touch();
    vi.advanceTimersByTime(9_000);
    expect(onExpire).not.toHaveBeenCalled();
    expect(timer.secondsLeft()).toBe(1);
    vi.advanceTimersByTime(1_000);
    expect(onExpire).toHaveBeenCalledTimes(1);
    timer.touch();
    expect(timer.expired()).toBe(true);
    expect(timer.secondsLeft()).toBe(0);
  });

  it("stop() never expires (preview replaced, sent or unmounted)", () => {
    const onExpire = vi.fn();
    const timer = startIdleTimer({ onExpire, idleSeconds: 5 });
    timer.stop();
    vi.advanceTimersByTime(60_000);
    expect(onExpire).not.toHaveBeenCalled();
    expect(timer.expired()).toBe(false);
  });
});

describe("NoticeStep wiring", () => {
  const source = readFileSync(join(process.cwd(), "src/app/(admin)/findings/NoticeStep.tsx"), "utf8");
  it("drops the whole preview (with pdfBase64) on expiry and sends only a live preview", () => {
    expect(source).toMatch(/onExpire: \(\) => \{\s*setPreview\(null\);\s*setPreviewHidden\(true\);/);
    expect(source).toMatch(/if \(!preview \|\| !timer\.current \|\| timer\.current\.expired\(\)\) return;/);
    expect(source).toContain("Preview again to continue.");
    // pdfBase64 lives only inside the preview object, never in its own state.
    expect(source).not.toMatch(/useState<string>\(\s*preview\.pdfBase64|setPdf/);
  });
});

describe("PDF download and copy caution", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks first, with the caution, and does nothing if the analyst declines", () => {
    const asked: string[] = [];
    vi.stubGlobal("document", { createElement: () => { throw new Error("must not build a download"); } });
    expect(downloadPdf({ pdfBase64: "JVBERg==" }, (m) => (asked.push(m), false))).toBe(false);
    expect(asked).toEqual([PDF_DOWNLOAD_CAUTION]);
    expect(PDF_DOWNLOAD_CAUTION).toMatch(/contains the page and image addresses/);
    expect(PDF_DOWNLOAD_CAUTION).toMatch(/never keep it on a personal device/);
  });

  it("names the file without the case reference", () => {
    const anchor = { download: "", href: "", click: vi.fn() };
    vi.stubGlobal("document", { createElement: () => anchor });
    vi.stubGlobal("URL", Object.assign(function () {}, { createObjectURL: () => "blob:placeholder", revokeObjectURL: () => {} }));
    expect(downloadPdf({ pdfBase64: "JVBERg==" }, () => true)).toBe(true);
    expect(anchor.download).toBe(PDF_FILE_NAME);
    expect(PDF_FILE_NAME).not.toMatch(/ASMITA-|\d{4}-\d{5}/);
    expect(anchor.click).toHaveBeenCalledTimes(1);
  });

  it("the address reveal shows the copy caution", () => {
    const html = renderToStaticMarkup(
      createElement(AddressDisplay, { pageUrl: "https://forum.example.com/t/1", imageUrl: "https://cdn.example.net/i.jpg", secondsLeft: 30, copied: null, onCopy: () => {}, onHide: () => {} }),
    );
    expect(html).toContain(COPY_CAUTION.replace(/'/g, "&#x27;"));
  });
});
