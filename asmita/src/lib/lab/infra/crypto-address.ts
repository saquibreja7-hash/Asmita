import { createHash } from "node:crypto";

/*
 * WP114 (research-tools-spec.md): crypto address extraction with checksum
 * validation, so random base58-looking text never becomes a finding.
 *
 * Supported, per the spec:
 *  - Bitcoin bech32 (BIP-173) and bech32m taproot (BIP-350), lowercase only
 *  - Bitcoin base58 P2PKH (0x00) and P2SH (0x05), double-SHA256 checksum
 *  - Ethereum 0x + 40 hex; EIP-55 checksum enforced whenever the case is
 *    mixed (all-lower and all-upper forms carry no checksum to check)
 *  - TRON 0x41 base58check
 *
 * The one-way hash for EIP-55 is keccak-256 (Ethereum's pre-SHA-3 padding),
 * which node:crypto does not provide, so a small Keccak-f[1600] follows.
 */

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_INDEX = new Map<string, number>([...BASE58_ALPHABET].map((char, index) => [char, index]));

/** Candidate patterns; every hit still has to pass its checksum. */
const CANDIDATES: { kind: "BTC" | "ETH" | "TRON"; regex: RegExp }[] = [
  // Base58 Bitcoin: 1 (P2PKH) or 3 (P2SH), then the base58 alphabet
  // including digits — the checksum check rejects false positives.
  { kind: "BTC", regex: /(?<![a-zA-Z0-9])[13][1-9A-HJ-NP-Za-km-z]{25,34}(?![a-zA-Z0-9])/g },
  { kind: "BTC", regex: /(?<![a-zA-Z0-9])bc1[02-9ac-hj-np-z]{11,71}(?![a-zA-Z0-9])/g },
  { kind: "ETH", regex: /(?<![a-fA-F0-9x])0x[a-fA-F0-9]{40}(?![a-fA-F0-9])/g },
  { kind: "TRON", regex: /(?<![a-zA-Z0-9])T[1-9A-HJ-NP-Za-km-z]{33}(?![a-zA-Z0-9])/g },
];

export type CryptoAddressKind = "BTC_P2PKH" | "BTC_P2SH" | "BTC_BECH32" | "ETH" | "TRON";

export type ExtractedCryptoAddress = {
  kind: CryptoAddressKind;
  value: string;
};

function doubleSha256(payload: Uint8Array): Uint8Array {
  const first = createHash("sha256").update(payload).digest();
  return new Uint8Array(createHash("sha256").update(first).digest());
}

function base58Decode(input: string): Uint8Array | null {
  if (input.length === 0 || input.length > 100) return null;
  const bytes = [0];
  for (const char of input) {
    const digit = BASE58_INDEX.get(char);
    if (digit === undefined) return null;
    let carry = digit;
    for (let i = bytes.length - 1; i >= 0; i--) {
      carry += bytes[i]! * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.unshift(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const char of input) {
    if (char === "1") bytes.unshift(0);
    else break;
  }
  return new Uint8Array(bytes);
}

/** A base58check 25-byte address with the given version byte (Bitcoin, TRON). */
function base58Check(input: string, version: number, length: number): boolean {
  const decoded = base58Decode(input);
  if (!decoded || decoded.length !== 25) return false;
  if (decoded[0] !== version) return false;
  const checksum = doubleSha256(decoded.subarray(0, length - 4));
  for (let i = 0; i < 4; i++) {
    if (decoded[length - 4 + i] !== checksum[i]) return false;
  }
  return true;
}

/* ---- bech32 / bech32m (BIP-173 / BIP-350) ---- */

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32_CONST = 1;
const BECH32M_CONST = 0x2bc830a3;

function bech32Polymod(values: number[]): number {
  const generator = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let check = 1;
  for (const value of values) {
    const top = check >> 25;
    check = ((check & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < 5; i++) {
      if ((top >> i) & 1) check ^= generator[i]!;
    }
  }
  return check;
}

function charsetValues(data: string): number[] | null {
  const values: number[] = [];
  for (const char of data) {
    const index = BECH32_CHARSET.indexOf(char);
    if (index === -1) return null;
    values.push(index);
  }
  return values;
}

/** Expands the human-readable part for the polymod checksum. */
function hrpExpand(hrp: string): number[] {
  const high = [...hrp].map((char) => char.charCodeAt(0) >> 5);
  const low = [...hrp].map((char) => char.charCodeAt(0) & 31);
  return [...high, 0, ...low];
}

function convertBits(data: number[], fromBits: number, toBits: number): number[] | null {
  // Strict conversion (BIP-173 decoding): the accumulator is masked to the
  // pending window (fromBits + toBits bits), leftover padding bits must be
  // fewer than fromBits and zero, and they are never emitted.
  const maxAccumulator = (1 << (fromBits + toBits)) - 1;
  const maxValue = (1 << toBits) - 1;
  let accumulator = 0;
  let bits = 0;
  const result: number[] = [];
  for (const value of data) {
    if (value < 0 || value >> fromBits !== 0) return null;
    accumulator = ((accumulator << fromBits) | value) & maxAccumulator;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      result.push((accumulator >> bits) & maxValue);
    }
  }
  if (bits >= fromBits || ((accumulator << (toBits - bits)) & maxValue) !== 0) return null;
  return result;
}

/** Validates a Bitcoin bech32/bech32m address (BIP-173, BIP-350). */
export function isValidBech32Address(address: string): boolean {
  const lower = address.toLowerCase();
  if (lower !== address) return false; // bech32 addresses are lowercase only
  const separator = lower.lastIndexOf("1");
  if (separator < 1 || separator + 7 > lower.length) return false;
  const hrp = lower.slice(0, separator);
  if (hrp !== "bc") return false;
  const dataValues = charsetValues(lower.slice(separator + 1));
  if (!dataValues) return false;
  const values = [...hrpExpand(hrp), ...dataValues];
  const checksum = bech32Polymod(values);
  const version = dataValues[0];
  if (version === undefined) return false;
  if (version > 16) return false;
  const expected = version === 0 ? BECH32_CONST : BECH32M_CONST;
  if (checksum !== expected) return false;
  const program = convertBits(dataValues.slice(1, -6), 5, 8);
  if (!program || program.length < 2 || program.length > 40) return false;
  if (version === 0 && program.length !== 20 && program.length !== 32) return false;
  return true;
}

/* ---- keccak-256 for EIP-55 ---- */

// Round constants split into 32-bit halves (lo, hi), lane order.
const KECCAK_ROUND_CONSTANTS: [number, number][] = [
  [0x00000001, 0x00000000], [0x00008082, 0x00000000], [0x0000808a, 0x80000000], [0x80008000, 0x80000000],
  [0x0000808b, 0x00000000], [0x80000001, 0x00000000], [0x80008081, 0x80000000], [0x00008009, 0x80000000],
  [0x0000008a, 0x00000000], [0x00000088, 0x00000000], [0x80008009, 0x00000000], [0x8000000a, 0x00000000],
  [0x8000808b, 0x00000000], [0x0000008b, 0x80000000], [0x00008089, 0x80000000], [0x00008003, 0x80000000],
  [0x00008002, 0x80000000], [0x00000080, 0x80000000], [0x0000800a, 0x00000000], [0x8000000a, 0x80000000],
  [0x80008081, 0x80000000], [0x00008080, 0x80000000], [0x80000001, 0x00000000], [0x80008008, 0x80000000],
];
// Round constants verified entry by entry against js-sha3's RC table (MIT).

// Rotation offsets per lane, lane index = x + 5y.
const KECCAK_ROTATIONS = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];

const MASK = 0xffffffff;

/** 64-bit rotate-left of the lane (lo, hi) by `shift` bits. */
function rotl64(lo: number, hi: number, shift: number): [number, number] {
  let s = shift % 64;
  if (s === 0) return [lo, hi];
  if (s === 32) return [hi, lo];
  if (s > 32) {
    const t = lo;
    lo = hi;
    hi = t;
    s -= 32;
  }
  return [((lo << s) | (hi >>> (32 - s))) & MASK, ((hi << s) | (lo >>> (32 - s))) & MASK];
}

/** Keccak-f[1600] over 25 64-bit lanes held as (lo, hi) 32-bit pairs. */
function keccakF(state: Uint32Array): void {
  const c = new Uint32Array(10); // 5 lanes as pairs: c[2x]=lo, c[2x+1]=hi
  const d = new Uint32Array(10);
  const b = new Uint32Array(50);
  for (let round = 0; round < 24; round++) {
    // theta
    for (let x = 0; x < 5; x++) {
      let lo = 0;
      let hi = 0;
      for (let y = 0; y < 5; y++) {
        lo ^= state[(x + 5 * y) * 2]!;
        hi ^= state[(x + 5 * y) * 2 + 1]!;
      }
      c[2 * x] = lo;
      c[2 * x + 1] = hi;
    }
    for (let x = 0; x < 5; x++) {
      const prevLo = c[2 * ((x + 4) % 5)]!;
      const prevHi = c[2 * ((x + 4) % 5) + 1]!;
      const [nextLo, nextHi] = rotl64(c[2 * ((x + 1) % 5)]!, c[2 * ((x + 1) % 5) + 1]!, 1);
      d[2 * x] = prevLo ^ nextLo;
      d[2 * x + 1] = prevHi ^ nextHi;
    }
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        state[(x + 5 * y) * 2] ^= d[2 * x]!;
        state[(x + 5 * y) * 2 + 1] ^= d[2 * x + 1]!;
      }
    }
    // rho and pi
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        const index = x + 5 * y;
        const [rotatedLo, rotatedHi] = rotl64(state[index * 2]!, state[index * 2 + 1]!, KECCAK_ROTATIONS[index]!);
        const target = (y + 5 * ((2 * x + 3 * y) % 5)) * 2;
        b[target] = rotatedLo;
        b[target + 1] = rotatedHi;
      }
    }
    // chi
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        const i = (x + 5 * y) * 2;
        const j = (((x + 1) % 5) + 5 * y) * 2;
        const k = (((x + 2) % 5) + 5 * y) * 2;
        state[i] = b[i]! ^ ((~b[j]! & MASK) & b[k]!);
        state[i + 1] = b[i + 1]! ^ ((~b[j + 1]! & MASK) & b[k + 1]!);
      }
    }
    // iota
    state[0] ^= KECCAK_ROUND_CONSTANTS[round]![0];
    state[1] ^= KECCAK_ROUND_CONSTANTS[round]![1];
  }
}

/** Keccak-256 with Keccak padding (Ethereum), for inputs under one block. */
export function keccak256(input: Uint8Array): Uint8Array {
  const rate = 136;
  if (input.length >= rate) throw new Error("keccak256: input longer than one block is not supported");
  const state = new Uint32Array(50);
  const padded = new Uint8Array(rate);
  padded.set(input);
  padded[input.length] ^= 0x01;
  padded[rate - 1] ^= 0x80;
  for (let lane = 0; lane < 17; lane++) {
    const base = lane * 8;
    state[lane * 2] =
      padded[base]! | (padded[base + 1]! << 8) | (padded[base + 2]! << 16) | (padded[base + 3]! << 24);
    state[lane * 2 + 1] =
      padded[base + 4]! | (padded[base + 5]! << 8) | (padded[base + 6]! << 16) | (padded[base + 7]! << 24);
  }
  keccakF(state);
  const output = new Uint8Array(32);
  for (let byte = 0; byte < 32; byte++) {
    // byte 0..3 is lane (byte>>3)'s low word, 4..7 its high word: word = byte >> 2.
    const half = state[byte >> 2]!;
    output[byte] = (half >>> ((byte % 4) * 8)) & 0xff;
  }
  return output;
}

/** EIP-55: checksum a mixed-case Ethereum address. */
export function isValidEthereumAddress(address: string): boolean {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return false;
  const hex = address.slice(2);
  const lower = hex.toLowerCase();
  const upper = hex.toUpperCase();
  if (hex === lower || hex === upper) return true; // no checksum to check
  const hash = keccak256(new TextEncoder().encode(lower));
  for (let i = 0; i < 40; i++) {
    const nibble = hash[i >> 1]! >> (i % 2 === 0 ? 4 : 0) & 0x0f;
    const character = hex[i]!;
    if (nibble >= 8 && character !== character.toUpperCase()) return false;
    if (nibble < 8 && character !== character.toLowerCase()) return false;
  }
  return true;
}

/**
 * Extracts checksum-valid crypto addresses from visible text or link
 * targets. Candidates that fail their checksum are dropped — a wrong
 * checksum is a random string, not an address.
 */
export function extractCryptoAddresses(text: string): ExtractedCryptoAddress[] {
  const found = new Map<string, ExtractedCryptoAddress>();
  for (const { kind, regex } of CANDIDATES) {
    regex.lastIndex = 0;
    for (const match of text.matchAll(regex)) {
      const candidate = match[0];
      let entry: ExtractedCryptoAddress | null = null;
      if (candidate.startsWith("bc1")) {
        if (isValidBech32Address(candidate)) entry = { kind: "BTC_BECH32", value: candidate };
      } else if (kind === "ETH") {
        if (isValidEthereumAddress(candidate)) entry = { kind: "ETH", value: candidate.toLowerCase() };
      } else if (kind === "TRON") {
        if (base58Check(candidate, 0x41, 25)) entry = { kind: "TRON", value: candidate };
      } else if (candidate[0] === "1") {
        if (base58Check(candidate, 0x00, 25)) entry = { kind: "BTC_P2PKH", value: candidate };
      } else {
        if (base58Check(candidate, 0x05, 25)) entry = { kind: "BTC_P2SH", value: candidate };
      }
      if (entry && !found.has(`${entry.kind}:${entry.value}`)) {
        found.set(`${entry.kind}:${entry.value}`, entry);
      }
    }
  }
  return [...found.values()];
}
