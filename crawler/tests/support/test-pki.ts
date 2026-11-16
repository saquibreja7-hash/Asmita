/**
 * TEST-ONLY in-memory PKI: a throwaway CA and leaf certificates generated at
 * runtime with node:crypto (ECDSA P-256), encoded with a minimal DER writer.
 * No key material is committed and nothing is written to disk; keys and
 * certificates exist only as strings in the test process.
 */
import { generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";

// ---- minimal DER encoding ----
function len(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n]);
  const bytes: number[] = [];
  for (let v = n; v > 0; v >>= 8) bytes.unshift(v & 0xff);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}
const tlv = (tag: number, content: Buffer) => Buffer.concat([Buffer.from([tag]), len(content.length), content]);
const seq = (...parts: Buffer[]) => tlv(0x30, Buffer.concat(parts));
const set = (...parts: Buffer[]) => tlv(0x31, Buffer.concat(parts));
const explicit = (n: number, inner: Buffer) => tlv(0xa0 + n, inner);
const bool = (v: boolean) => tlv(0x01, Buffer.from([v ? 0xff : 0x00]));
const octets = (b: Buffer) => tlv(0x04, b);
const bits = (b: Buffer) => tlv(0x03, Buffer.concat([Buffer.from([0]), b]));
const utf8 = (s: string) => tlv(0x0c, Buffer.from(s, "utf8"));
function integer(b: Buffer): Buffer {
  let v = b;
  while (v.length > 1 && v[0] === 0 && (v[1]! & 0x80) === 0) v = v.subarray(1);
  if (v[0]! & 0x80) v = Buffer.concat([Buffer.from([0]), v]);
  return tlv(0x02, v);
}
function oid(dotted: string): Buffer {
  const parts = dotted.split(".").map(Number);
  const out = [40 * parts[0]! + parts[1]!];
  for (const p of parts.slice(2)) {
    const stack = [p & 0x7f];
    for (let v = p >> 7; v > 0; v >>= 7) stack.unshift((v & 0x7f) | 0x80);
    out.push(...stack);
  }
  return tlv(0x06, Buffer.from(out));
}
function utcTime(d: Date): Buffer {
  const p = (n: number) => String(n).padStart(2, "0");
  const s = `${p(d.getUTCFullYear() % 100)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  return tlv(0x17, Buffer.from(s, "ascii"));
}

const ECDSA_SHA256 = seq(oid("1.2.840.10045.4.3.2"));
const name = (cn: string) => seq(set(seq(oid("2.5.4.3"), utf8(cn))));

function certificate(opts: {
  subjectCn: string;
  issuerCn: string;
  subjectPublicKey: KeyObject;
  issuerKey: KeyObject;
  isCa: boolean;
  dnsNames: string[];
}): string {
  const now = Date.now();
  const extensions: Buffer[] = [
    // basicConstraints (critical)
    seq(oid("2.5.29.19"), bool(true), octets(opts.isCa ? seq(bool(true)) : seq())),
  ];
  if (opts.dnsNames.length > 0) {
    // subjectAltName: dNSName is [2] IMPLICIT IA5String
    const names = opts.dnsNames.map((n) => tlv(0x82, Buffer.from(n, "ascii")));
    extensions.push(seq(oid("2.5.29.17"), octets(seq(...names))));
  }
  if (opts.isCa) {
    // keyUsage (critical): keyCertSign + cRLSign
    extensions.push(seq(oid("2.5.29.15"), bool(true), octets(tlv(0x03, Buffer.from([0x01, 0x06])))));
  }
  const tbs = seq(
    explicit(0, integer(Buffer.from([2]))), // v3
    integer(randomBytes(12)),
    ECDSA_SHA256,
    name(opts.issuerCn),
    seq(utcTime(new Date(now - 3_600_000)), utcTime(new Date(now + 86_400_000))),
    name(opts.subjectCn),
    opts.subjectPublicKey.export({ type: "spki", format: "der" }),
    explicit(3, seq(...extensions)),
  );
  const signature = sign("sha256", tbs, opts.issuerKey); // DER-encoded ECDSA signature
  const der = seq(tbs, ECDSA_SHA256, bits(signature));
  const b64 = der.toString("base64").replace(/(.{64})/g, "$1\n");
  return `-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----\n`;
}

const pem = (k: KeyObject) => k.export({ type: "pkcs8", format: "pem" }) as string;

export type TestCa = { cert: string; issue(dnsNames: string[]): { key: string; cert: string } };

/** A throwaway CA that can issue leaf certificates for given DNS names. */
export function createTestCa(cn = "Asmita Crawler Test CA"): TestCa {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const cert = certificate({ subjectCn: cn, issuerCn: cn, subjectPublicKey: publicKey, issuerKey: privateKey, isCa: true, dnsNames: [] });
  return {
    cert,
    issue(dnsNames) {
      const leaf = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
      return {
        key: pem(leaf.privateKey),
        cert: certificate({ subjectCn: dnsNames[0]!, issuerCn: cn, subjectPublicKey: leaf.publicKey, issuerKey: privateKey, isCa: false, dnsNames }),
      };
    },
  };
}

/** A leaf that signs itself (not issued by any trusted CA). */
export function selfSignedLeaf(dnsName: string): { key: string; cert: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return {
    key: pem(privateKey),
    cert: certificate({ subjectCn: dnsName, issuerCn: dnsName, subjectPublicKey: publicKey, issuerKey: privateKey, isCa: false, dnsNames: [dnsName] }),
  };
}

