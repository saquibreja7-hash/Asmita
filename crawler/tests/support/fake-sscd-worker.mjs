// TEST-ONLY stand-in for dist/sscd-worker.js (WP28). Behaviour is chosen by
// the first byte of the "image" it receives, so tests can drive every
// failure mode of the SscdPool through the real IPC boundary.
//   0x00 valid reply (a vector of the expected dimension)
//   0x01 hang (never replies)
//   0x02 crash, printing URL-like text and bytes to stdout/stderr first
//   0x03 malformed reply (an extra field)
//   0x04 reply with a wrong id
//   0x05 exhaust the JS heap
//   0x06 report env keys + check request shape + check argv/permission flags
//   0x07 valid reply, then stop answering and exit shortly after (a child
//        that dies with a task already handed to it)
//   0x08 valid reply reporting a huge RSS
//   0x09 valid reply with a wrong vector length (a protocol kill)
//   0x0a valid reply with a non-finite vector value (a protocol kill)
//   0x0b error reply with a fixed code (sscd_inference_failed)
const expectedDim = Number.parseInt(process.argv[3] ?? "16", 10);
const rss = () => process.memoryUsage.rss();
const vector = (dim = expectedDim) => Array.from({ length: dim }, (_, i) => Math.round((Math.sin(i + 1) / 2) * 1e6) / 1e6);

process.on("message", (m) => {
  const b = m.bytes;
  switch (b[0]) {
    case 0x00:
      return process.send({ id: m.id, ok: true, vector: vector(), rss: rss() });
    case 0x01:
      return; // hang
    case 0x02:
      process.stdout.write(`crash http://evil.example/${b.toString("hex")}\n`);
      process.stderr.write(`crash ${b.toString("hex")}\n`);
      return process.exit(70);
    case 0x03:
      return process.send({ id: m.id, ok: true, vector: vector(), rss: rss(), extra: "nope" });
    case 0x04:
      return process.send({ id: m.id + 1, ok: true, vector: vector(), rss: rss() });
    case 0x05: {
      const leak = [];
      for (;;) leak.push(new Array(10_000).fill("x"));
    }
    case 0x06: {
      // The same guarantees the decoder child's 0x06 proves, for the SSCD
      // child: a scrubbed environment (nothing secret), nothing secret on
      // argv, the request exactly { bytes, id, minSide }, and the permission
      // flags confining reads to the bundle, sharp, onnxruntime and the
      // model file.
      const allowed = new Set(["VIPS_DISC_THRESHOLD", "TMPDIR", "TMP", "TEMP"]);
      const winRequired = /^(HOMEDRIVE|HOMEPATH|LOGONSERVER|PATH|SYSTEMDRIVE|SYSTEMROOT|USERDOMAIN|USERNAME|USERPROFILE|WINDIR)$/i;
      const envOk =
        Object.keys(process.env).every((k) => allowed.has(k) || (process.platform === "win32" && winRequired.test(k))) &&
        !Object.keys(process.env).some((k) => /CRAWLER|ASMITA|KEY|SECRET|TOKEN|PASSWORD|API/i.test(k)) &&
        !Object.values(process.env).some((v) => String(v).includes("parent-secret"));
      const argvOk =
        ![...process.argv, ...process.execArgv].some((a) => a.includes("parent-secret")) &&
        process.argv[2] === "/test/model/sscd.onnx" &&
        process.argv[3] === String(expectedDim);
      const shapeOk = Object.keys(m).sort().join(",") === "bytes,id,minSide" && b instanceof Uint8Array;
      const flagsOk =
        process.execArgv.includes("--permission") &&
        process.execArgv.some((a) => a.startsWith(`--allow-fs-read=${process.argv[2]}`)) &&
        process.execArgv.some((a) => a.includes("node_modules/onnxruntime-node")) &&
        process.execArgv.some((a) => a.includes("node_modules/sharp"));
      const code = !envOk ? "invalid_url" : !argvOk ? "blocked_port" : !shapeOk ? "dns_failed" : !flagsOk ? "image_format" : "sscd_inference_failed";
      return process.send({ id: m.id, ok: false, code, rss: rss() });
    }
    case 0x07:
      process.send({ id: m.id, ok: true, vector: vector(), rss: rss() });
      setTimeout(() => process.exit(0), 150);
      return;
    case 0x08:
      return process.send({ id: m.id, ok: true, vector: vector(), rss: 4_000_000_000 });
    case 0x09:
      return process.send({ id: m.id, ok: true, vector: vector(expectedDim + 1), rss: rss() });
    case 0x0a:
      return process.send({ id: m.id, ok: true, vector: [Infinity, ...vector(expectedDim - 1)], rss: rss() });
    case 0x0b:
      return process.send({ id: m.id, ok: false, code: "sscd_inference_failed", rss: rss() });
  }
});

process.on("disconnect", () => process.exit(0));
