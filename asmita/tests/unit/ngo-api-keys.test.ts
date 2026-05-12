import { afterEach, describe, expect, it } from "vitest";
import { issueNgoApiKey, ngoApiKeys, verifyNgoApiKey } from "@/lib/ngo-api-keys";

describe("NGO API keys", () => {
  afterEach(() => ngoApiKeys.clear());

  it("issues one-time plaintext keys and verifies by hash", () => {
    const { record, secret } = issueNgoApiKey("Demo NGO");

    expect(secret).toMatch(/^ngo_/);
    expect(record.keyHash).not.toBe(secret);
    expect(verifyNgoApiKey(secret)).toMatchObject({ partnerName: "Demo NGO" });
  });

  it("rejects revoked API keys", () => {
    const { record, secret } = issueNgoApiKey("Demo NGO");
    record.revokedAt = new Date().toISOString();

    expect(verifyNgoApiKey(secret)).toBeNull();
  });
});
