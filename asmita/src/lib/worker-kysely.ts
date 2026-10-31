import { Client, type QueryResultRow } from "pg";
import { Generated, Kysely, PostgresDialect } from "kysely";

type Timestamp = Date;

interface WorkerDatabase {
  User: {
    id: string;
    emailHash: string;
    emailEncrypted: string;
    emailVerified: boolean;
    ageOver18: boolean;
    role: "VICTIM" | "SUPPORTER" | "NGO_WORKER" | "ADMIN";
    preferredLocale: string | null;
    createdAt: Generated<Timestamp>;
    lastActiveAt: Timestamp | null;
    deactivatedAt: Timestamp | null;
  };
  OtpToken: {
    id: string;
    emailHash: string;
    tokenHash: string;
    expiresAt: Timestamp;
    used: Generated<boolean>;
    failedAttempts: Generated<number>;
    createdAt: Generated<Timestamp>;
  };
  Case: {
    id: string;
    referenceNumber: string;
    userId: string;
    registrationKeyHash: string | null;
    status: "OPEN" | "PARTIALLY_RESOLVED" | "RESOLVED" | "CLOSED" | "ESCALATED";
    hashAdvisoryPlatformIds: string[];
    firPackageGeneratedAt: Timestamp | null;
    createdAt: Generated<Timestamp>;
    updatedAt: Generated<Timestamp>;
  };
  SubmittedUrl: {
    id: string;
    caseId: string;
    urlEncrypted: string;
    urlHash: string;
    domain: string;
    platformId: string | null;
    status: "PENDING_REVIEW" | "NOTICE_QUEUED" | "NOTICE_SENT" | "ESCALATED" | "REMOVED" | "UNRESOLVED" | "REJECTED";
    submittedAt: Generated<Timestamp>;
    flaggedForReview: Generated<boolean>;
    flagReason: string | null;
    signedNoticePdf: string | null;
  };
  Platform: {
    id: string;
    name: string;
    domainPatterns: string[];
    tier: "TIER_1" | "TIER_2" | "TIER_3";
    noticeBasis: "IT_RULES_2021" | "DMCA" | "IT_RULES_AND_DMCA" | "EMAIL_ONLY" | "FORM_ONLY";
    grievanceEmail: string | null;
    formUrl: string | null;
    apiEndpoint: string | null;
    lastContactVerifiedAt: Timestamp | null;
    lastContactVerifiedByHuman: Generated<boolean>;
    isActive: Generated<boolean>;
  };
  SecurityEventLog: {
    id: string;
    event: string;
    actorHash: string | null;
    route: string | null;
    reason: string | null;
    createdAt: Generated<Timestamp>;
  };
  audit_log: {
    id: string;
    sequence: number;
    eventType: string;
    entityType: string | null;
    entityId: string | null;
    actorId: string | null;
    data: unknown | null;
    ipHash: string | null;
    previousHash: string;
    eventHash: string;
    createdAt: Timestamp;
  };
  EmailDeliveryProof: {
    id: string;
    messageId: string;
    eventType: string;
    platformId: string | null;
    receivedAt: Generated<Timestamp>;
  };
  DeletionJob: {
    id: string;
    caseId: string;
    scheduledAt: Timestamp;
    completedAt: Timestamp | null;
    status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "FAILED";
    error: string | null;
  };
  Notice: {
    id: string;
    urlId: string;
    templateId: string | null;
    sentAt: Timestamp | null;
    responseType: string | null;
    removedAt: Timestamp | null;
    escalationLevel: Generated<number>;
  };
  NoticeTemplate: {
    id: string;
    bodyTemplate: string;
    subjectTemplate: string;
    reviewedByLegal: Generated<boolean>;
  };
  Escalation: {
    id: string;
    noticeId: string;
    level: number;
    actionType: string;
    completedAt: Timestamp | null;
  };
}

class HyperdriveClientPool {
  async connect() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("database_not_configured");

    // Hyperdrive owns the shared origin pool. A short-lived pg Client is the
    // documented Workers pattern and avoids retaining sockets between requests.
    const client = new Client({ connectionString });
    await client.connect();
    return {
      query: <R extends QueryResultRow>(text: string, values: readonly unknown[]) => client.query<R>(text, values as unknown[]) as never,
      release: () => { void client.end().catch(() => undefined); },
    };
  }

  async end() {
    // Individual clients are closed by release(). Hyperdrive retains its pool.
  }
}

const globals = globalThis as typeof globalThis & { __asmitaWorkerKysely?: Kysely<WorkerDatabase> };

export function usesWorkerKysely() {
  return process.env.ASMITA_DATABASE_DRIVER === "pg";
}

export function getWorkerDb() {
  if (!usesWorkerKysely()) throw new Error("worker_database_not_enabled");
  globals.__asmitaWorkerKysely ??= new Kysely<WorkerDatabase>({
    dialect: new PostgresDialect({ pool: new HyperdriveClientPool() as never }),
  });
  return globals.__asmitaWorkerKysely;
}

export type { WorkerDatabase };
