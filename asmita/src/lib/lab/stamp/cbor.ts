/*
 * WP94 (docs/lab/beta-spec.md): a minimal CBOR encoder for the Content
 * Credentials signature (COSE_Sign1, RFC 8152 section 4.2). The Lab's stamp
 * signs server-side, and the only CBOR this needs to produce is the COSE
 * structure: integer keys, byte strings, one null and a couple of arrays —
 * never floats, never tags other than 18, never indefinite lengths. Writing
 * the ~70 lines here keeps the whole stamp self-contained: no CBOR library
 * enters the Worker bundle, and every byte that goes into a signature is
 * visible in one short file.
 *
 * WebAssembly-safe: plain Uint8Arrays, no Node Buffer, no string encoders
 * beyond TextEncoder.
 */

export type CborValue =
  | number
  | string
  | Uint8Array
  | CborValue[]
  | { [key: string]: CborValue }
  | null;

const encoder = new TextEncoder();

function head(major: number, length: number): number[] {
  const m = major << 5;
  if (length < 24) return [m | length];
  if (length <= 0xff) return [m | 24, length];
  if (length <= 0xffff) return [m | 25, length >> 8, length & 0xff];
  return [m | 26, (length >>> 24) & 0xff, (length >>> 16) & 0xff, (length >>> 8) & 0xff, length & 0xff];
}

/** One canonical-CBOR top-level value, as defined by RFC 8949 section 4.2.1. */
export function cborEncode(value: CborValue): Uint8Array<ArrayBuffer> {
  const parts: Uint8Array[] = [];
  const encode = (node: CborValue): void => {
    if (node === null) {
      parts.push(new Uint8Array([0xf6]));
      return;
    }
    if (typeof node === "number") {
      if (!Number.isInteger(node)) throw new Error("cbor: non-integer value");
      if (node >= 0) {
        parts.push(new Uint8Array(head(0, node)));
        return;
      }
      // Negative numbers encode as major type 1 with the value minus one.
      parts.push(new Uint8Array(head(1, -node - 1)));
      return;
    }
    if (typeof node === "string") {
      const bytes = encoder.encode(node);
      parts.push(new Uint8Array(head(3, bytes.length)), bytes);
      return;
    }
    if (node instanceof Uint8Array) {
      parts.push(new Uint8Array(head(2, node.length)), node);
      return;
    }
    if (Array.isArray(node)) {
      parts.push(new Uint8Array(head(4, node.length)));
      for (const item of node) encode(item);
      return;
    }
    const keys = Object.keys(node);
    parts.push(new Uint8Array(head(5, keys.length)));
    for (const key of keys) {
      // JavaScript object keys are always strings; keys that are plain
      // integers stay integers on the wire (COSE header labels are ints).
      if (/^-?\d+$/.test(key)) encode(Number(key));
      else encode(key);
      encode(node[key]);
    }
  };
  encode(value);
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Concatenate byte strings (CBOR never needs indefinite lengths here). */
export function concatBytes(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
