import { devFlagEnabled } from "@/lib/dev-flags";
import type { SessionClaims } from "@/lib/auth/jwt";

/*
 * Step-up MFA (review-console-spec.md WP144, from the redesign doc's
 * Phase 4): the admin session carries an mfaAt claim — when the admin last
 * proved their authenticator — and the actions that can reshape who reaches
 * what (routing rules, queue access, roles, enrolment codes, MFA reset,
 * bulk decisions over 10 items) require that proof to be within 15 minutes,
 * or they answer mfa_step_up_required and the console asks for a fresh code
 * through POST /api/admin/mfa/step-up.
 *
 * The dev bypass is DEV_SKIP_ADMIN_MFA, and only through src/lib/dev-flags.ts
 * (inert in production even when the env var is set on the host).
 */

export const STEP_UP_MINUTES = 15;

export type StepUpSession = Pick<SessionClaims, "mfaAt">;

/** Whether the session's last authenticator proof is within the window. */
export function stepUpFresh(session: StepUpSession, now = new Date()): boolean {
  if (devFlagEnabled("DEV_SKIP_ADMIN_MFA")) return true;
  if (typeof session.mfaAt !== "number") return false;
  return now.getTime() - session.mfaAt * 1000 <= STEP_UP_MINUTES * 60_000;
}

export type StepUpResult = { ok: true } | { ok: false; error: "mfa_step_up_required" };

/**
 * The gate the step-up actions call after their own permission checks. On
 * failure the caller answers 403 with the mfa_step_up_required code, which
 * is the console's cue to ask for a fresh code — never a silent refusal.
 */
export function requireStepUp(session: StepUpSession, now = new Date()): StepUpResult {
  return stepUpFresh(session, now) ? { ok: true } : { ok: false, error: "mfa_step_up_required" };
}

/** Where the fresh mfaAt claim comes from: the moment of the proof. */
export function stepUpNow(now = new Date()): number {
  return Math.floor(now.getTime() / 1000);
}
