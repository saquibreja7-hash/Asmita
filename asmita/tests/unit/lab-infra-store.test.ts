import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { inMemoryAuditLog } from "@/lib/audit";
import { labMemory, resetLabMemory } from "@/lib/lab/lab-store";
import {
  createLabProvider,
  createServiceLink,
  listInfraFindingsForService,
  listInfraScansForService,
  listLabProviders,
  listServiceLinks,
  recordInfraScan,
  recordScanFindings,
  updateLabProvider,
} from "@/lib/lab/infra/store";
import type { ExtractedFinding } from "@/lib/lab/infra/extract";

/*
 * WP114 (research-tools-spec.md): the memory store behind the
 * infrastructure registry — provider directory, scan rows, and the
 * change-tracking rule: a finding the newest scan no longer sees becomes
 * active=false and is never deleted. E2 tests the memory backend (no
 * DATABASE_URL in unit tests); Kysely and Prisma share the same logic.
 */

const NOW = new Date("2026-11-22T10:00:00.000Z");
const LATER = new Date("2026-11-29T10:00:00.000Z");

function finding(category: ExtractedFinding["category"], value: string, provider?: string): ExtractedFinding {
  return { category, value, evidence: `evidence for ${value}`, confidence: "HIGH", ...(provider ? { provider } : {}) };
}

beforeEach(() => {
  process.env.DATABASE_URL = "";
  resetLabMemory();
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
});

afterEach(() => {
  delete process.env.DATABASE_URL;
});

describe("providers", () => {
  it("creates unverified providers and audits them", async () => {
    const created = await createLabProvider(
      { name: "Example CDN", kind: "CDN", website: "https://example-cdn.example.test", abusePageUrl: null, abuseEmail: null, policyUrl: null, notes: null },
      "admin-1",
    );
    expect(created.ok).toBe(true);
    const listed = await listLabProviders();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ name: "Example CDN", kind: "CDN", abuseEmail: null, verifiedAt: null });
    expect(inMemoryAuditLog.filter((entry) => entry.eventType === "LAB_PROVIDER_CREATED")).toHaveLength(1);
  });

  it("rejects a duplicate (name, kind) pair but allows the same name under another kind", async () => {
    await createLabProvider({ name: "Example", kind: "CDN", website: "https://example.test" }, "admin-1");
    const duplicate = await createLabProvider({ name: "Example", kind: "CDN", website: "https://example.test" }, "admin-1");
    expect(duplicate).toMatchObject({ ok: false, error: "provider_exists" });
    const otherKind = await createLabProvider({ name: "Example", kind: "PAYMENT_PROCESSOR", website: "https://example.test" }, "admin-1");
    expect(otherKind.ok).toBe(true);
  });

  it("records who verified a provider and when, and un-verifies on demand", async () => {
    const created = await createLabProvider({ name: "Example Host", kind: "HOST", website: "https://example.test" }, "admin-1");
    if (!created.ok) throw new Error("seed failed");
    const verified = await updateLabProvider(created.provider.id, { verified: true }, "admin-2");
    if (!verified.ok) throw new Error("update failed");
    expect(verified.provider).toMatchObject({ verifiedById: "admin-2" });
    expect(verified.provider.verifiedAt).not.toBeNull();
    const cleared = await updateLabProvider(created.provider.id, { verified: false }, "admin-3");
    if (!cleared.ok) throw new Error("clear failed");
    expect(cleared.provider).toMatchObject({ verifiedById: null, verifiedAt: null });
    expect(inMemoryAuditLog.filter((entry) => entry.eventType === "LAB_PROVIDER_UPDATED")).toHaveLength(2);
    expect(await updateLabProvider("missing", { verified: true }, "admin-1")).toMatchObject({ ok: false, error: "provider_not_found" });
  });

  it("validates the payload", async () => {
    expect(await createLabProvider({ name: "", kind: "CDN", website: "https://x.example.test" } as never, "a")).toMatchObject({ ok: false, error: "invalid_payload" });
    expect(await createLabProvider({ name: "x", kind: "CDN", website: "not-a-url" }, "a")).toMatchObject({ ok: false, error: "invalid_payload" });
  });
});

describe("scans and findings", () => {
  it("records scan rows with their results", async () => {
    await recordInfraScan({ serviceId: "s1", url: "https://tool.example.test/", finalUrl: "https://tool.example.test/", httpStatus: 200, error: null }, "1", NOW);
    await recordInfraScan({ serviceId: "s1", url: "https://down.example.test/", finalUrl: null, httpStatus: null, error: "fetch_failed" }, "1", NOW);
    const scans = await listInfraScansForService("s1");
    expect(scans).toHaveLength(2);
    expect(scans[0]).toMatchObject({ url: "https://tool.example.test/", httpStatus: 200, error: null, signatureVersion: "1" });
    expect(scans[1]).toMatchObject({ error: "fetch_failed" });
  });

  it("upserts findings and marks unseen ones inactive, never deleting them", async () => {
    const first = await recordInfraScan({ serviceId: "s1", url: "https://tool.example.test/", finalUrl: null, httpStatus: 200, error: null }, "1", NOW);
    await recordScanFindings(
      "s1",
      first.id,
      [finding("PAYMENT", "js.stripe.com", "Stripe"), finding("ANALYTICS_ID", "G-ABC123DEFG")],
      new Set(["PAYMENT", "ANALYTICS_ID"]),
      NOW,
    );
    let rows = await listInfraFindingsForService("s1");
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.active)).toBe(true);
    expect(rows[0]!.firstSeenAt).toBe(NOW.toISOString());

    // A week later the payment provider switched: Stripe is gone, Razorpay
    // is in, the analytics id stays.
    const second = await recordInfraScan({ serviceId: "s1", url: "https://tool.example.test/", finalUrl: null, httpStatus: 200, error: null }, "1", LATER);
    const tracked = await recordScanFindings(
      "s1",
      second.id,
      [finding("PAYMENT", "checkout.razorpay.com", "Razorpay"), finding("ANALYTICS_ID", "G-ABC123DEFG")],
      new Set(["PAYMENT", "ANALYTICS_ID"]),
      LATER,
    );
    expect(tracked).toEqual({ deactivated: 1, upserted: 2 });

    rows = await listInfraFindingsForService("s1");
    expect(rows).toHaveLength(3);
    const stripe = rows.find((row) => row.value === "js.stripe.com")!;
    const razorpay = rows.find((row) => row.value === "checkout.razorpay.com")!;
    const analytics = rows.find((row) => row.value === "G-ABC123DEFG")!;
    expect(stripe.active).toBe(false); // switched away from, never deleted
    expect(stripe.firstSeenAt).toBe(NOW.toISOString());
    expect(stripe.lastSeenAt).toBe(LATER.toISOString());
    expect(razorpay.active).toBe(true);
    expect(razorpay.firstSeenAt).toBe(LATER.toISOString());
    expect(analytics.active).toBe(true);
    expect(analytics.scanId).toBe(second.id);
    expect(analytics.lastSeenAt).toBe(LATER.toISOString());
  });

  it("leaves findings alone in categories the run could not check", async () => {
    const scan = await recordInfraScan({ serviceId: "s1", url: "https://tool.example.test/", finalUrl: null, httpStatus: 200, error: null }, "1", NOW);
    await recordScanFindings("s1", scan.id, [finding("PAYMENT", "js.stripe.com"), finding("HOSTING_ASN", "203.0.113.7")], new Set(["PAYMENT", "HOSTING_ASN"]), NOW);

    // Next run the page fetch failed entirely: no category was checked, so
    // nothing is deactivated even though the scan produced no findings.
    const failing = await recordInfraScan({ serviceId: "s1", url: "https://tool.example.test/", finalUrl: null, httpStatus: null, error: "fetch_failed" }, "1", LATER);
    await recordScanFindings("s1", failing.id, [], new Set(), LATER);
    const rows = await listInfraFindingsForService("s1");
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.active)).toBe(true);
  });

  it("links a signature provider to a seeded directory row of the right kind", async () => {
    const created = await createLabProvider({ name: "Stripe", kind: "PAYMENT_PROCESSOR", website: "https://stripe.example.test" }, "admin-1");
    if (!created.ok) throw new Error("seed failed");
    const scan = await recordInfraScan({ serviceId: "s2", url: "https://tool.example.test/", finalUrl: null, httpStatus: 200, error: null }, "1", NOW);
    await recordScanFindings(
      "s2",
      scan.id,
      [finding("PAYMENT", "js.stripe.com", "Stripe"), finding("ANALYTICS_ID", "G-ABC123DEFG", "Google Analytics 4")],
      new Set(["PAYMENT", "ANALYTICS_ID"]),
      NOW,
    );
    const rows = await listInfraFindingsForService("s2");
    expect(rows.find((row) => row.value === "js.stripe.com")!.providerId).toBe(created.provider.id);
    // No directory row matches the analytics provider: unlinked, not wrong.
    expect(rows.find((row) => row.value === "G-ABC123DEFG")!.providerId).toBeNull();
  });
});

describe("service links", () => {
  it("stores links in canonical order once, whatever the argument order", async () => {
    await createServiceLink("service-b", "service-a", "SHARED_CRYPTO_ADDRESS", "bc1example", NOW);
    await createServiceLink("service-a", "service-b", "SHARED_CRYPTO_ADDRESS", "bc1example", LATER);
    const links = await listServiceLinks();
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ serviceAId: "service-a", serviceBId: "service-b", value: "bc1example" });
    // No self-links.
    await createServiceLink("service-a", "service-a", "SHARED_IP", "203.0.113.7", NOW);
    expect(await listServiceLinks()).toHaveLength(1);
    expect(labMemory().serviceLinks.size).toBe(1);
  });
});
