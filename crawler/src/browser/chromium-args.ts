/**
 * Chromium's launch flags for the browser worker (crawler v2 WP7), kept in
 * their own module so a test can assert them without starting a browser.
 *
 * --no-sandbox: Chromium's own sandbox on Linux needs no setuid helper;
 *   it uses unprivileged user namespaces. Container runtimes commonly refuse
 *   those (Docker's default seccomp profile, and possibly Cloud Run), so the
 *   sandbox is switched off here. That leaves a renderer
 *   exploit running as the same uid as the crawler: browser rendering stays
 *   off for real sites until the worker runs sandboxed or under a separate
 *   uid (crawler runbook, go-live checklist).
 *
 * WebRTC: its UDP traffic does not go through the SOCKS proxy, so it would
 *   bypass the address policy. Only proxied traffic is allowed (no UDP at
 *   all, since the proxy offers no UDP ASSOCIATE).
 */
export const CHROMIUM_ARGS: readonly string[] = [
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--disk-cache-size=0",
  "--media-cache-size=0",
  "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
  "--webrtc-ip-handling-policy=disable_non_proxied_udp",
];
