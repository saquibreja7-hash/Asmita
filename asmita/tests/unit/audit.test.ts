import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { inMemoryAuditLog, verifyAuditChain, writeAuditLog } from "@/lib/audit";

describe("audit log", () => {
  afterEach(() => inMemoryAuditLog.splice(0, inMemoryAuditLog.length));

  it("hash-chains append-only events", async () => {
    await writeAuditLog({ eventType: "CASE_CREATED", entityType: "Case", entityId: "case-1" });
    await writeAuditLog({ eventType: "URL_SUBMITTED", entityType: "Case", entityId: "case-1" });

    expect(inMemoryAuditLog).toHaveLength(2);
    expect(inMemoryAuditLog[0].previousHash).toBe("GENESIS");
    expect(inMemoryAuditLog[1].previousHash).toBe(inMemoryAuditLog[0].eventHash);
    expect(verifyAuditChain()).toBe(true);
  });

  it("detects tampering in the local audit chain", async () => {
    await writeAuditLog({ eventType: "CASE_CREATED", entityType: "Case", entityId: "case-1" });
    inMemoryAuditLog[0] = { ...inMemoryAuditLog[0], entityId: "case-2" };

    expect(verifyAuditChain()).toBe(false);
  });

  it("ships a database migration that blocks audit log updates and deletes", () => {
    const sql = readFileSync(
      path.join(process.cwd(), "prisma", "migrations", "20260512000000_audit_append_only", "migration.sql"),
      "utf8",
    );

    expect(sql).toContain("BEFORE UPDATE OR DELETE ON \"audit_log\"");
    expect(sql).toContain("REVOKE UPDATE, DELETE, TRUNCATE ON \"audit_log\"");
  });
});
