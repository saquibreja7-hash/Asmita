import { describe, expect, it, vi } from "vitest";
import { createAlertPayload, sendOnCallAlert } from "@/lib/alerts";

describe("alerts", () => {
  it("creates stable alert payloads with service metadata", () => {
    const payload = createAlertPayload({
      severity: "critical",
      title: "Dispatch failed",
      description: "Notice dispatch failed after retry.",
    });

    expect(payload.id).toHaveLength(16);
    expect(payload.service).toBe("asmita");
  });

  it("does not attempt network delivery without a webhook", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await sendOnCallAlert({
      severity: "warning",
      title: "Webhook missing",
      description: "No on-call webhook configured.",
    });

    expect(result).toMatchObject({ delivered: false, reason: "webhook_not_configured" });
    warn.mockRestore();
  });
});
