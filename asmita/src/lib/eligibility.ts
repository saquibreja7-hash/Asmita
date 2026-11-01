// Someone who has answered the eligibility questions as an adult, and was an
// adult when the content was made, may add links before confirming their
// email. Nothing they type reaches the server until they have a session; the
// cookie only lets the server render /submit for them.
export const ELIGIBLE_COOKIE = "asmita_eligible";
const ELIGIBLE_KEY = "asmita_eligibility";
export const DRAFT_KEY = "asmita_submit_draft";

export function rememberEligibleAdult() {
  try {
    sessionStorage.setItem(ELIGIBLE_KEY, "adult");
  } catch {
    // Private mode: the age questions are asked again on the email step.
  }
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${ELIGIBLE_COOKIE}=1; Path=/; Max-Age=86400; SameSite=Lax${secure}`;
}

export function isEligibleAdult() {
  try {
    return sessionStorage.getItem(ELIGIBLE_KEY) === "adult";
  } catch {
    return false;
  }
}

export function hasDraft() {
  try {
    return Boolean(sessionStorage.getItem(DRAFT_KEY));
  } catch {
    return false;
  }
}
