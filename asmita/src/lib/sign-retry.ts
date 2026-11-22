/*
 * The signing screens' verdict for a sign request's answer (WP131).
 *
 * `already_signed` is not a refusal to show an error for: it means the
 * document on screen was signed by an earlier attempt of the same survivor
 * whose HTTP answer never arrived — the dropped-exchange class behind the
 * full-suite e2e stalls (WP101's lost hash-upload answer, WP131's lost
 * sign-notice answer: the dev server held the request through a compilation
 * cycle, the client's 15 s csrfFetch budget aborted first, and only the
 * retry sees the truth). The route answers 409 because the document IS
 * signed, and only her session can reach it (`case: { userId }`), so the
 * journey must continue exactly like a successful sign.
 *
 * The crawl-consent tick already recovers the same refusal that way
 * (CrawlConsent.tsx reloads the state and moves on); this helper gives the
 * notice and advisory signing screens the same decision, kept apart from the
 * components so it can be unit tested without a browser.
 */

export type SignAnswer =
  /** The document is signed: a 200, or a 409 already_signed from an attempt whose answer was lost. */
  | { kind: "signed" }
  /** Any other refusal, with the route's error code for the message mapping. */
  | { kind: "error"; code: string };

export function signAnswer(ok: boolean, error: string | undefined): SignAnswer {
  if (ok || error === "already_signed") return { kind: "signed" };
  return { kind: "error", code: error && error.length > 0 ? error : "unknown" };
}
