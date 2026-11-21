// TEST-ONLY stand-in for dist/browser-worker.js, WP25 sandbox cases. It
// behaves like the real worker in a runtime that refuses Chromium's own
// sandbox: a launch asked to be sandboxed always fails with
// browser_sandbox_unavailable, and a launch allowed to be unsandboxed
// starts normally and answers ready. The parent's decision — fail closed,
// or the CRAWLER_ALLOW_UNSANDBOXED_BROWSER override — is entirely its own:
// this worker never decides for itself, exactly like the real one.
process.on("message", (m) => {
  if (!m || typeof m !== "object") return;
  if (m.kind === "launch") {
    if (m.sandboxed) return process.send({ kind: "failed", id: 0, code: "browser_sandbox_unavailable" });
    return process.send({ kind: "ready", sandboxed: false, uid: process.getuid?.() ?? 0 });
  }
  if (m.kind === "verdict" || m.kind === "abort") return;
  if (m.kind === "stop") {
    process.send({ kind: "stopped" });
    return process.exit(0);
  }
  if (m.kind !== "render") return;
  // One successful render so the override path can be asserted.
  process.send({ kind: "image", id: m.id, url: "http://img.example/x.png", contentType: "image/png", bytes: new Uint8Array([5]) });
  process.send({ kind: "rendered", id: m.id, url: m.url, status: 200, html: "<p>unsandboxed</p>", truncated: false, stats: { requests: 1, imagesSkipped: 0 } });
});
