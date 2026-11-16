/**
 * Address classification for the SSRF guard.
 *
 * IPv4 uses a blocklist of every non-global range from the IANA special
 * purpose registry. IPv6 uses an allowlist: only global unicast (2000::/3) is
 * permitted, minus the special ranges inside it that tunnel or embed other
 * addresses (Teredo, 6to4, NAT64) or are documentation. IPv4-mapped and
 * IPv4-compatible IPv6 addresses are rejected outright rather than unwrapped.
 */
import { isIP } from "node:net";

type V4Range = readonly [base: number, prefix: number];

function v4(a: number, b: number, c: number, d: number): number {
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

const BLOCKED_V4: readonly V4Range[] = [
  [v4(0, 0, 0, 0), 8], // "this network"
  [v4(10, 0, 0, 0), 8], // private
  [v4(100, 64, 0, 0), 10], // CGNAT (also Alibaba metadata 100.100.100.200)
  [v4(127, 0, 0, 0), 8], // loopback
  [v4(169, 254, 0, 0), 16], // link-local, incl. 169.254.169.254 metadata
  [v4(172, 16, 0, 0), 12], // private
  [v4(192, 0, 0, 0), 24], // IETF protocol assignments
  [v4(192, 0, 2, 0), 24], // TEST-NET-1
  [v4(192, 31, 196, 0), 24], // AS112
  [v4(192, 52, 193, 0), 24], // AMT
  [v4(192, 88, 99, 0), 24], // 6to4 relay anycast
  [v4(192, 168, 0, 0), 16], // private
  [v4(192, 175, 48, 0), 24], // AS112 direct delegation
  [v4(198, 18, 0, 0), 15], // benchmarking
  [v4(198, 51, 100, 0), 24], // TEST-NET-2
  [v4(203, 0, 113, 0), 24], // TEST-NET-3
  [v4(224, 0, 0, 0), 4], // multicast
  [v4(240, 0, 0, 0), 4], // reserved + broadcast
];

export function parseIPv4(ip: string): number | null {
  if (isIP(ip) !== 4) return null;
  const parts = ip.split(".").map(Number);
  return v4(parts[0]!, parts[1]!, parts[2]!, parts[3]!);
}

export function isBlockedIPv4(ip: string): boolean {
  const n = parseIPv4(ip);
  if (n === null) return true;
  for (const [base, prefix] of BLOCKED_V4) {
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    if ((n & mask) >>> 0 === base) return true;
  }
  return false;
}

/** Expand an IPv6 literal to eight 16-bit groups, or null if it is not one. */
export function parseIPv6(input: string): number[] | null {
  let ip = input;
  if (ip.startsWith("[") && ip.endsWith("]")) ip = ip.slice(1, -1);
  // Zone ids (fe80::1%eth0) never belong in a crawl target.
  if (ip.includes("%")) return null;
  if (isIP(ip) !== 6) return null;
  const lastColon = ip.lastIndexOf(":");
  const maybeV4 = ip.slice(lastColon + 1);
  if (maybeV4.includes(".")) {
    // Rewrite a dotted IPv4 tail (::ffff:1.2.3.4) as two hex groups.
    const n = parseIPv4(maybeV4);
    if (n === null) return null;
    ip = `${ip.slice(0, lastColon + 1)}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const parse = (s: string | undefined) => (s ? s.split(":").map((h) => parseInt(h, 16)) : []);
  if (!ip.includes("::")) {
    const all = parse(ip);
    return all.length === 8 ? all : null;
  }
  const [head, rest] = ip.split("::");
  const left = parse(head);
  const right = parse(rest);
  const fill = 8 - left.length - right.length;
  if (fill < 0) return null;
  return [...left, ...new Array<number>(fill).fill(0), ...right];
}

function inV6(groups: number[], prefixGroups: number[], prefixLen: number): boolean {
  let bits = prefixLen;
  for (let i = 0; i < 8 && bits > 0; i++) {
    const take = Math.min(16, bits);
    const mask = (0xffff << (16 - take)) & 0xffff;
    if ((groups[i]! & mask) !== ((prefixGroups[i] ?? 0) & mask)) return false;
    bits -= take;
  }
  return true;
}

const BLOCKED_V6_INSIDE_GLOBAL: readonly [number[], number][] = [
  [[0x2001, 0x0000], 23], // IETF protocol assignments, incl. Teredo 2001::/32
  [[0x2001, 0x0db8], 32], // documentation
  [[0x2002], 16], // 6to4 (embeds an IPv4 address)
  [[0x3fff, 0x0000], 20], // documentation (RFC 9637)
  [[0x0064, 0xff9b], 96], // NAT64 (outside 2000::/3 anyway; listed for clarity)
];

export function isBlockedIPv6(ip: string): boolean {
  const g = parseIPv6(ip);
  if (!g) return true;
  // Only global unicast 2000::/3 is acceptable. This excludes ::, ::1,
  // IPv4-mapped ::ffff:0:0/96, IPv4-compatible ::/96, NAT64 64:ff9b::/96,
  // discard 100::/64, ULA fc00::/7 (incl. fd00:ec2::254 metadata), link-local
  // fe80::/10, site-local fec0::/10 and multicast ff00::/8.
  if (!inV6(g, [0x2000], 3)) return true;
  for (const [prefix, len] of BLOCKED_V6_INSIDE_GLOBAL) {
    if (inV6(g, prefix, len)) return true;
  }
  return false;
}

/** True when the literal address must never be connected to. */
export function isBlockedAddress(ip: string): boolean {
  const bare = ip.startsWith("[") && ip.endsWith("]") ? ip.slice(1, -1) : ip;
  const family = isIP(bare);
  if (family === 4) return isBlockedIPv4(bare);
  if (family === 6) return isBlockedIPv6(bare);
  return true;
}
