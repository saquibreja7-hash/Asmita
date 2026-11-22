import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  extractCryptoAddresses,
  isValidBech32Address,
  isValidEthereumAddress,
  keccak256,
} from "@/lib/lab/infra/crypto-address";

/*
 * WP114 (research-tools-spec.md): crypto address extraction with checksum
 * validation. The vectors are public specification examples (BIP-173,
 * BIP-350, EIP-55) and addresses built in-test with the same
 * base58check construction the networks define; nothing here is a real
 * person's wallet with funds in it.
 */

const HEX = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const TEXT = (text: string) => new TextEncoder().encode(text);

/** Base58-check encoding, written from the specification for the tests. */
function base58CheckEncode(payload: Uint8Array): string {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const checksum = createHash("sha256").update(createHash("sha256").update(payload).digest()).digest().subarray(0, 4);
  const bytes = [...payload, ...checksum];
  const digits: number[] = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i]! * 256;
      digits[i] = Math.floor(carry % 58);
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(Math.floor(carry % 58));
      carry = Math.floor(carry / 58);
    }
  }
  let encoded = "";
  for (const byte of bytes) {
    if (byte !== 0) break;
    encoded += "1";
  }
  return encoded + digits.reverse().map((digit) => ALPHABET[digit]).join("");
}

describe("keccak256", () => {
  it("matches the published hashes of the empty string and 'abc'", () => {
    expect(HEX(keccak256(TEXT("")))).toBe("c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
    expect(HEX(keccak256(TEXT("abc")))).toBe("4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45");
  });
});

describe("EIP-55 Ethereum checksums", () => {
  it("accepts the EIP-55 example and its checksum-less lowercase form", () => {
    expect(isValidEthereumAddress("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed")).toBe(true);
    expect(isValidEthereumAddress("0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed")).toBe(true);
    expect(isValidEthereumAddress("0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359")).toBe(true);
  });

  it("rejects a corrupted checksum and non-addresses", () => {
    expect(isValidEthereumAddress("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAee")).toBe(false);
    // All-lowercase carries no checksum, so any 40-hex form is accepted; a
    // wrong lowercase address cannot be told apart and is the checksum's
    // documented limitation.
    expect(isValidEthereumAddress("0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaee")).toBe(true);
    expect(isValidEthereumAddress("0x5aaeb6053f3e94c9b9a09f33669435e7ef1beae")).toBe(false);
    expect(isValidEthereumAddress("5aaeb6053f3e94c9b9a09f33669435e7ef1beaed")).toBe(false);
  });
});

describe("bech32 Bitcoin addresses", () => {
  it("accepts the BIP-173 and BIP-350 specification vectors", () => {
    expect(isValidBech32Address("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4")).toBe(true);
    expect(isValidBech32Address("bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3")).toBe(true);
    expect(isValidBech32Address("bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0")).toBe(true);
  });

  it("rejects a corrupted checksum, mixed case and non-bc prefixes", () => {
    expect(isValidBech32Address("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5")).toBe(false);
    expect(isValidBech32Address("BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4")).toBe(false);
    expect(isValidBech32Address("tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4")).toBe(false);
    expect(isValidBech32Address("bc1gw508d6qejxtdg4y5r3zarvary0c5xw7kw5a0p3")).toBe(false);
  });
});

describe("base58check Bitcoin and TRON addresses", () => {
  it("extracts addresses built with the specification encoding", () => {
    const payload = Buffer.from("7cf9c2547b2b2b1d4d0f0f0f0f0f0f0f0f0f0f0f", "hex");
    const p2pkh = base58CheckEncode(Buffer.concat([Buffer.from([0x00]), payload]));
    const p2sh = base58CheckEncode(Buffer.concat([Buffer.from([0x05]), payload]));
    const tron = base58CheckEncode(Buffer.concat([Buffer.from([0x41]), payload]));
    expect(p2pkh.startsWith("1")).toBe(true);
    expect(p2sh.startsWith("3")).toBe(true);
    expect(tron.startsWith("T")).toBe(true);

    const found = extractCryptoAddresses(`send to ${p2pkh}, or ${p2sh}, or ${tron}`);
    expect(found).toEqual([
      { kind: "BTC_P2PKH", value: p2pkh },
      { kind: "BTC_P2SH", value: p2sh },
      { kind: "TRON", value: tron },
    ]);
  });

  it("accepts the well-known genesis-block donation address", () => {
    const found = extractCryptoAddresses("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa");
    expect(found).toEqual([{ kind: "BTC_P2PKH", value: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa" }]);
  });

  it("rejects corrupted checksums and base58-looking words", () => {
    expect(extractCryptoAddresses("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb")).toEqual([]);
    expect(extractCryptoAddresses("3D5putzsumfKWJgXYCqLhpp1EZPpHBqqHj")).toEqual([]);
    // Random base58-shaped words are not addresses: the checksum drops them.
    expect(extractCryptoAddresses("password123ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijk")).toEqual([]);
  });
});

describe("extractCryptoAddresses", () => {
  it("finds every kind in one mixed, invented text and dedupes", () => {
    const p2pkh = base58CheckEncode(Buffer.concat([Buffer.from([0x00]), Buffer.alloc(20, 0x11)]));
    const tron = base58CheckEncode(Buffer.concat([Buffer.from([0x41]), Buffer.alloc(20, 0x22)]));
    const text = [
      `Send BTC to ${p2pkh} today.`,
      "Ethereum: 0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
      "Segwit: bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
      `TRX: ${tron}`,
      `again duplicated: ${p2pkh}`,
      "not an address: 0x1234567890abcdef1234567890abcdef1234567",
    ].join(" ");
    const values = extractCryptoAddresses(text).map((found) => found.value);
    expect(values).toEqual([...new Set(values)]);
    expect(values).toContain(p2pkh);
    expect(values).toContain("0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed");
    expect(values).toContain("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4");
    expect(values).toContain(tron);
  });
});
