"use client";

import { useState } from "react";
import { csrfFetch } from "@/lib/client-csrf";

export function FeedbackForm() {
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
      setError(
        "We could not record your feedback right now. Please try again in a moment."
      );
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
          Thank you. Your feedback was recorded.
        </p>
        <p className="muted mt-4 text-base leading-[1.75]">
          We read every response by hand. We will not reach back unless
          you ask us to - and this form does not collect any contact
          details.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-10 space-y-8">
      <Row
        label="Case reference"
        hint="Optional. Only if you want to tie the feedback to a specific case."
        htmlFor="caseReference"
      >
        <input
          className="field"
          id="caseReference"
          onChange={(event) => setCaseReference(event.target.value)}
          value={caseReference}
          placeholder="ASMITA-####"
          autoComplete="off"
          inputMode="text"
        />
      </Row>

      <Row
        label="Rating"
        hint="How would you describe the overall experience?"
        htmlFor="rating"
      >
        <select
          className="field"
          id="rating"
          onChange={(event) => setRating(Number(event.target.value))}
          value={rating}
        >
          <option value={5}>5 · Felt supported</option>
          <option value={4}>4 · Mostly helpful</option>
          <option value={3}>3 · Neither here nor there</option>
          <option value={2}>2 · Frustrating</option>
          <option value={1}>1 · Made things harder</option>
        </select>
      </Row>

      <Row
        label="Feedback"
        hint="Anything you would like us to know. Write in English or Hindi."
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
          className="text-center text-sm font-semibold text-[var(--rose)]"
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
          {submitting ? "Sending…" : "Submit feedback"}
        </button>
        <p className="muted mt-4 text-xs leading-[1.7]">
          We do not collect your name, IP, or email through this form.
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
