export type NoticeJob = {
  caseId: string;
  urlId: string;
};

export const noticeJobs: NoticeJob[] = [];
export const escalationJobs: NoticeJob[] = [];

export async function enqueueNoticeJob(job: NoticeJob) {
  noticeJobs.push(job);
  return job;
}

export async function enqueueEscalationJob(job: NoticeJob) {
  escalationJobs.push(job);
  return job;
}
