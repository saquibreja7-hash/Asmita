import { sha256 } from "@/lib/hash";

export type AlertSeverity = "info" | "warning" | "critical";

export type Alert = {
  severity: AlertSeverity;
  title: string;
  description: string;
  route?: string;
};

export type AlertDeliveryResult =
  | { delivered: true; status: number; payload: AlertPayload }
  | { delivered: false; payload: AlertPayload; reason: AlertSkipReason; status?: number; error?: string };

type AlertSkipReason =
  | "webhook_not_configured"
  | "severity_below_threshold"
  | "delivery_failed"
  | "request_aborted";

export type AlertPayload = ReturnType<typeof createAlertPayload>;

const DEFAULT_TIMEOUT_MS = 5000;

export function createAlertPayload(alert: Alert) {
  return {
    ...alert,
    id: sha256(`${alert.severity}:${alert.title}:${alert.description}`).slice(0, 16),
    createdAt: new Date().toISOString(),
    service: "asmita",
  };
}

function meetsThreshold(severity: AlertSeverity): boolean {
  const minimum = (process.env.ON_CALL_MIN_SEVERITY ?? "warning") as AlertSeverity;
  const rank: Record<AlertSeverity, number> = { info: 0, warning: 1, critical: 2 };
  return rank[severity] >= (rank[minimum] ?? rank.warning);
}

function formatForChannel(payload: AlertPayload): unknown {
  const channel = process.env.ON_CALL_WEBHOOK_FORMAT ?? "generic";
  if (channel === "slack") {
    const emoji = payload.severity === "critical" ? ":rotating_light:" : payload.severity === "warning" ? ":warning:" : ":information_source:";
    return {
      text: `${emoji} [${payload.severity.toUpperCase()}] ${payload.title}\n${payload.description}${payload.route ? `\nRoute: ${payload.route}` : ""}`,
      attachments: [{ fallback: payload.title, color: payload.severity === "critical" ? "danger" : "warning", fields: [{ title: "Alert ID", value: payload.id, short: true }, { title: "Created", value: payload.createdAt, short: true }] }],
    };
  }
  return payload;
}

export async function sendOnCallAlert(alert: Alert): Promise<AlertDeliveryResult> {
  const payload = createAlertPayload(alert);
  const webhookUrl = process.env.ON_CALL_WEBHOOK_URL;

  if (!meetsThreshold(alert.severity)) {
    return { delivered: false, payload, reason: "severity_below_threshold" };
  }

  if (!webhookUrl) {
    console.warn("[on-call-alert]", JSON.stringify(payload));
    return { delivered: false, payload, reason: "webhook_not_configured" };
  }

  const body = formatForChannel(payload);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn("[on-call-alert] non-2xx from webhook", { status: response.status, alertId: payload.id });
      return { delivered: false, payload, reason: "delivery_failed", status: response.status };
    }
    return { delivered: true, payload, status: response.status };
  } catch (err) {
    const aborted = controller.signal.aborted;
    console.warn("[on-call-alert] delivery error", { aborted, alertId: payload.id, error: err instanceof Error ? err.message : "unknown" });
    return {
      delivered: false,
      payload,
      reason: aborted ? "request_aborted" : "delivery_failed",
      error: err instanceof Error ? err.message : "unknown",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function sendOnCallAlertFireAndForget(alert: Alert): void {
  sendOnCallAlert(alert).catch((err) => {
    console.warn("[on-call-alert] unexpected error", err instanceof Error ? err.message : err);
  });
}
