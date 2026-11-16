// TEST-ONLY stand-in for dist/decoder-worker.js. Behaviour is chosen by the
// first byte of the "image" it receives, so tests can drive every failure
// mode of the DecoderPool through the real IPC boundary.
//   0x00 valid reply             0x01 hang (never replies)
//   0x02 crash, printing URL-like text and bytes to stdout/stderr first
//   0x03 malformed reply (bad hash, extra field)   0x04 reply with a wrong id
//   0x05 exhaust the JS heap      0x06 report env keys + check request shape
const OK_HASH = "0123456789abcdef".repeat(4);

process.on("message", (m) => {
  const b = m.bytes;
  switch (b[0]) {
    case 0x00:
      return process.send({ id: m.id, ok: true, pdq: OK_HASH, quality: 77 });
    case 0x01:
      return; // hang
    case 0x02:
      process.stdout.write("https://leak.example/secret.jpg " + Buffer.from(b).toString("hex") + "\n");
      process.stderr.write("fatal at https://leak.example/ " + OK_HASH + "\n");
      return process.exit(3);
    case 0x03:
      return process.send({ id: m.id, ok: true, pdq: "not-hex", quality: 77, url: "https://leak.example/" });
    case 0x04:
      return process.send({ id: m.id + 999, ok: true, pdq: OK_HASH, quality: 77 });
    case 0x05: {
      const hog = [];
      for (;;) hog.push(new Array(1e6).fill(Math.random()));
    }
    case 0x06: {
      // Encode what this process can see as an allowed error code, so the
      // reply passes the pool's strict validation: "image_format" when the
      // environment holds only the scrubbed keys and the request carried only
      // { id, bytes, minSide }; "invalid_url" if the env holds anything else,
      // "dns_failed" if the request carried anything else.
      const allowed = new Set(["VIPS_DISC_THRESHOLD", "TMPDIR", "TMP", "TEMP"]);
      // On Windows libuv always copies these system variables into a child's
      // environment (uv_spawn "required" env); Linux adds nothing.
      const winRequired = /^(HOMEDRIVE|HOMEPATH|LOGONSERVER|PATH|SYSTEMDRIVE|SYSTEMROOT|USERDOMAIN|USERNAME|USERPROFILE|WINDIR)$/i;
      const envOk =
        Object.keys(process.env).every((k) => allowed.has(k) || (process.platform === "win32" && winRequired.test(k))) &&
        !Object.keys(process.env).some((k) => /CRAWLER|ASMITA|KEY|SECRET|TOKEN|PASSWORD|API/i.test(k)) &&
        !Object.values(process.env).some((v) => String(v).includes("parent-secret"));
      const shapeOk = Object.keys(m).sort().join(",") === "bytes,id,minSide" && b instanceof Uint8Array;
      return process.send({ id: m.id, ok: false, code: !envOk ? "invalid_url" : !shapeOk ? "dns_failed" : "image_format" });
    }
  }
});
