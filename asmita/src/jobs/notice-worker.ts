import { writeAuditLog } from "@/lib/audit";
import { enqueueEscalationJob, type NoticeJob } from "@/jobs/queue";

export async function processNoticeJob(job: NoticeJob) {
  await writeAuditLog({
    eventType: "NOTICE_QUEUED",
    entityType: "SubmittedUrl",
    entityId: job.urlId,
    data: { caseId: job.caseId },
  });
  await enqueueEscalationJob(job);
  return { success: true };
}
