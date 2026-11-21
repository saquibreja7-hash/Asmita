/**
 * The sandbox decision (WP25), as one pure function so tests can pin every
 * branch without launching anything.
 *
 * The parent's flow: the worker is always launched sandboxed first
 * (Chromium's own sandbox, no `--no-sandbox`). If that launch fails, the
 * runtime does not allow the sandbox (no unprivileged user namespaces, or
 * Chromium refused to run as root), and the plan says what happens next:
 *
 *   - sandbox available        -> render sandboxed, always;
 *   - unavailable + override   -> render with `--no-sandbox`
 *     (CRAWLER_ALLOW_UNSANDBOXED_BROWSER=true, local development only; a
 *     renderer exploit then runs as the worker's user — that user is still
 *     kept away from the key by the worker's scrubbed environment and, in
 *     the container image, by a separate uid);
 *   - unavailable, no override -> fail closed: rendering is disabled for
 *     the run. render = BROWSER pages report `error` under the
 *     `browser_sandbox_unavailable` code without rendering; render = AUTO
 *     pages fall back to their static result.
 */
export type SandboxLaunchPlan = {
  /** Launch Chromium with its own sandbox (never pass --no-sandbox). */
  useSandbox: boolean;
  /** May the run render at all? */
  renderingAllowed: boolean;
};

export function sandboxLaunchPlan(sandboxLaunchOk: boolean, allowUnsandboxed: boolean): SandboxLaunchPlan {
  if (sandboxLaunchOk) return { useSandbox: true, renderingAllowed: true };
  if (allowUnsandboxed) return { useSandbox: false, renderingAllowed: true };
  return { useSandbox: false, renderingAllowed: false };
}
