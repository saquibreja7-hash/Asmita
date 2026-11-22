import { randomUUID } from "node:crypto";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { slugifyOrgTitle } from "@/lib/org-posts";

/*
 * Job openings (docs/org/spec.md, WP56). People apply by email; no CVs and
 * no applications are stored. Memory fallback like the partner sign-up.
 */

export const ORG_JOB_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP", "FELLOWSHIP"] as const;
export type OrgJobType = (typeof ORG_JOB_TYPES)[number];

export const ORG_JOB_STATUSES = ["DRAFT", "OPEN", "CLOSED"] as const;
export type OrgJobStatus = (typeof ORG_JOB_STATUSES)[number];

const MAX_MEMORY_JOBS = 100;

export type OrgJob = {
  id: string;
  slug: string;
  title: string;
  team: string;
  location: string;
  type: OrgJobType;
  descriptionMd: string;
  applyEmail: string;
  applyInstructions: string | null;
  status: OrgJobStatus;
  closesAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

export const orgJobSchema = z
  .object({
    slug: text(2, 80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug_format").optional(),
    title: text(2, 120),
    team: text(2, 80),
    location: text(2, 120).default("Remote, India"),
    type: z.enum(ORG_JOB_TYPES),
    descriptionMd: z.string().trim().min(1).max(20_000),
    applyEmail: z.string().trim().toLowerCase().max(254).email(),
    applyInstructions: text(1, 1000).optional(),
    closesAt: z.string().datetime().optional(),
  })
  .strict();

function devNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

/** Local development and tests without a database keep jobs here, capped. */
export const orgJobs: OrgJob[] = [];

function remember(job: OrgJob) {
  orgJobs.push(job);
  if (orgJobs.length > MAX_MEMORY_JOBS) {
    orgJobs.splice(0, orgJobs.length - MAX_MEMORY_JOBS);
  }
}

function rowToJob(row: Record<string, unknown>): OrgJob {
  return {
    id: row.id as string,
    slug: row.slug as string,
    title: row.title as string,
    team: row.team as string,
    location: row.location as string,
    type: row.type as OrgJobType,
    descriptionMd: row.descriptionMd as string,
    applyEmail: row.applyEmail as string,
    applyInstructions: (row.applyInstructions as string | null) ?? null,
    status: row.status as OrgJobStatus,
    closesAt: row.closesAt ? new Date(row.closesAt as string).toISOString() : null,
    createdAt: new Date(row.createdAt as string).toISOString(),
    updatedAt: new Date(row.updatedAt as string).toISOString(),
  };
}

async function slugTaken(slug: string, exceptId?: string): Promise<boolean> {
  if (devNoDb()) return orgJobs.some((job) => job.slug === slug && job.id !== exceptId);
  const { db } = await import("@/lib/db");
  const existing = await db.orgJob.findFirst({ where: { slug }, select: { id: true } });
  return Boolean(existing && existing.id !== exceptId);
}

export async function createOrgJob(
  input: z.infer<typeof orgJobSchema>,
  actorId: string,
): Promise<{ ok: true; job: OrgJob } | { ok: false; error: "slug_taken" }> {
  const slug = input.slug ?? slugifyOrgTitle(input.title);
  if (await slugTaken(slug)) return { ok: false, error: "slug_taken" };
  const now = new Date().toISOString();
  let job: OrgJob;
  if (devNoDb()) {
    job = {
      id: randomUUID(),
      slug,
      title: input.title,
      team: input.team,
      location: input.location,
      type: input.type,
      descriptionMd: input.descriptionMd,
      applyEmail: input.applyEmail,
      applyInstructions: input.applyInstructions ?? null,
      status: "DRAFT",
      closesAt: input.closesAt ?? null,
      createdAt: now,
      updatedAt: now,
    };
    remember(job);
  } else {
    const { db } = await import("@/lib/db");
    try {
      job = rowToJob(
        await db.orgJob.create({
          data: {
            slug,
            title: input.title,
            team: input.team,
            location: input.location,
            type: input.type,
            descriptionMd: input.descriptionMd,
            applyEmail: input.applyEmail,
            applyInstructions: input.applyInstructions ?? null,
            closesAt: input.closesAt ? new Date(input.closesAt) : null,
          },
        }),
      );
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") return { ok: false, error: "slug_taken" };
      throw err;
    }
  }
  await writeAuditLog({
    eventType: "ORG_JOB_SAVED",
    entityType: "OrgJob",
    entityId: job.id,
    actorId,
    data: { action: "created", slug: job.slug, title: job.title },
  });
  return { ok: true, job };
}

export async function updateOrgJob(
  id: string,
  input: z.infer<typeof orgJobSchema>,
  actorId: string,
): Promise<{ ok: true; job: OrgJob } | { ok: false; error: "job_not_found" | "slug_taken" }> {
  const slug = input.slug ?? slugifyOrgTitle(input.title);
  if (await slugTaken(slug, id)) return { ok: false, error: "slug_taken" };
  const fields = {
    slug,
    title: input.title,
    team: input.team,
    location: input.location,
    type: input.type,
    descriptionMd: input.descriptionMd,
    applyEmail: input.applyEmail,
    applyInstructions: input.applyInstructions ?? null,
    closesAt: input.closesAt ? new Date(input.closesAt) : null,
  };
  let job: OrgJob;
  if (devNoDb()) {
    const current = orgJobs.find((entry) => entry.id === id);
    if (!current) return { ok: false, error: "job_not_found" };
    Object.assign(current, fields, { updatedAt: new Date().toISOString() });
    job = current;
  } else {
    const { db } = await import("@/lib/db");
    try {
      job = rowToJob(await db.orgJob.update({ where: { id }, data: fields }));
    } catch (err) {
      if ((err as { code?: string }).code === "P2025") return { ok: false, error: "job_not_found" };
      if ((err as { code?: string }).code === "P2002") return { ok: false, error: "slug_taken" };
      throw err;
    }
  }
  await writeAuditLog({
    eventType: "ORG_JOB_SAVED",
    entityType: "OrgJob",
    entityId: id,
    actorId,
    data: { action: "updated", slug: job.slug, title: job.title },
  });
  return { ok: true, job };
}

export async function setOrgJobStatus(
  id: string,
  status: OrgJobStatus,
  actorId: string,
): Promise<{ ok: true; job: OrgJob } | { ok: false; error: "job_not_found" }> {
  let job: OrgJob;
  if (devNoDb()) {
    const current = orgJobs.find((entry) => entry.id === id);
    if (!current) return { ok: false, error: "job_not_found" };
    current.status = status;
    current.updatedAt = new Date().toISOString();
    job = current;
  } else {
    const { db } = await import("@/lib/db");
    try {
      job = rowToJob(await db.orgJob.update({ where: { id }, data: { status } }));
    } catch (err) {
      if ((err as { code?: string }).code === "P2025") return { ok: false, error: "job_not_found" };
      throw err;
    }
  }
  await writeAuditLog({
    eventType: "ORG_JOB_STATUS_CHANGED",
    entityType: "OrgJob",
    entityId: id,
    actorId,
    data: { status, slug: job.slug },
  });
  return { ok: true, job };
}

export async function listOpenOrgJobs(): Promise<OrgJob[]> {
  return listOrgJobsForAdmin({ status: "OPEN" });
}

export async function getOrgJobBySlug(slug: string): Promise<OrgJob | null> {
  if (devNoDb()) return orgJobs.find((job) => job.slug === slug) ?? null;
  const { db } = await import("@/lib/db");
  const row = await db.orgJob.findUnique({ where: { slug } });
  return row ? rowToJob(row) : null;
}

export async function listOrgJobsForAdmin(options: { status?: OrgJobStatus } = {}): Promise<OrgJob[]> {
  if (devNoDb()) {
    return orgJobs
      .filter((job) => !options.status || job.status === options.status)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  const { db } = await import("@/lib/db");
  const rows = await db.orgJob.findMany({
    where: options.status ? { status: options.status } : {},
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(rowToJob);
}
