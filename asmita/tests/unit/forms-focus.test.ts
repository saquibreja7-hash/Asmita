import { createElement } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// WP40: forms, errors and focus in the survivor flow. What renders without a
// browser is rendered; the rest (the OTP box, the throttled video progress,
// the debounced line checks) is pinned on the source it lives in.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import en from "@/i18n/en.json";
import hi from "@/i18n/hi.json";
import status from "@/i18n/hi-review-status.json";
import { FormError } from "@/components/FormError";
import { RegisterForm } from "@/app/(auth)/register/RegisterForm";
import { SignNoticeForm } from "@/app/(victim)/case/[caseId]/sign/SignNoticeForm";
import { FeedbackForm } from "@/app/(public)/feedback/FeedbackForm";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("shared FormError (A4)", () => {
  it("renders one role=alert paragraph, and nothing without a message", () => {
    const html = renderToStaticMarkup(createElement(FormError, { message: "Could not save." }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("Could not save.");
    expect(renderToStaticMarkup(createElement(FormError, { message: "" }))).toBe("");
  });

  it("passes the id and extra classes through", () => {
    const html = renderToStaticMarkup(createElement(FormError, { id: "field-error", message: "No.", className: "mt-2 text-center" }));
    expect(html).toContain('id="field-error"');
    expect(html).toContain("text-center");
    expect(html).toContain("text-[var(--danger)]");
  });
});

describe("registration age radios (A12)", () => {
  it("are one fieldset with a legend and a shared radio name", () => {
    const html = renderToStaticMarkup(createElement(RegisterForm, { locale: "en" }));
    expect(html).toContain("<fieldset");
    expect(html).toContain("<legend");
    expect(html).toContain("How old are you now?");
    expect(html.match(/type="radio"/g)).toHaveLength(2);
    expect(html.match(/name="ageNow"/g)).toHaveLength(2);
  });

  it("ship disabled and are enabled by hydration, so no answer is lost to a pre-hydration click", () => {
    // The server markup must carry the gate: a click that lands before React
    // attaches its handlers would toggle the native radio, hydration would
    // reset it, and her answer would be silently lost (the e2e age-gate hang
    // WP172 fixed). Enabled state arrives with hydration, like the Continue
    // button's own !hydrated guard.
    const html = renderToStaticMarkup(createElement(RegisterForm, { locale: "en" }));
    expect(html.match(/<input[^>]*type="radio"[^>]*disabled=""/g)).toHaveLength(2);
    const src = source("src/app/(auth)/register/RegisterForm.tsx");
    expect(src).toContain("disabled={!hydrated}");
  });
});

describe("registration code box (A3)", () => {
  it("is one input that takes the whole code: typed, pasted or autofilled", () => {
    const src = source("src/app/(auth)/register/RegisterForm.tsx");
    expect(src).toContain('id="otp"');
    expect(src).toContain('autoComplete="one-time-code"');
    expect(src).toContain('maxLength={6}');
    expect(src).toContain('pattern="[0-9]{6}"');
    expect(src).toContain('inputMode="numeric"');
    // The six split boxes are gone, with their per-digit labels.
    expect(src).not.toContain("otp-0");
    expect(src).not.toContain("Digit ${");
    expect(src).not.toContain("otpRefs");
  });

  it("has a visible label, so getByLabel finds the single box", () => {
    const src = source("src/app/(auth)/register/RegisterForm.tsx");
    expect(src).toContain('htmlFor="otp"');
    expect(src).toContain("reg.otp.label");
  });
});

describe("sign notice form (A9/A10)", () => {
  const props = {
    caseId: "case-1",
    urlId: "url-1",
    templateRef: "ref-1",
    platformName: "Example Platform",
    previewPdfUrl: "/preview",
    confirmationUrl: "/done",
    locale: "en" as const,
  };

  it("submits from a real form and keeps the contact hints linked to the field", () => {
    const html = renderToStaticMarkup(createElement(SignNoticeForm, props));
    expect(html).toContain("<form");
    expect(html).toContain('type="submit"');
    expect(html).toContain('id="sign-contact-help"');
    expect(html).toContain('aria-describedby="sign-contact-help"');
    // The contact field is checked when she leaves it and never autocorrected.
    // React's server markup keeps the camelCase names; the DOM lowercases them.
    expect(html).toContain('autoCapitalize="none"');
    expect(html).toContain('autoCorrect="off"');
    expect(html).toContain('spellCheck="false"');
  });

  it("states its field errors beside the field, for the focus to land on", () => {
    const src = source("src/app/(victim)/case/[caseId]/sign/SignNoticeForm.tsx");
    expect(src).toContain('"sign.error.nameRequired"');
    expect(src).toContain('"sign.error.contact"');
    expect(src).toContain('"sign.error.agree"');
    expect(src).toContain('id="sign-contact-error"');
  });
});

describe("feedback form (A9/A23)", () => {
  it("wraps the fields in a form and describes each field by its hint", () => {
    const html = renderToStaticMarkup(createElement(FeedbackForm, { locale: "en" }));
    expect(html).toContain("<form");
    expect(html).toContain('type="submit"');
    for (const field of ["caseReference", "rating", "comment"]) {
      expect(html).toContain(`id="${field}-hint"`);
      expect(html).toContain(`aria-describedby="${field}-hint"`);
    }
  });
});

describe("submit form (A7/A8/A9/S12)", () => {
  it("types into a form whose button is never disabled to block validation", () => {
    const src = source("src/app/(auth)/submit/SubmitForm.tsx");
    expect(src).toContain("<form");
    expect(src).not.toContain("disabled={!hydrated || !canSubmit || submitting}");
    expect(src).toContain("type=\"submit\"");
  });

  it("keeps the link box from offering completions and corrections", () => {
    const src = source("src/app/(auth)/submit/SubmitForm.tsx");
    expect(src).toContain('autoComplete="off"');
    expect(src).toContain('autoCorrect="off"');
    expect(src).toContain('autoCapitalize="off"');
  });

  it("announces one summary instead of a live per-line list", () => {
    const src = source("src/app/(auth)/submit/SubmitForm.tsx");
    expect(src).not.toContain("aria-live");
    expect(src).toContain('id="url-checks"');
    expect(src).toContain("submit.link.summary");
    expect(src).toContain('role="status"');
  });

  it("shows video progress as a progress element, throttled to about four updates a second", () => {
    const src = source("src/app/(auth)/submit/SubmitForm.tsx");
    expect(src).toContain("<progress");
    expect(src).toContain("VIDEO_PROGRESS_MIN_INTERVAL_MS = 250");
    expect(src).toContain("submit.hash.video.notUploaded");
    expect(src).toContain("submit.hash.video.doneNote");
  });
});

describe("submit form: the tick must survive the settling checks (WP49)", () => {
  // The declaration checkbox sits below everything that moves on this form.
  // A render that commits between the tick's mousedown and mouseup moves the
  // checkbox out from under the pointer, the browser hands the click to
  // whatever took its place, and the tick silently never lands.
  it("settles the line checks on the pause alone, with no blur commit", () => {
    const src = source("src/app/(auth)/submit/SubmitForm.tsx");
    // The blur of the links box fires at the mousedown of the very click that
    // blurred it, so its commit always landed inside the click it caused.
    expect(src).not.toContain("onBlur={() => setCheckedUrls");
    expect(src).toContain("setTimeout(() => setCheckedUrls(urls), 600)");
  });

  it("asks the platform question from the links as they stand, not the settled checks", () => {
    const src = source("src/app/(auth)/submit/SubmitForm.tsx");
    // While a fingerprint is made the settled checks lag behind what she
    // typed, so a settled-checks question appeared at the end of the hashing
    // and vanished when the checks settled — two layout jumps over the
    // checkbox, the second exactly when the ready text invites the tick.
    expect(src).toContain("hashedFiles.length > 0 && liveParsedUrls.length === 0");
  });
});

describe("review-sign form (A9/A10/A11)", () => {
  it("signs through a form, focuses its heading on the step change", () => {
    const src = source("src/app/(victim)/review-sign/ReviewSignForm.tsx");
    expect(src).toContain("<form");
    expect(src).toContain("focusFirstSignError");
    expect(src).toContain('"review.sign.error.nameRequired"');
    expect(src).toContain('"review.sign.error.contact"');
    expect(src).toContain('"review.sign.error.agree"');
    expect(src).toContain("signHeadingRef");
    expect(src).toContain('tabIndex={-1}');
  });
});

describe("new strings (translation workflow)", () => {
  const newKeys = [
    "review.sign.error.nameRequired",
    "review.sign.error.contact",
    "review.sign.error.agree",
    "sign.error.nameRequired",
    "sign.error.contact",
    "sign.error.agree",
    "submit.link.summary",
    "talk.call.heading",
  ] as const;

  it("exist in English and Hindi with the same key", () => {
    for (const key of newKeys) {
      expect((en as Record<string, string>)[key], key).toBeTruthy();
      expect((hi as Record<string, string>)[key], key).toBeTruthy();
      expect((hi as Record<string, string>)[key]).not.toBe((en as Record<string, string>)[key]);
    }
  });

  it("is listed as machine translated, pending native review", () => {
    for (const key of newKeys) {
      expect(status.machineTranslated.keys).toContain(key);
    }
  });
});
