/**
 * TEST-ONLY network policies, injected in code. Nothing in src/ can produce
 * these; production always uses productionPolicy().
 */
import { productionPolicy, type NetPolicy, type ResolvedAddress, type Resolver } from "../../src/net/policy.ts";

/** Production address/port rules with a fake DNS table (for SSRF tests). */
export function fakeDnsPolicy(table: Record<string, string[]>): NetPolicy {
  const resolve: Resolver = async (host) => {
    const addrs = table[host];
    if (!addrs) throw Object.assign(new Error("not found"), { code: "ENOTFOUND" });
    return addrs.map((address): ResolvedAddress => ({ address, family: address.includes(":") ? 6 : 4 }));
  };
  return productionPolicy(resolve);
}

/**
 * Lets the crawler reach a fixture server on 127.0.0.1:<port>. Every listed
 * hostname (and its subdomains) resolves to 127.0.0.1; every other address
 * still goes through the production blocklist, so a redirect to 10.0.0.1 or
 * 169.254.169.254 is still refused.
 */
export function loopbackTestPolicy(hostnames: string[], port: number, extraDns: Record<string, string[]> = {}): NetPolicy {
  const prod = productionPolicy();
  return {
    resolve: async (host) => {
      if (extraDns[host]) return extraDns[host].map((address) => ({ address, family: address.includes(":") ? 6 : 4 }) as ResolvedAddress);
      if (hostnames.some((h) => host === h || host.endsWith(`.${h}`))) return [{ address: "127.0.0.1", family: 4 }];
      throw Object.assign(new Error("not found"), { code: "ENOTFOUND" });
    },
    isAddressAllowed: (address) => address === "127.0.0.1" || prod.isAddressAllowed(address),
    isPortAllowed: (p, protocol) => p === port || prod.isPortAllowed(p, protocol),
  };
}
