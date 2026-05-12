import { sha256 } from "@/lib/hash";

export type AlertSeverity = "info" | "warning" | "critical";

export type Alert = {
  severity: AlertSeverity;
  title: string;
  description: string;
  route?: string;
};

export function createAlertPayload(alert: Alert) {
  return {
    ...alert,
    id: sha256(`${alert.severity}:${alert.title}:${alert.description}`).slice(0, 16),
    createdAt: new Date().toISOString(),
    service: "asmita",
  };
}

export async function sendOnCallAlert(alert: Alert) {
  const payload = createAlertPayload(alert);
  const webhookUrl = process.env.ON_CALL_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn("[on-call-alert]", JSON.stringify(payload));
    return { delivered: false, payload, reason: "webhook_not_configured" as const };
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  return {
    delivered: response.ok,
    payload,
    status: response.status,
  };
}
