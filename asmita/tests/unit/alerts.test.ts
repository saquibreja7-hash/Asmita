import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAlertPayload, sendOnCallAlert } from "@/lib/alerts";

describe("alerts", () => {
  const originalWebhook = process.env.ON_CALL_WEBHOOK_URL;
  const originalFormat = process.env.ON_CALL_WEBHOOK_FORMAT;
  const originalSeverity = process.env.ON_CALL_MIN_SEVERITY;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.ON_CALL_WEBHOOK_URL = originalWebhook;
    process.env.ON_CALL_WEBHOOK_FORMAT = originalFormat;
    process.env.ON_CALL_MIN_SEVERITY = originalSeverity;
    warnSpy.mockRestore();
    vi.restoreAllMocks();
  });

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
    delete process.env.ON_CALL_WEBHOOK_URL;
    const result = await sendOnCallAlert({
      severity: "warning",
      title: "Webhook missing",
      description: "No on-call webhook configured.",
    });
    expect(result).toMatchObject({ delivered: false, reason: "webhook_not_configured" });
  });

  it("skips delivery for severity below the configured threshold", async () => {
    process.env.ON_CALL_WEBHOOK_URL = "https://hooks.example.test/webhook";
    process.env.ON_CALL_MIN_SEVERITY = "critical";
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await sendOnCallAlert({
      severity: "info",
      title: "Low priority",
      description: "Below threshold.",
    });
    expect(result).toMatchObject({ delivered: false, reason: "severity_below_threshold" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("delivers to a generic webhook with the raw payload shape", async () => {
    process.env.ON_CALL_WEBHOOK_URL = "https://hooks.example.test/webhook";
    process.env.ON_CALL_WEBHOOK_FORMAT = "generic";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));

    const result = await sendOnCallAlert({
      severity: "critical",
      title: "Outage",
      description: "Notice dispatch is down.",
    });

    expect(result).toMatchObject({ delivered: true, status: 200 });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(body).toMatchObject({ title: "Outage", service: "asmita" });
  });

  it("formats payload for Slack when ON_CALL_WEBHOOK_FORMAT=slack", async () => {
    process.env.ON_CALL_WEBHOOK_URL = "https://hooks.slack.com/services/abc/def/ghi";
    process.env.ON_CALL_WEBHOOK_FORMAT = "slack";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));

    await sendOnCallAlert({
      severity: "critical",
      title: "Pager",
      description: "Page on-call now.",
    });

    const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(body.text).toContain("CRITICAL");
    expect(body.text).toContain("Pager");
    expect(body.attachments[0].color).toBe("danger");
  });

  it("returns delivery_failed on non-2xx response without throwing", async () => {
    process.env.ON_CALL_WEBHOOK_URL = "https://hooks.example.test/webhook";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("server error", { status: 500 }));

    const result = await sendOnCallAlert({
      severity: "critical",
      title: "Bad webhook",
      description: "Webhook returned 500.",
    });
    expect(result).toMatchObject({ delivered: false, reason: "delivery_failed", status: 500 });
  });

  it("returns delivery_failed when fetch throws (network error)", async () => {
    process.env.ON_CALL_WEBHOOK_URL = "https://hooks.example.test/webhook";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("network down"));

    const result = await sendOnCallAlert({
      severity: "critical",
      title: "Network failure",
      description: "Cannot reach webhook host.",
    });
    expect(result).toMatchObject({ delivered: false, reason: "delivery_failed" });
  });
});
