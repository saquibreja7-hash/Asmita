import { beforeEach, describe, expect, it } from "vitest";
import { resetLabMemory } from "@/lib/lab/lab-store";
import { computeClusterCandidates } from "@/lib/lab/infra/cluster";
import { recordInfraScan, recordScanFindings, listServiceLinks } from "@/lib/lab/infra/store";
import { createLabService } from "@/lib/lab/lab-services";
import type { ExtractedFinding } from "@/lib/lab/infra/extract";

/*
 * WP114 (research-tools-spec.md): clustering rules. Two services that share
 * an analytics ID, a crypto address, a resolved IP, an exact nameserver
 * set or a TLS SAN become link candidates — except where the shared value
 * proves nothing: CDN anycast IPs and big DNS providers' NS sets. All
 * fixtures are invented example.test data.
 */

const NOW = new Date("2026-11-22T10:00:00.000Z");

function finding(category: ExtractedFinding["category"], value: string, evidence: string): ExtractedFinding {
  return { category, value, evidence, confidence: "HIGH" };
}

async function seedFindings(
  serviceId: string,
  findings: ExtractedFinding[],
  categories: string[],
): Promise<void> {
  const scan = await recordInfraScan(
    { serviceId, url: `https://${serviceId}.example.test/`, finalUrl: null, httpStatus: 200, error: null },
    "1",
    NOW,
  );
  await recordScanFindings(serviceId, scan.id, findings, new Set(categories), NOW);
}

async function linkKeys(): Promise<string> {
  const links = await listServiceLinks();
  return links.map((link) => `${link.reason}:${link.serviceAId}~${link.serviceBId}:${link.value}`).sort().join(" | ");
}

beforeEach(() => {
  process.env.DATABASE_URL = "";
  resetLabMemory();
});

describe("computeClusterCandidates", () => {
  it("links services that share an analytics id or crypto address", async () => {
    await seedFindings("service-a", [finding("ANALYTICS_ID", "G-SHARED1234", "html match"), finding("CRYPTO_ADDRESS", "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4", "crypto address")], ["ANALYTICS_ID", "CRYPTO_ADDRESS"]);
    await seedFindings("service-b", [finding("ANALYTICS_ID", "G-SHARED1234", "html match")], ["ANALYTICS_ID"]);
    await seedFindings("service-c", [finding("CRYPTO_ADDRESS", "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4", "crypto address")], ["CRYPTO_ADDRESS"]);
    const result = await computeClusterCandidates(["service-a", "service-b", "service-c"], NOW);
    expect(await linkKeys()).toBe(
      "SHARED_ANALYTICS_ID:service-a~service-b:G-SHARED1234 | " +
        "SHARED_CRYPTO_ADDRESS:service-a~service-c:bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
    );
    expect(result.candidatesCreated).toBe(2);
  });

  it("does not link a shared IP when either service sits behind a CDN", async () => {
    await seedFindings("service-a", [finding("HOSTING_ASN", "203.0.113.7", "A/AAAA"), finding("CDN", "Cloudflare", "response header")], ["HOSTING_ASN", "CDN"]);
    await seedFindings("service-b", [finding("HOSTING_ASN", "203.0.113.7", "A/AAAA")], ["HOSTING_ASN"]);
    await computeClusterCandidates(["service-a", "service-b"], NOW);
    expect(await linkKeys()).toBe("");
  });

  it("links a shared IP when neither service has a CDN finding", async () => {
    await seedFindings("service-a", [finding("HOSTING_ASN", "203.0.113.7", "A/AAAA")], ["HOSTING_ASN"]);
    await seedFindings("service-b", [finding("HOSTING_ASN", "203.0.113.7", "A/AAAA")], ["HOSTING_ASN"]);
    await computeClusterCandidates(["service-a"], NOW);
    expect(await linkKeys()).toBe("SHARED_IP:service-a~service-b:203.0.113.7");
  });

  it("does not link a big DNS provider's shared nameserver set", async () => {
    await seedFindings("service-a", [finding("NAMESERVER", "ns1.cloudflare.com,ns2.cloudflare.com", "NS")], ["NAMESERVER"]);
    await seedFindings("service-b", [finding("NAMESERVER", "ns1.cloudflare.com,ns2.cloudflare.com", "NS")], ["NAMESERVER"]);
    await computeClusterCandidates(["service-a", "service-b"], NOW);
    expect(await linkKeys()).toBe("");
  });

  it("links an exact custom nameserver set, and only an exact one", async () => {
    const ns = "ns1.dns.example.host,ns2.dns.example.host";
    await seedFindings("service-a", [finding("NAMESERVER", ns, "NS")], ["NAMESERVER"]);
    await seedFindings("service-b", [finding("NAMESERVER", ns, "NS")], ["NAMESERVER"]);
    await seedFindings("service-c", [finding("NAMESERVER", `${ns},ns3.dns.example.host`, "NS")], ["NAMESERVER"]);
    await computeClusterCandidates(["service-a", "service-b", "service-c"], NOW);
    expect(await linkKeys()).toBe(`SHARED_NAMESERVER_SET:service-a~service-b:${ns}`);
  });

  it("links a shared TLS SAN, never a shared certificate issuer", async () => {
    await seedFindings("service-a", [
      finding("TLS_ISSUER", "Example CA R3", "CT certificate issuer for a.example.test"),
      finding("TLS_ISSUER", "shared.example.net", "CT SAN on certificates for a.example.test"),
    ], ["TLS_ISSUER"]);
    await seedFindings("service-b", [
      finding("TLS_ISSUER", "Example CA R3", "CT certificate issuer for b.example.test"),
      finding("TLS_ISSUER", "shared.example.net", "CT SAN on certificates for b.example.test"),
    ], ["TLS_ISSUER"]);
    await computeClusterCandidates(["service-a", "service-b"], NOW);
    expect(await linkKeys()).toBe("SHARED_TLS_SAN:service-a~service-b:shared.example.net");
  });

  it("creates nothing for inactive findings and is idempotent", async () => {
    await seedFindings("service-a", [finding("ANALYTICS_ID", "G-SHARED1234", "html match")], ["ANALYTICS_ID"]);
    await seedFindings("service-b", [finding("ANALYTICS_ID", "G-SHARED1234", "html match")], ["ANALYTICS_ID"]);
    await computeClusterCandidates(["service-a", "service-b"], NOW);
    await computeClusterCandidates(["service-a", "service-b"], NOW);
    expect(await linkKeys()).toBe("SHARED_ANALYTICS_ID:service-a~service-b:G-SHARED1234");

    // The id went away in a later scan: the link stays as a candidate the
    // analyst saw, but no new links are drawn from inactive findings.
    const scan = await recordInfraScan({ serviceId: "service-b", url: "https://service-b.example.test/", finalUrl: null, httpStatus: 200, error: null }, "1", NOW);
    await recordScanFindings("service-b", scan.id, [], new Set(["ANALYTICS_ID"]), NOW);
    await computeClusterCandidates(["service-a", "service-b"], NOW);
    expect(await linkKeys()).toBe("SHARED_ANALYTICS_ID:service-a~service-b:G-SHARED1234");
  });

  it("links two services when one certificate covers both of their domains", async () => {
    // One certificate covers alpha-tool.test (X) and beta-tool.test (Y).
    // The scanner drops each service's own domain, so X records Y's domain
    // and Y records X's: the values differ, yet the cert is shared.
    const x = await createLabService({ name: "X tool", kind: "WEBSITE", urls: ["https://www.alpha-tool.test/"] }, "admin-1");
    const y = await createLabService({ name: "Y tool", kind: "WEBSITE", urls: ["https://beta-tool.test/"] }, "admin-1");
    if (!x.ok || !y.ok) throw new Error("seed failed");
    const xId = x.service.id;
    const yId = y.service.id;
    await seedFindings(xId, [finding("TLS_ISSUER", "beta-tool.test", "CT SAN on certificates for alpha-tool.test")], ["TLS_ISSUER"]);
    const [a, b] = [xId, yId].sort();

    // Only X scanned, and Y has no findings at all: X's SAN names Y's domain.
    const first = await computeClusterCandidates([xId], NOW);
    expect(await linkKeys()).toBe(`SHARED_TLS_SAN:${a}~${b}:beta-tool.test`);
    expect(first.reasons.SHARED_TLS_SAN).toBe(1);

    // Later Y is scanned alone: X's earlier SAN naming Y's domain still
    // links (no duplicate), and Y's own SAN naming X's domain adds its value.
    await seedFindings(yId, [finding("TLS_ISSUER", "alpha-tool.test", "CT SAN on certificates for beta-tool.test")], ["TLS_ISSUER"]);
    await computeClusterCandidates([yId], NOW);
    expect(await linkKeys()).toBe(
      `SHARED_TLS_SAN:${a}~${b}:alpha-tool.test | SHARED_TLS_SAN:${a}~${b}:beta-tool.test`,
    );
  });

  it("does not link on a certificate issuer name that happens to equal a domain-like value", async () => {
    const x = await createLabService({ name: "X tool", kind: "WEBSITE", urls: ["https://alpha-tool.test/"] }, "admin-1");
    const y = await createLabService({ name: "Y tool", kind: "WEBSITE", urls: ["https://beta-tool.test/"] }, "admin-1");
    if (!x.ok || !y.ok) throw new Error("seed failed");
    await seedFindings(x.service.id, [finding("TLS_ISSUER", "beta-tool.test", "CT certificate issuer for alpha-tool.test")], ["TLS_ISSUER"]);
    await computeClusterCandidates([x.service.id], NOW);
    expect(await linkKeys()).toBe("");
  });
});
