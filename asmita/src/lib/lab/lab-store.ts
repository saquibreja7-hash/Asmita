/*
 * In-memory Lab state for local development and tests without a database,
 * the Lab's twin of crawl-store.ts. Never used in production: every lab
 * module selects the database path whenever DATABASE_URL is set, and this
 * helper refuses to run under NODE_ENV=production.
 *
 * The Lab tracks services that make 'undress' or face-swap images
 * (docs/lab/charter.md, E2). Real names and URLs live in this store only
 * at dev/test time, and tests seed invented data (example.test hosts).
 */

export const LAB_SERVICE_KINDS = ["APP", "WEBSITE", "CHAT_BOT", "CHANNEL", "SOCIAL_ACCOUNT"] as const;
export type LabServiceKind = (typeof LAB_SERVICE_KINDS)[number];

export const LAB_SERVICE_STATUSES = ["ACTIVE", "DOWN", "UNKNOWN"] as const;
export type LabServiceStatus = (typeof LAB_SERVICE_STATUSES)[number];

export const LAB_CHOKEPOINT_KINDS = [
  "HOST",
  "CDN",
  "REGISTRAR",
  "PAYMENT_PROCESSOR",
  "APP_STORE",
  "AD_NETWORK",
  "PLATFORM_ACCOUNT",
] as const;
export type LabChokepointKind = (typeof LAB_CHOKEPOINT_KINDS)[number];

export const LAB_REPORT_CHANNELS = ["EMAIL", "WEB_FORM"] as const;
export type LabReportChannel = (typeof LAB_REPORT_CHANNELS)[number];

export const LAB_REPORT_STATUSES = ["DRAFT", "SENT"] as const;
export type LabReportStatus = (typeof LAB_REPORT_STATUSES)[number];

export const LAB_REPORT_OUTCOMES = ["ACTIONED", "REFUSED", "NO_REPLY"] as const;
export type LabReportOutcome = (typeof LAB_REPORT_OUTCOMES)[number];

// WP114 (research-tools-spec.md): the infrastructure registry.
export const LAB_INFRA_CATEGORIES = [
  "HOSTING_ASN",
  "CDN",
  "REGISTRAR",
  "NAMESERVER",
  "MAIL",
  "TLS_ISSUER",
  "PAYMENT",
  "CRYPTO_ADDRESS",
  "AUTH_SSO",
  "ANALYTICS_ID",
  "ADS",
  "APP_STORE_LINK",
  "TELEGRAM_LINK",
  "SOCIAL_LINK",
  "REFERRAL_LINK",
  "MODEL_REPO_LINK",
] as const;
export type LabInfraCategory = (typeof LAB_INFRA_CATEGORIES)[number];

export const LAB_INFRA_CONFIDENCES = ["HIGH", "MEDIUM", "LOW"] as const;
export type LabInfraConfidence = (typeof LAB_INFRA_CONFIDENCES)[number];

export const LAB_SERVICE_LINK_REASONS = [
  "SHARED_ANALYTICS_ID",
  "SHARED_IP",
  "SHARED_NAMESERVER_SET",
  "SHARED_CRYPTO_ADDRESS",
  "SHARED_TLS_SAN",
  "ANALYST",
] as const;
export type LabServiceLinkReason = (typeof LAB_SERVICE_LINK_REASONS)[number];

/** The latest liveness result for one service URL (JSON in the database). */
export type LabUrlStatus = { url: string; up: boolean; checkedAt: string };

export type MemoryLabService = {
  id: string;
  name: string;
  kind: LabServiceKind;
  urls: string[];
  status: LabServiceStatus;
  urlStatuses: LabUrlStatus[] | null;
  downSince: Date | null;
  firstSeenAt: Date;
  lastCheckedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MemoryLabChokepoint = {
  id: string;
  serviceId: string;
  kind: LabChokepointKind;
  provider: string;
  abuseContact: string;
  evidenceNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MemoryLabReport = {
  id: string;
  chokepointId: string;
  templateKind: LabChokepointKind;
  channel: LabReportChannel | null;
  subject: string;
  body: string;
  status: LabReportStatus;
  toAddress: string | null;
  sentAt: Date | null;
  sentById: string | null;
  providerReference: string | null;
  outcome: LabReportOutcome | null;
  outcomeAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

// WP114: the provider directory, infrastructure scans, normalised findings
// and service links (research-tools-spec.md). Real names and URLs live in
// the database only; tests seed invented data.
export type MemoryLabProvider = {
  id: string;
  name: string;
  kind: LabChokepointKind;
  website: string;
  abusePageUrl: string | null;
  abuseEmail: string | null;
  policyUrl: string | null;
  notes: string | null;
  verifiedById: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MemoryLabInfraScan = {
  id: string;
  serviceId: string;
  url: string;
  finalUrl: string | null;
  httpStatus: number | null;
  scannedAt: Date;
  signatureVersion: string;
  error: string | null;
};

export type MemoryLabInfraFinding = {
  id: string;
  scanId: string;
  serviceId: string;
  category: LabInfraCategory;
  providerId: string | null;
  value: string;
  evidence: string;
  confidence: LabInfraConfidence;
  firstSeenAt: Date;
  lastSeenAt: Date;
  active: boolean;
};

export type MemoryLabServiceLink = {
  id: string;
  serviceAId: string;
  serviceBId: string;
  reason: LabServiceLinkReason;
  value: string;
  createdAt: Date;
};

type LabMemory = {
  services: Map<string, MemoryLabService>;
  chokepoints: Map<string, MemoryLabChokepoint>;
  reports: Map<string, MemoryLabReport>;
  providers: Map<string, MemoryLabProvider>;
  infraScans: Map<string, MemoryLabInfraScan>;
  infraFindings: Map<string, MemoryLabInfraFinding>;
  serviceLinks: Map<string, MemoryLabServiceLink>;
};

const globals = globalThis as typeof globalThis & { __asmitaLabStore?: LabMemory };

function emptyMemory(): LabMemory {
  return {
    services: new Map(),
    chokepoints: new Map(),
    reports: new Map(),
    providers: new Map(),
    infraScans: new Map(),
    infraFindings: new Map(),
    serviceLinks: new Map(),
  };
}

export function labMemory(): LabMemory {
  if (process.env.NODE_ENV === "production") {
    throw new Error("[lab-store.ts] In-memory Lab state cannot be used in production.");
  }
  globals.__asmitaLabStore ??= emptyMemory();
  return globals.__asmitaLabStore;
}

export function resetLabMemory() {
  globals.__asmitaLabStore = emptyMemory();
}

/** Normalizes a database date (Date or ISO string) to an ISO string, as every lab view carries. */
export function isoDate(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
