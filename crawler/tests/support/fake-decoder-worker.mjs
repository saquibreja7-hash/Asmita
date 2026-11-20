// TEST-ONLY stand-in for dist/decoder-worker.js. Behaviour is chosen by the
// first byte of the "image" it receives, so tests can drive every failure
// mode of the DecoderPool through the real IPC boundary.
//   0x00 valid reply             0x01 hang (never replies)
//   0x02 crash, printing URL-like text and bytes to stdout/stderr first
//   0x03 malformed reply (bad hash, extra field)   0x04 reply with a wrong id
//   0x05 exhaust the JS heap      0x06 report env keys + check request shape
//   0x07 valid reply, then stop answering and exit shortly after (a child
//        that dies with a task already handed to it)
//   0x08 valid reply reporting a huge RSS
//   0x0e sprite reply to a normal task (the wrong reply kind, WP21)
// A request with sprite: true (video-fingerprints spec WP21) answers in
// tile mode instead, with new first bytes:
//   0x00 valid sprite reply (2 tiles)   0x03 tile with a bad hash
//   0x0a single-hash reply to a sprite task (kind mismatch)
//   0x0b sprite reply with 0 tiles      0x0c tile with an extra field
//   0x0d tiles not an array             0x07 valid reply, then die
//   0x06 shape check for sprite requests (bytes,id,minSide,sprite)
const OK_HASH = "0123456789abcdef".repeat(4);
const rss = () => process.memoryUsage.rss();
let dying = false;

const spriteReply = (id, tiles) => ({ id, ok: true, sprite: true, tiles: tiles.map((t) => ({ pdq: t.pdq, quality: t.quality })), rss: rss() });

process.on("message", (m) => {
  if (dying) return;
  const b = m.bytes;
  if (m.sprite === true) {
    switch (b[0]) {
      case 0x00:
        return process.send(spriteReply(m.id, [{ pdq: OK_HASH, quality: 77 }, { pdq: "f".repeat(64), quality: 66 }]));
      case 0x03:
        return process.send(spriteReply(m.id, [{ pdq: "not-hex", quality: 77 }]));
      case 0x06: {
        // Same env/argv checks as the normal 0x06 case, with the sprite
        // request shape: exactly bytes,id,minSide,sprite.
        const allowed = new Set(["VIPS_DISC_THRESHOLD", "TMPDIR", "TMP", "TEMP"]);
        const winRequired = /^(HOMEDRIVE|HOMEPATH|LOGONSERVER|PATH|SYSTEMDRIVE|SYSTEMROOT|USERDOMAIN|USERNAME|USERPROFILE|WINDIR)$/i;
        const envOk =
          Object.keys(process.env).every((k) => allowed.has(k) || (process.platform === "win32" && winRequired.test(k))) &&
          !Object.keys(process.env).some((k) => /CRAWLER|ASMITA|KEY|SECRET|TOKEN|PASSWORD|API/i.test(k)) &&
          !Object.values(process.env).some((v) => String(v).includes("parent-secret"));
        const argvOk = ![...process.argv, ...process.execArgv].some((a) => a.includes("parent-secret"));
        const shapeOk = Object.keys(m).sort().join(",") === "bytes,id,minSide,sprite" && b instanceof Uint8Array && m.sprite === true;
        return process.send({
          id: m.id,
          ok: false,
          code: !envOk ? "invalid_url" : !shapeOk ? "dns_failed" : !argvOk ? "blocked_port" : "image_format",
          rss: rss(),
        });
      }
      case 0x07:
        process.send(spriteReply(m.id, [{ pdq: OK_HASH, quality: 77 }]));
        dying = true;
        setTimeout(() => process.exit(0), 150);
        return;
      case 0x0a:
        return process.send({ id: m.id, ok: true, pdq: OK_HASH, quality: 77, rss: rss() });
      case 0x0b:
        return process.send(spriteReply(m.id, []));
      case 0x0c:
        return process.send({ id: m.id, ok: true, sprite: true, tiles: [{ pdq: OK_HASH, quality: 77, url: "https://leak.example/" }], rss: rss() });
      case 0x0d:
        return process.send({ id: m.id, ok: true, sprite: true, tiles: "not-an-array", rss: rss() });
    }
    return;
  }
  switch (b[0]) {
    case 0x00:
      return process.send({ id: m.id, ok: true, pdq: OK_HASH, quality: 77, rss: rss() });
    case 0x01:
      return; // hang
    case 0x02:
      process.stdout.write("https://leak.example/secret.jpg " + Buffer.from(b).toString("hex") + "\n");
      process.stderr.write("fatal at https://leak.example/ " + OK_HASH + "\n");
      return process.exit(3);
    case 0x03:
      return process.send({ id: m.id, ok: true, pdq: "not-hex", quality: 77, url: "https://leak.example/", rss: rss() });
    case 0x04:
      return process.send({ id: m.id + 999, ok: true, pdq: OK_HASH, quality: 77, rss: rss() });
    case 0x05: {
      const hog = [];
      for (;;) hog.push(new Array(1e6).fill(Math.random()));
    }
    case 0x06: {
      // Encode what this process can see as an allowed error code, so the
      // reply passes the pool's strict validation: "image_format" when the
      // environment holds only the scrubbed keys and the request carried only
      // { id, bytes, minSide }; "invalid_url" if the env holds anything else,
      // "dns_failed" if the request carried anything else, "blocked_port" if
      // the service key appears on argv.
      const allowed = new Set(["VIPS_DISC_THRESHOLD", "TMPDIR", "TMP", "TEMP"]);
      // On Windows libuv always copies these system variables into a child's
      // environment (uv_spawn "required" env); Linux adds nothing.
      const winRequired = /^(HOMEDRIVE|HOMEPATH|LOGONSERVER|PATH|SYSTEMDRIVE|SYSTEMROOT|USERDOMAIN|USERNAME|USERPROFILE|WINDIR)$/i;
      const envOk =
        Object.keys(process.env).every((k) => allowed.has(k) || (process.platform === "win32" && winRequired.test(k))) &&
        !Object.keys(process.env).some((k) => /CRAWLER|ASMITA|KEY|SECRET|TOKEN|PASSWORD|API/i.test(k)) &&
        !Object.values(process.env).some((v) => String(v).includes("parent-secret"));
      const argvOk = ![...process.argv, ...process.execArgv].some((a) => a.includes("parent-secret"));
      const shapeOk = Object.keys(m).sort().join(",") === "bytes,id,minSide" && b instanceof Uint8Array;
      return process.send({
        id: m.id,
        ok: false,
        code: !envOk ? "invalid_url" : !shapeOk ? "dns_failed" : !argvOk ? "blocked_port" : "image_format",
        rss: rss(),
      });
    }
    case 0x07:
      process.send({ id: m.id, ok: true, pdq: OK_HASH, quality: 77, rss: rss() });
      dying = true;
      setTimeout(() => process.exit(0), 150);
      return;
    case 0x08:
      return process.send({ id: m.id, ok: true, pdq: OK_HASH, quality: 77, rss: 2 ** 40 });
    // 0x0e: a sprite reply to a normal task (the wrong reply kind, WP21).
    case 0x0e:
      return process.send(spriteReply(m.id, [{ pdq: OK_HASH, quality: 77 }]));
  }
});
