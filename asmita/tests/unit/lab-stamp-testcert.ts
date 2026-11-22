/*
 * WP94 (docs/lab/beta-spec.md): a throwaway self-signed C2PA signing
 * certificate, generated at runtime for tests only. Nothing here is ever
 * committed, and nothing here runs in production: the site's real signing
 * pair comes from LAB_C2PA_CERT / LAB_C2PA_KEY.
 *
 * Node's crypto cannot mint X.509 certificates, so this builds the DER by
 * hand — the smallest certificate the C2PA profile (spec section 14.5.1)
 * and c2pa-rs accept: v3, end-entity (basicConstraints CA:FALSE critical,
 * keyUsage digitalSignature critical), subjectKeyIdentifier,
 * authorityKeyIdentifier (c2pa-rs requires it on every signing cert, even a
 * self-signed one, where it points at the key itself), and the C2PA Signing
 * EKU (1.3.6.1.4.1.62558.2.1) with emailProtection.
 */

import crypto from "node:crypto";

const der = {
  len(n: number): number[] {
    if (n < 128) return [n];
    const bytes: number[] = [];
    let value = n;
    while (value) {
      bytes.unshift(value & 0xff);
      value >>= 8;
    }
    return [0x80 | bytes.length, ...bytes];
  },
  tlv(tag: number, content: Buffer): Buffer {
    return Buffer.concat([Buffer.from([tag, ...der.len(content.length)]), content]);
  },
  seq(...parts: Buffer[]): Buffer {
    return der.tlv(0x30, Buffer.concat(parts));
  },
  set(...parts: Buffer[]): Buffer {
    return der.tlv(0x31, Buffer.concat(parts));
  },
  int(value: number): Buffer {
    const bytes: number[] = [];
    let n = value;
    while (n) {
      bytes.unshift(n & 0xff);
      n = Math.floor(n / 256);
    }
    if (!bytes.length) bytes.push(0);
    if (bytes[0] & 0x80) bytes.unshift(0);
    return der.tlv(0x02, Buffer.from(bytes));
  },
  oid(value: string): Buffer {
    const parts = value.split(".").map(Number);
    const body = [parts[0] * 40 + parts[1]];
    for (const p of parts.slice(2)) {
      const stack: number[] = [];
      let v = p;
      stack.unshift(v & 0x7f);
      v >>= 7;
      while (v) {
        stack.unshift((v & 0x7f) | 0x80);
        v >>= 7;
      }
      body.push(...stack);
    }
    return der.tlv(0x06, Buffer.from(body));
  },
  printable(value: string): Buffer {
    return der.tlv(0x13, Buffer.from(value, "latin1"));
  },
  utctime(value: string): Buffer {
    return der.tlv(0x17, Buffer.from(value, "ascii"));
  },
  bitstr(bytes: Buffer, unused = 0): Buffer {
    return der.tlv(0x03, Buffer.concat([Buffer.from([unused]), bytes]));
  },
  octstr(bytes: Buffer): Buffer {
    return der.tlv(0x04, bytes);
  },
  bool(value: boolean): Buffer {
    return der.tlv(0x01, Buffer.from([value ? 0xff : 0x00]));
  },
  ctx(n: number, content: Buffer): Buffer {
    return der.tlv(0xa0 | n, content);
  },
};

export type TestSigningPair = { certPem: string; keyPem: string; commonName: string };

/** A fresh throwaway self-signed signing pair, different every run. */
export function generateTestSigningPair(commonName = "Asmita Lab Test Signer"): TestSigningPair {
  const keyPair = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const algId = der.seq(der.oid("1.2.840.10045.4.3.2")); // ecdsa-with-SHA256
  const name = der.seq(der.set(der.seq(der.oid("2.5.4.3"), der.printable(commonName))));
  const now = new Date();
  const utc = (d: Date) =>
    `${String(d.getUTCFullYear() % 100).padStart(2, "0")}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}000000Z`;
  const validity = der.seq(
    der.utctime(utc(new Date(now.getTime() - 24 * 3600 * 1000))),
    der.utctime(utc(new Date(now.getTime() + 365 * 24 * 3600 * 1000))),
  );
  const spki = keyPair.publicKey.export({ type: "spki", format: "der" }) as Buffer;
  // The subjectKeyIdentifier is the SHA-1 of the public key bits (the
  // uncompressed P-256 point is the last 65 bytes of the SPKI).
  const ski = crypto.createHash("sha1").update(spki.subarray(spki.length - 65)).digest();
  const extensions = der.seq(
    der.seq(der.oid("2.5.29.19"), der.bool(true), der.octstr(der.seq(der.bool(false)))),
    der.seq(der.oid("2.5.29.15"), der.bool(true), der.octstr(der.bitstr(Buffer.from([0x80]), 7))),
    der.seq(der.oid("2.5.29.14"), der.octstr(der.octstr(ski))),
    der.seq(der.oid("2.5.29.35"), der.octstr(der.seq(der.tlv(0x80, ski)))),
    der.seq(
      der.oid("2.5.29.37"),
      der.octstr(der.seq(der.oid("1.3.6.1.4.1.62558.2.1"), der.oid("1.3.6.1.5.5.7.3.4"))),
    ),
  );
  const tbs = der.seq(
    der.ctx(0, der.int(2)), // version v3
    der.int(Date.now() % 1000 + 1), // serialNumber, fresh every run
    algId,
    name, // issuer
    validity,
    name, // subject (self-signed)
    spki, // SubjectPublicKeyInfo
    der.ctx(3, extensions),
  );
  const signature = crypto.sign("sha256", tbs, keyPair.privateKey);
  const cert = der.seq(tbs, algId, der.bitstr(signature));

  // Node's own X.509 parser must accept what was built.
  const certPem = `-----BEGIN CERTIFICATE-----\n${cert.toString("base64").replace(/(.{64})/g, "$1\n")}\n-----END CERTIFICATE-----\n`;
  new crypto.X509Certificate(certPem);
  const keyPem = keyPair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  return { certPem, keyPem, commonName };
}
