import { Queue } from "bullmq";
import IORedis from "ioredis";

export type NoticeJob = {
  caseId: string;
  urlId: string;
};

export const noticeJobs: NoticeJob[] = [];
export const escalationJobs: NoticeJob[] = [];

let redisConnection: IORedis | null = null;
let noticeQueue: Queue<NoticeJob> | null = null;
let escalationQueue: Queue<NoticeJob> | null = null;

function shouldUseBullMq() {
  return process.env.QUEUE_DRIVER === "bullmq" && Boolean(process.env.REDIS_URL);
}

function getRedisConnection() {
  if (!redisConnection) {
    redisConnection = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
  }
  return redisConnection;
}

export function getNoticeQueue() {
  if (!noticeQueue) {
    noticeQueue = new Queue<NoticeJob>("notices", { connection: getRedisConnection() });
  }
  return noticeQueue;
}

export function getEscalationQueue() {
  if (!escalationQueue) {
    escalationQueue = new Queue<NoticeJob>("escalations", { connection: getRedisConnection() });
  }
  return escalationQueue;
}

export async function enqueueNoticeJob(job: NoticeJob) {
  if (shouldUseBullMq()) {
    await getNoticeQueue().add("dispatch-notice", job, {
      jobId: `${job.caseId}:${job.urlId}`,
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  }
  noticeJobs.push(job);
  return job;
}

export async function enqueueEscalationJob(job: NoticeJob) {
  if (shouldUseBullMq()) {
    await getEscalationQueue().add("schedule-escalation", job, {
      jobId: `${job.caseId}:${job.urlId}`,
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  }
  escalationJobs.push(job);
  return job;
}
