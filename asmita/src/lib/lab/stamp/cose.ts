/*
 * WP94 (docs/lab/beta-spec.md): the Content Credentials signing callback.
 *
 * The C2PA engine the site already ships (@contentauth/c2pa-wasm, the same
 * Rust core the on-device reader at /check-image runs) builds the manifest,
 * hashes the image and embeds everything — but it hands the COSE_Sign1
 * signature itself to JavaScript: the engine's wasm signer is a
 * "direct COSE handling" signer (c2pa-rs CallbackSigner with
 * direct_cose_handling = true). Our callback must therefore produce a
 * complete, tagged COSE_Sign1 — CBOR tag 18, RFC 8152 section 4.2 — whose
 * length equals the reserveSize we report, because the engine reserves
 * exactly that many bytes for the c2pa.signature box in the image hash it
 * computes beforehand.
 *
 * The claim bytes arrive as the callback's input; the signature is
 * ES256 (ECDSA P-256 over SHA-256) through WebCrypto, which returns the
 * P-1363 r||s form COSE wants and works in the Node dev server and in
 * workerd alike. The certificate from LAB_C2PA_CERT travels in the
 * protected x5chain header (RFC 9360 section 2), so the end-entity
 * certificate is integrity-protected, as C2PA requires.
 */

import { cborEncode, concatBytes } from "./cbor";

/** COSE label 1 is the algorithm (ES256 = -7); 33 is x5chain (RFC 9360). */
const COSE_ALG_ES256 = -7;
const COSE_LABEL_ALG = 1;
const COSE_LABEL_X5CHAIN = 33;
/** A P-256 P-1363 signature is always r (32 bytes) || s (32 bytes). */
const P256_SIGNATURE_BYTES = 64;
/** CBOR tag 18 identifies a COSE_Sign1. */
const TAG_COSE_SIGN1 = new Uint8Array([0xd2]);

export type CoseSigner = {
  alg: "es256";
  reserveSize: number;
  sign: (claimBytes: Uint8Array) => Promise<Uint8Array<ArrayBuffer>>;
};

/** The base64 body of a PEM block, as DER bytes. */
export function pemBody(pem: string): Uint8Array {
  const body = pem.replace(/-----(BEGIN|END)[^-]*-----/g, "").replace(/\s+/g, "");
  if (!body) throw new Error("empty PEM");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** True when the string parses as a PEM block with a base64 body. */
export function looksLikePem(value: string | undefined): value is string {
  if (!value) return false;
  return /-----BEGIN [^-]+-----[\s\S]+-----END [^-]+-----/.test(value);
}

/**
 * The signer the C2PA engine calls for the claim signature.
 *
 * reserveSize is computed, not guessed: the protected header depends only on
 * the certificate, and a P-256 signature is a fixed 64 bytes, so the exact
 * COSE_Sign1 length is known before any bytes are signed. The engine both
 * parses the returned bytes as one complete CBOR item and reserves
 * reserveSize bytes in the image hash — the two must agree exactly.
 */
export async function createCoseSigner(certPem: string, keyPem: string): Promise<CoseSigner> {
  const certDer = pemBody(certPem);
  const keyDer = pemBody(keyPem);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyDer as unknown as ArrayBuffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const protectedHeader = cborEncode({
    [String(COSE_LABEL_ALG)]: COSE_ALG_ES256,
    [String(COSE_LABEL_X5CHAIN)]: [certDer],
  });

  const reserveSize = concatBytes([
    TAG_COSE_SIGN1,
    cborEncode([protectedHeader, {}, null, new Uint8Array(P256_SIGNATURE_BYTES)]),
  ]).length;

  return {
    alg: "es256",
    reserveSize,
    async sign(claimBytes: Uint8Array) {
      // RFC 8152 section 4.4: Sig_structure = ["Signature1", protected,
      // external_aad, payload], signed with the COSE_Sign1's own bytes.
      const sigStructure = cborEncode([
        "Signature1",
        protectedHeader,
        new Uint8Array(0),
        claimBytes,
      ]);
      const signature = await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        key,
        sigStructure as unknown as ArrayBuffer,
      );
      const cose = cborEncode([protectedHeader, {}, null, new Uint8Array(signature)]);
      return concatBytes([TAG_COSE_SIGN1, cose]);
    },
  };
}
