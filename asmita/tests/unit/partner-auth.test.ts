import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP30, memory path (no DATABASE_URL): the partner key store and the shared
// partner-route gate. Synthetic data only: example domains, random keys.

import { hashPartnerKey, issuePartnerKey, revokePartnerKey, verifyPartnerKey, authenticatePartner, readPartnerBody } from "@/lib/partner-auth";
import { partnerMemory, resetPartnerMemory } from "@/lib/partner-store";
import { inMemoryAuditLog } from "@/lib/audit";
import { securityEvents } from "@/lib/security-log";
import { z } from "zod";

function seedPartner(overrides: Record<string, unknown> = {}) {
  const id = `partner-${Math.random().toString(36).slice(2, 8)}`;
  partnerMemory().partners.set(id, {
    id,
    name: "ExampleTube",
    primaryDomain: "example-tube.example",
    extraDomains: [],
    status: "ACTIVE",
    channelEmailEncrypted: null,
    createdFromApplicationId: null,
    crawlPermissionRecordedAt: null,
    crawlPermissionRecordedById: null,
    crawlPermissionNote: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as never);
  return id;
}

let ipCounter = 0;
function request(headers: Record<string, string> = {}) {
  ipCounter += 1;
  return new Request("https://asmita.test/api/partner/v1/x", {
    headers: { "cf-connecting-ip": `192.0.2.${ipCounter % 250}`, ...headers },
  });
}

function bearer(key: string, ip?: string) {
  return request({ authorization: `Bearer ${key}`, ...(ip ? { "cf-connecting-ip": ip } : {}) });
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  resetPartnerMemory();
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
  securityEvents.splice(0, securityEvents.length);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("partner keys", () => {
  it("issues a ppk_ key and stores only its sha256, never the key", async () => {
    const partnerId = seedPartner();
    const issued = await issuePartnerKey(partnerId, "Integration key");
    expect(issued.key).toMatch(/^ppk_[0-9a-f]{48}$/);
    const row = partnerMemory().keys.get(issued.id)!;
    expect(row.keyHash).toBe(hashPartnerKey(issued.key));
    expect(row.label).toBe("Integration key");
    expect(row.partnerId).toBe(partnerId);
    expect(row.revokedAt).toBeNull();
    // The key itself is nowhere in the store.
    expect(JSON.stringify(partnerMemory())).not.toContain(issued.key);
  });

  it("verifies a valid key and touches lastUsedAt; a wrong key does not", async () => {
    const partnerId = seedPartner();
    const issued = await issuePartnerKey(partnerId, "k1");
    const verified = await verifyPartnerKey(issued.key);
    expect(verified).toEqual({ ok: true, keyId: issued.id, partnerId, scopes: ["feed", "outcomes"] });
    const touched = partnerMemory().keys.get(issued.id)!.lastUsedAt;
    expect(touched).toBeInstanceOf(Date);

    const before = partnerMemory().keys.get(issued.id)!.lastUsedAt;
    expect(await verifyPartnerKey("ppk_" + "0".repeat(48))).toEqual({ ok: false, reason: "invalid" });
    expect(partnerMemory().keys.get(issued.id)!.lastUsedAt).toBe(before);
  });

  it("refuses a revoked key (revocation is honoured immediately)", async () => {
    const partnerId = seedPartner();
    const issued = await issuePartnerKey(partnerId, "k1");
    expect(await revokePartnerKey(issued.id)).toBe(true);
    expect(await verifyPartnerKey(issued.key)).toEqual({ ok: false, reason: "revoked" });
    // Revoking twice is not a change.
    expect(await revokePartnerKey(issued.id)).toBe(false);
  });

  it("reports a key whose partner row is gone, and a suspended partner", async () => {
    const partnerId = seedPartner();
    const issued = await issuePartnerKey(partnerId, "k1");
    partnerMemory().partners.delete(partnerId);
    expect(await verifyPartnerKey(issued.key)).toEqual({ ok: false, reason: "partner_missing" });

    const other = seedPartner({ status: "SUSPENDED" });
    const otherKey = await issuePartnerKey(other, "k2");
    expect(await verifyPartnerKey(otherKey.key)).toEqual({ ok: false, reason: "suspended" });
  });

  it("issues keys with scopes and defaults to both (WP110)", async () => {
    const partnerId = seedPartner();
    const both = await issuePartnerKey(partnerId, "both");
    expect(both.scopes).toEqual(["feed", "outcomes"]);
    expect(partnerMemory().keys.get(both.id)!.scopes).toEqual(["feed", "outcomes"]);

    const feedOnly = await issuePartnerKey(partnerId, "read-only", ["feed"]);
    expect(feedOnly.scopes).toEqual(["feed"]);
    // An unknown scope name is dropped, not stored.
    const filtered = await issuePartnerKey(partnerId, "odd", ["feed", "not-a-scope"]);
    expect(filtered.scopes).toEqual(["feed"]);

    const bothVerified = await verifyPartnerKey(both.key);
    expect(bothVerified.ok && bothVerified.scopes).toEqual(["feed", "outcomes"]);
    const feedOnlyVerified = await verifyPartnerKey(feedOnly.key);
    expect(feedOnlyVerified.ok && feedOnlyVerified.scopes).toEqual(["feed"]);

    // A key row from before scopes existed reads as both — the database
    // default the migration gives every existing row.
    const legacyId = "legacy-key-id";
    partnerMemory().keys.set(legacyId, {
      id: legacyId, partnerId, keyHash: hashPartnerKey("ppk_" + "b".repeat(48)), label: "legacy",
      createdAt: new Date(), revokedAt: null, lastUsedAt: null,
    } as never);
    const legacy = await verifyPartnerKey("ppk_" + "b".repeat(48));
    expect(legacy.ok && legacy.scopes).toEqual(["feed", "outcomes"]);
  });
});

describe("authenticatePartner", () => {
  it("answers the same 401 for a missing, wrong or revoked key, saying nothing about which", async () => {
    const partnerId = seedPartner();
    const issued = await issuePartnerKey(partnerId, "k1");
    await revokePartnerKey(issued.id);

    const noKey = await authenticatePartner(request(), "feed", 100, "feed");
    const wrong = await authenticatePartner(bearer("ppk_" + "0".repeat(48)), "feed", 100, "feed");
    const revoked = await authenticatePartner(bearer(issued.key), "feed", 100, "feed");
    for (const result of [noKey, wrong, revoked]) {
      expect(result.ok).toBe(false);
      const response = (result as { response: Response }).response;
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "unauthorized" });
    }
  });

  it("lets an active partner through and returns the partner id that scopes its data", async () => {
    const partnerId = seedPartner();
    const issued = await issuePartnerKey(partnerId, "k1");
    const result = await authenticatePartner(bearer(issued.key), "feed", 100, "feed");
    expect(result).toEqual({ ok: true, keyId: issued.id, partnerId });
  });

  it("refuses a suspended partner with 403 partner_suspended, without logging an auth failure", async () => {
    const partnerId = seedPartner({ status: "SUSPENDED" });
    const issued = await issuePartnerKey(partnerId, "k1");
    const result = await authenticatePartner(bearer(issued.key), "feed", 100, "feed");
    expect(result.ok).toBe(false);
    const response = (result as { response: Response }).response;
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "partner_suspended" });
    // The key was valid: no auth_failed event for the suspended answer.
    expect(securityEvents.filter((event) => event.event === "auth_failed")).toHaveLength(0);
  });

  it("answers 403 insufficient_scope for a valid key without the route's scope (WP110)", async () => {
    const partnerId = seedPartner();
    const issued = await issuePartnerKey(partnerId, "outcomes only", ["outcomes"]);
    const result = await authenticatePartner(bearer(issued.key), "feed", 100, "feed");
    expect(result.ok).toBe(false);
    const response = (result as { response: Response }).response;
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "insufficient_scope" });
    // The refusal is logged with the route and reason only, never key material.
    const failure = securityEvents.find((event) => event.event === "auth_failed");
    expect(failure?.route).toBe("/api/partner/feed");
    expect(failure?.reason).toBe("insufficient_scope");
    expect(JSON.stringify(securityEvents)).not.toContain(issued.key);

    // The same key passes a route whose scope it holds.
    const allowed = await authenticatePartner(bearer(issued.key), "outcomes", 100, "outcomes");
    expect(allowed).toEqual({ ok: true, keyId: issued.id, partnerId });

    // A wrongly-scoped request still consumes the key's rate-limit bucket
    // (checked after the accounting, so probing cannot escape it).
    const other = await issuePartnerKey(partnerId, "tiny", ["outcomes"]);
    for (let i = 0; i < 2; i += 1) {
      const denied = await authenticatePartner(bearer(other.key), `route-${other.id}`, 2, "feed");
      expect((denied as { response: Response }).response.status).toBe(403);
    }
    const exhausted = await authenticatePartner(bearer(other.key), `route-${other.id}`, 2, "outcomes");
    expect((exhausted as { response: Response }).response.status).toBe(429);
  });

  it("rate limits per key per route", async () => {
    const partnerId = seedPartner();
    const issued = await issuePartnerKey(partnerId, "k1");
    const statuses: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const result = await authenticatePartner(bearer(issued.key), `route-${issued.id}`, 2, "feed");
      statuses.push(result.ok ? 200 : (result as { response: Response }).response.status);
    }
    expect(statuses).toEqual([200, 200, 429]);
  });

  it("rate limits all attempts from one IP before the key check", async () => {
    const partnerId = seedPartner();
    const issued = await issuePartnerKey(partnerId, "k1");
    const ip = `198.51.100.${(ipCounter += 1) % 250}`;
    let last = 0;
    // 300 attempts exhaust the shared IP bucket (bad and good alike count).
    for (let i = 0; i < 301; i += 1) {
      const result = await authenticatePartner(bearer(i % 2 === 0 ? issued.key : "ppk_" + "0".repeat(48), ip), "flood", 1000, "feed");
      last = result.ok ? 200 : (result as { response: Response }).response.status;
      if (last === 429) break;
    }
    expect(last).toBe(429);
  });

  it("logs security events with the route only, never key material", async () => {
    const secret = "ppk_" + "a".repeat(48);
    await authenticatePartner(bearer(secret), "feed", 100, "feed");
    const failures = securityEvents.filter((event) => event.event === "auth_failed");
    expect(failures).toHaveLength(1);
    expect(failures[0].route).toBe("/api/partner/feed");
    expect(JSON.stringify(securityEvents)).not.toContain(secret);
  });
});

describe("readPartnerBody", () => {
  const schema = z.object({ note: z.string().min(3) }).strict();

  function bodyRequest(body: string, headers: Record<string, string> = {}) {
    return new Request("https://asmita.test/api/partner/v1/x", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
    });
  }

  it("parses a valid body", async () => {
    const result = await readPartnerBody(bodyRequest(JSON.stringify({ note: "removed" })), schema);
    expect(result).toEqual({ ok: true, value: { note: "removed" } });
  });

  it("refuses a body over the cap, malformed JSON and unknown fields", async () => {
    const tooBig = await readPartnerBody(bodyRequest(JSON.stringify({ note: "x".repeat(40 * 1024) })), schema);
    expect(tooBig).toEqual({ ok: false, error: "payload_too_large" });

    const malformed = await readPartnerBody(bodyRequest("{not json"), schema);
    expect(malformed).toEqual({ ok: false, error: "invalid_payload" });

    const extra = await readPartnerBody(bodyRequest(JSON.stringify({ note: "removed", image: "data:image/png;base64,AAAA" })), schema);
    expect(extra).toEqual({ ok: false, error: "invalid_payload" });
  });
});
