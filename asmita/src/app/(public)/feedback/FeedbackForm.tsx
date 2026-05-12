"use client";

import { useState } from "react";
import { csrfFetch } from "@/lib/client-csrf";

export function FeedbackForm() {
  const [rating, setRating] = useState(5);
  const [caseReference, setCaseReference] = useState("");
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);

  async function submit() {
    const response = await csrfFetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rating, caseReference: caseReference || undefined, comment: comment || undefined }),
    });
    if (response.ok) setSent(true);
  }

  return (
    <div className="panel mt-8 max-w-xl space-y-5 p-6">
      {sent ? (
        <p className="font-bold">Thank you. Your feedback was recorded.</p>
      ) : (
        <>
          <label className="block text-sm font-bold" htmlFor="caseReference">
            Case reference (optional)
            <input
              className="field mt-2"
              id="caseReference"
              onChange={(event) => setCaseReference(event.target.value)}
              value={caseReference}
            />
          </label>
          <label className="block text-sm font-bold" htmlFor="rating">
            Rating
            <select
              className="field mt-2"
              id="rating"
              onChange={(event) => setRating(Number(event.target.value))}
              value={rating}
            >
              {[5, 4, 3, 2, 1].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-bold" htmlFor="comment">
            Feedback
            <textarea
              className="field mt-2 min-h-32"
              id="comment"
              onChange={(event) => setComment(event.target.value)}
              value={comment}
            />
          </label>
          <button className="btn btn-primary" onClick={submit} type="button">
            Submit feedback
          </button>
        </>
      )}
    </div>
  );
}
