import { writeAuditLog } from "@/lib/audit";
import type { NoticeJob } from "@/jobs/queue";

export async function processEscalationJob(job: NoticeJob, level: 1 | 2 | 3) {
  await writeAuditLog({
    eventType:
      level === 1
        ? "ESCALATION_L1_TRIGGERED"
        : level === 2
          ? "ESCALATION_L2_TRIGGERED"
          : "ESCALATION_L3_TRIGGERED",
    entityType: "SubmittedUrl",
    entityId: job.urlId,
    data: { caseId: job.caseId, level },
  });
  return { success: true, level };
}
