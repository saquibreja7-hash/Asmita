"use client";

import { useState } from "react";
import { csrfFetch } from "@/lib/client-csrf";
import type { Locale } from "@/lib/i18n";

export function FeedbackForm({ locale }: { locale: Locale }) {
  const say = (en: string, hi: string) => locale === "hi" ? hi : en;
  const [rating, setRating] = useState(5);
  const [caseReference, setCaseReference] = useState("");
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setSubmitting(true);
    setError("");
    const response = await csrfFetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        rating,
        caseReference: caseReference || undefined,
        comment: comment || undefined,
      }),
    });
    if (response.ok) {
      setSent(true);
    } else {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      setError(payload.error === "links_not_allowed"
        ? say("Please remove links and case URLs from feedback before sending.", "कृपया प्रतिक्रिया भेजने से पहले लिंक और केस URL हटाएँ।")
        : say("We could not record your feedback right now. Please try again in a moment.", "अभी प्रतिक्रिया दर्ज नहीं हो सकी। थोड़ी देर बाद फिर कोशिश करें।"));
    }
    setSubmitting(false);
  }

  if (sent) {
    return (
      <div
        className="mt-10 text-center"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <p className="font-display text-[24px] leading-[1.4] tracking-tight text-[var(--foreground)] md:text-[32px] md:leading-[1.3]">
          {say("Thank you. Your feedback was recorded.", "धन्यवाद। आपकी प्रतिक्रिया दर्ज हो गई है।")}
        </p>
        <p className="muted mt-4 text-base leading-[1.75]">
          {say("The team can review your response. This form does not ask for contact details, so it cannot be used to request a reply.", "टीम आपकी प्रतिक्रिया देख सकती है। यह फ़ॉर्म संपर्क विवरण नहीं माँगता, इसलिए इससे जवाब नहीं माँगा जा सकता।")}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-10 space-y-8">
      <Row
        label={say("Case reference", "केस संदर्भ")}
        hint={say("Optional. Only if you want to tie the feedback to a specific case.", "वैकल्पिक। केवल यदि आप प्रतिक्रिया को किसी केस से जोड़ना चाहते हैं।")}
        htmlFor="caseReference"
      >
        <input
          className="field"
          id="caseReference"
          onChange={(event) => setCaseReference(event.target.value)}
          value={caseReference}
          placeholder="ASMITA-2026-7K3M9Q"
          autoComplete="off"
          inputMode="text"
        />
      </Row>

      <Row
        label={say("Rating", "अनुभव का मूल्यांकन")}
        hint={say("How would you describe the overall experience?", "आप पूरे अनुभव को कैसे बताएँगे?")}
        htmlFor="rating"
      >
        <select
          className="field"
          id="rating"
          onChange={(event) => setRating(Number(event.target.value))}
          value={rating}
        >
          <option value={5}>{say("5 · Felt supported", "5 · सहारा मिला")}</option>
          <option value={4}>{say("4 · Mostly helpful", "4 · अधिकतर मदद मिली")}</option>
          <option value={3}>{say("3 · Neither here nor there", "3 · मिला-जुला अनुभव")}</option>
          <option value={2}>{say("2 · Frustrating", "2 · परेशानी हुई")}</option>
          <option value={1}>{say("1 · Made things harder", "1 · और कठिन लगा")}</option>
        </select>
      </Row>

      <Row
        label={say("Feedback", "प्रतिक्रिया")}
        hint={say("Anything you would like us to know. Write in English or Hindi.", "जो आप हमें बताना चाहें। हिंदी या अंग्रेज़ी में लिखें।")}
        htmlFor="comment"
      >
        <textarea
          className="field min-h-40 leading-[1.65]"
          id="comment"
          onChange={(event) => setComment(event.target.value)}
          value={comment}
        />
      </Row>

      {error && (
        <p
          className="text-center text-sm font-medium text-[var(--rose)]"
          role="alert"
          aria-live="assertive"
        >
          {error}
        </p>
      )}
      <div className="pt-2 text-center">
        <button
          className="btn btn-primary"
          onClick={submit}
          type="button"
          disabled={submitting}
        >
          {submitting ? say("Sending…", "भेज रहे हैं…") : say("Submit feedback", "प्रतिक्रिया भेजें")}
        </button>
        <p className="muted mt-4 text-xs leading-[1.7]">
          {say("This form does not ask for your name or email. Do not include links or intimate content.", "यह फ़ॉर्म आपका नाम या ईमेल नहीं माँगता। लिंक या निजी सामग्री न लिखें।")}
        </p>
      </div>
    </div>
  );
}

function Row({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="font-display text-[18px] leading-[1.3] tracking-tight text-[var(--foreground)]"
      >
        {label}
      </label>
      <p className="muted mt-1 text-sm leading-[1.6]">{hint}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}
