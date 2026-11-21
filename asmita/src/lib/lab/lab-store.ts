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

type LabMemory = {
  services: Map<string, MemoryLabService>;
  chokepoints: Map<string, MemoryLabChokepoint>;
  reports: Map<string, MemoryLabReport>;
};

const globals = globalThis as typeof globalThis & { __asmitaLabStore?: LabMemory };

function emptyMemory(): LabMemory {
  return { services: new Map(), chokepoints: new Map(), reports: new Map() };
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
