// TEST-ONLY stand-in for dist/browser-worker.js. Behaviour is chosen by the
// PATH of the URL it is told to render, so tests can drive every mode of the
// BrowserRenderer through the real IPC boundary:
//   /ok         one image + a successful rendered result
//   /check      one verdict round-trip; the verdict lands in the html
//   /env        the rendered html says whether the environment and argv are
//               scrubbed (no key, no config, only the allowed env names)
//   /fail       replies failed(browser_failed)
//   /hang       never answers (deadline test)
//   /abort      waits; answers failed(browser_aborted) when told to abort
//   /wrong-id   sends an image under a wrong render id (protocol violation)
//   /oversize   sends an image over the byte cap (protocol violation)
//   /junk       sends a message with an unexpected shape (protocol violation)
//   /die        exits mid-render (crashed worker)
//   /stale      answers the abort, then keeps sending image, check and
//               rendered messages under the aborted id (a render still
//               unwinding in the worker)
//   /slow-ok    a successful render answered after 200 ms
//   /ignore-stop  renders ok, then ignores the graceful stop (close() must
//               SIGKILL it)
let seq = 0;
// The render the worker is currently handling; only /abort and /stale
// answer aborts.
let mode = "";
let ignoreStop = false;

process.on("message", (m) => {
  if (!m || typeof m !== "object") return;
  if (m.kind === "launch") {
    // WP25: echo the mode the parent asked for and this process's own uid.
    return process.send({ kind: "ready", sandboxed: m.sandboxed, uid: process.getuid?.() ?? 0 });
  }
  if (m.kind === "verdict") {
    return;
  }
  if (m.kind === "abort") {
    if (mode === "/abort") return process.send({ kind: "failed", id: m.id, code: "browser_aborted" });
    if (mode === "/stale") {
      process.send({ kind: "failed", id: m.id, code: "browser_aborted" });
      const old = m.id;
      setTimeout(() => {
        process.send({ kind: "image", id: old, url: "http://img.example/stale.png", contentType: "image/png", bytes: new Uint8Array([9]) });
        process.send({ kind: "check", id: old, seq: ++seq, url: "http://page.example/stale", resourceType: "image" });
        process.send({ kind: "rendered", id: old, url: "http://page.test/stale", status: 200, html: "stale", truncated: false, stats: { requests: 1, imagesSkipped: 0 } });
      }, 50);
      return;
    }
    return; // a truly stuck worker ignores the abort; the parent force-kills
  }
  if (m.kind === "stop") {
    if (ignoreStop) return;
    process.send({ kind: "stopped" });
    return process.exit(0);
  }
  if (m.kind !== "render") return;
  const task = m;
  mode = new URL(task.url).pathname;
  const reply = (msg) => process.send(msg);
  switch (mode) {
    case "/ok":
      reply({ kind: "image", id: task.id, url: "http://img.example/x.png", contentType: "image/png", bytes: new Uint8Array([1, 2, 3]) });
      return reply({ kind: "rendered", id: task.id, url: task.url, status: 200, html: "<p>rendered</p>", truncated: false, stats: { requests: 2, imagesSkipped: 0 } });
    case "/check": {
      const my = ++seq;
      const onVerdict = (raw) => {
        if (raw && raw.kind === "verdict" && raw.seq === my) {
          process.off("message", onVerdict);
          reply({ kind: "rendered", id: task.id, url: task.url, status: 200, html: `verdict:${raw.allow ? 1 : 0}`, truncated: false, stats: { requests: 1, imagesSkipped: 0 } });
        }
      };
      process.on("message", onVerdict);
      return reply({ kind: "check", id: task.id, seq: my, url: "http://page.example/sub", resourceType: "image" });
    }
    case "/env": {
      const allowed = new Set(["TMPDIR", "TMP", "TEMP", "HOME", "PLAYWRIGHT_BROWSERS_PATH"]);
      const envOk =
        Object.keys(process.env).every((k) => allowed.has(k)) &&
        !Object.values(process.env).some((v) => String(v).includes("parent-secret"));
      const argvOk = ![...process.argv, ...process.execArgv].some((a) => a.includes("parent-secret"));
      return reply({ kind: "rendered", id: task.id, url: task.url, status: 200, html: envOk && argvOk ? "env-ok" : "env-bad", truncated: false, stats: { requests: 1, imagesSkipped: 0 } });
    }
    case "/fail":
      return reply({ kind: "failed", id: task.id, code: "browser_failed" });
    case "/hang":
      return; // never answers
    case "/abort":
      return; // answered by the abort handler above
    case "/wrong-id":
      return reply({ kind: "image", id: task.id + 999, url: "http://img.example/x.png", contentType: "image/png", bytes: new Uint8Array([1]) });
    case "/oversize":
      return reply({ kind: "image", id: task.id, url: "http://img.example/x.png", contentType: "image/png", bytes: new Uint8Array(task.maxImageBytes + 1) });
    case "/junk":
      return reply({ kind: "rendered", id: task.id, url: task.url, status: 200, html: "x", truncated: false, stats: { requests: 1, imagesSkipped: 0 }, surprise: true });
    case "/die":
      return process.exit(7);
    case "/stale":
      return; // answered by the abort handler above
    case "/slow-ok":
      setTimeout(() => {
        reply({ kind: "rendered", id: task.id, url: task.url, status: 200, html: "<p>slow</p>", truncated: false, stats: { requests: 1, imagesSkipped: 0 } });
      }, 200);
      return;
    case "/ignore-stop":
      ignoreStop = true;
      return reply({ kind: "rendered", id: task.id, url: task.url, status: 200, html: "<p>ok</p>", truncated: false, stats: { requests: 1, imagesSkipped: 0 } });
  }
});
