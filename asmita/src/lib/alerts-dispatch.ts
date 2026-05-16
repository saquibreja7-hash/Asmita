import { sendOnCallAlert, type Alert, type AlertDeliveryResult, type AlertSeverity } from "@/lib/alerts";
import { evaluateOpsHealth, type OpsAlertKey, type OpsMetrics } from "@/lib/ops-health";

const SEVERITY_MAP: Record<OpsAlertKey, AlertSeverity> = {
  notice_dispatch_latency: "warning",
  notice_bounce_rate: "critical",
  escalation_queue_backlog: "warning",
  human_review_sla: "warning",
  otp_delivery_failure: "critical",
  api_5xx_rate: "critical",
  scheduler_lag: "warning",
  deletion_backlog: "critical",
};

const TITLE_MAP: Record<OpsAlertKey, string> = {
  notice_dispatch_latency: "Notice dispatch p95 exceeded threshold",
  notice_bounce_rate: "Notice email bounce rate elevated",
  escalation_queue_backlog: "Escalation queue items older than 4h",
  human_review_sla: "Human review SLA breached",
  otp_delivery_failure: "OTP delivery failure rate elevated",
  api_5xx_rate: "API 5xx rate elevated",
  scheduler_lag: "Scheduler lag detected",
  deletion_backlog: "Hard-delete jobs overdue",
};

export async function dispatchOpsAlerts(metrics: OpsMetrics): Promise<AlertDeliveryResult[]> {
  const { healthy, alerts } = evaluateOpsHealth(metrics);
  if (healthy) return [];

  const work: Promise<AlertDeliveryResult>[] = alerts.map((opsAlert) => {
    const alert: Alert = {
      severity: SEVERITY_MAP[opsAlert.key],
      title: TITLE_MAP[opsAlert.key],
      description: `${opsAlert.key} threshold ${opsAlert.threshold}, current=${opsAlert.value}`,
      route: opsAlert.key,
    };
    return sendOnCallAlert(alert);
  });

  return Promise.all(work);
}
