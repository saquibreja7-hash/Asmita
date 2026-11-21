/**
 * Chromium's launch flags for the browser worker (crawler v2 WP7, sandbox
 * WP25), kept in their own module so a test can assert them without starting
 * a browser.
 *
 * Since WP25 Chromium's own sandbox is ON whenever the runtime allows it:
 * `chromiumArgs(true)` passes no `--no-sandbox`, and the worker launches with
 * Playwright's `chromiumSandbox: true` — Playwright silently passes
 * `--no-sandbox` to Chromium unless that option is set, so the flag alone was
 * never enough. Chromium's Linux sandbox needs no setuid helper; it needs
 * unprivileged user namespaces, which a container runtime may refuse
 * (Docker's default seccomp profile refuses clone(CLONE_NEWUSER) for
 * non-root users, and Chromium refuses to run as root at all). When the
 * sandboxed launch fails, the worker reports `browser_sandbox_unavailable`
 * and the parent decides (browser/sandbox.ts): rendering is disabled for the
 * run unless CRAWLER_ALLOW_UNSANDBOXED_BROWSER=true (local development
 * only). `chromiumArgs(false)` — with `--no-sandbox` — is therefore used
 * only on that override path, never when the sandboxed launch works.
 *
 * WebRTC: its UDP traffic does not go through the SOCKS proxy, so it would
 * bypass the address policy. Only proxied traffic is allowed (no UDP at
 * all, since the proxy offers no UDP ASSOCIATE).
 */
const BASE_ARGS: readonly string[] = [
  "--disable-dev-shm-usage",
  "--disk-cache-size=0",
  "--media-cache-size=0",
  "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
  "--webrtc-ip-handling-policy=disable_non_proxied_udp",
];

export function chromiumArgs(sandboxed: boolean): string[] {
  return sandboxed ? [...BASE_ARGS] : ["--no-sandbox", ...BASE_ARGS];
}
