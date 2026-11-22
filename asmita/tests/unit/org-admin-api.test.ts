import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdminPermission: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  inMemoryAuditLog: [],
}));

import { requireAdminPermission } from "@/lib/auth/require-admin";
import { writeAuditLog } from "@/lib/audit";
import { createCsrfPair } from "@/lib/csrf";
import { GET as LIST_POSTS, POST as CREATE_POST } from "@/app/api/admin/org/posts/route";
import { PATCH as PATCH_POST, DELETE as DELETE_POST } from "@/app/api/admin/org/posts/[id]/route";
import { GET as LIST_SUBMISSIONS } from "@/app/api/admin/org/submissions/route";
import { PATCH as PATCH_SUBMISSION, POST as NOTE_SUBMISSION } from "@/app/api/admin/org/submissions/[id]/route";
import { GET as EXPORT_SUBMISSIONS } from "@/app/api/admin/org/submissions/export/route";
import { GET as LIST_JOBS, POST as CREATE_JOB } from "@/app/api/admin/org/jobs/route";
import { PUT as PUT_JOB } from "@/app/api/admin/org/jobs/[id]/route";
import { POST as CREATE_EVENT } from "@/app/api/admin/org/events/route";
import { PUT as PUT_EVENT } from "@/app/api/admin/org/events/[id]/route";
import { GET as NEWSLETTER_COUNTS } from "@/app/api/admin/org/newsletter/route";
import { GET as NEWSLETTER_EXPORT } from "@/app/api/admin/org/newsletter/export/route";
import { orgPosts } from "@/lib/org-posts";
import { orgSubmissions, recordOrgSubmission } from "@/lib/org-submissions";
import { orgJobs } from "@/lib/org-jobs";
import { orgEvents, orgEventSchema } from "@/lib/org-events";
import { newsletterSubscribers, subscribeToNewsletter } from "@/lib/org-newsletter";

// The org admin APIs (docs/org/spec.md, section 0): admin auth plus the
// right permission, CSRF on mutations, Zod validation. Memory mode.

const csrf = () => {
  const { nonce, token } = createCsrfPair();
  return {
    method: "POST" as const,
    headers: { "content-type": "application/json", cookie: `asmita_csrf=${nonce}`, "x-csrf-token": token },
  };
};

/** Request-init properties with a valid CSRF pair; spread into new Request(). */
const csrfFor = (method: string) => {
  const { nonce, token } = createCsrfPair();
  return {
    method,
    headers: { "content-type": "application/json", cookie: `asmita_csrf=${nonce}`, "x-csrf-token": token },
  };
};

const noCsrf = (method: string) =>
  new Request("https://asmita.test", { method, headers: { "content-type": "application/json" }, body: "{}" });

function admin(ok: boolean, role = "SUPER_ADMIN") {
  vi.mocked(requireAdminPermission).mockResolvedValue(
    ok
      ? ({ ok: true as const, session: { sub: "admin-1", adminRole: role as never } } as never)
      : ({ ok: false as const, status: 403, error: "permission_denied" } as never),
  );
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const postInput = {
  kind: "NEWS",
  titleEn: "A new tool for survivors",
  summaryEn: "We shipped a small thing that helps.",
  bodyEn: "A paragraph about the change.",
  authorDisplayName: "Meri Asmita",
};

const jobInput = {
  title: "Community lead",
  team: "Outreach",
  location: "Remote, India",
  type: "FULL_TIME",
  descriptionMd: "You will build volunteer programmes.",
  applyEmail: "work@example.invalid",
};

const eventInput = {
  titleEn: "Campus session",
  startsAt: new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString(),
  mode: "ONLINE",
  descriptionMd: "A session for students.",
};

describe("org admin API auth and CSRF", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    admin(true);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    orgPosts.splice(0, orgPosts.length);
    orgSubmissions.splice(0, orgSubmissions.length);
    orgJobs.splice(0, orgJobs.length);
    orgEvents.splice(0, orgEvents.length);
    newsletterSubscribers.splice(0, newsletterSubscribers.length);
    vi.clearAllMocks();
  });

  it("refuses an admin without the right permission on every route", async () => {
    admin(false);
    expect((await LIST_POSTS(new Request("https://asmita.test"))).status).toBe(403);
    const { nonce, token } = createCsrfPair();
    expect(
      (
        await CREATE_POST(
          new Request("https://asmita.test", {
            method: "POST",
            headers: { "content-type": "application/json", cookie: `asmita_csrf=${nonce}`, "x-csrf-token": token },
            body: JSON.stringify(postInput),
          }),
        )
      ).status,
    ).toBe(403);
    expect((await LIST_SUBMISSIONS(new Request("https://asmita.test"))).status).toBe(403);
    expect((await EXPORT_SUBMISSIONS(new Request("https://asmita.test"))).status).toBe(403);
    expect((await LIST_JOBS(new Request("https://asmita.test"))).status).toBe(403);
    expect((await NEWSLETTER_COUNTS()).status).toBe(403);
  });

  it("refuses mutations without CSRF", async () => {
    expect((await CREATE_POST(noCsrf("POST"))).status).toBe(403);
    expect((await PATCH_POST(noCsrf("PATCH"), params("p1"))).status).toBe(403);
    expect((await DELETE_POST(noCsrf("DELETE"), params("p1"))).status).toBe(403);
    expect((await NOTE_SUBMISSION(noCsrf("POST"), params("s1"))).status).toBe(403);
  });

  it("refuses CSRF-missing requests even for an admin with the permission", async () => {
    const response = await PUT_JOB(noCsrf("PUT"), params("j1"));
    expect(response.status).toBe(403);
  });
});

describe("org admin posts API", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    admin(true);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    orgPosts.splice(0, orgPosts.length);
    vi.clearAllMocks();
  });

  it("creates, publishes and lists posts, auditing each action", async () => {
    const create = await CREATE_POST(
      new Request("https://asmita.test", {
        ...csrf(),
        body: JSON.stringify(postInput),
      }),
    );
    expect(create.status).toBe(201);
    const created = (await create.json()).post as { id: string; slug: string };
    expect(created.slug).toBe("a-new-tool-for-survivors");

    const publish = await PATCH_POST(
      new Request("https://asmita.test", { ...csrfFor("PATCH"), body: JSON.stringify({ action: "publish" }) }),
      params(created.id),
    );
    expect(publish.status).toBe(200);
    expect(((await publish.json()).post as { status: string }).status).toBe("PUBLISHED");

    const list = await LIST_POSTS(new Request("https://asmita.test/api/admin/org/posts?status=PUBLISHED"));
    expect((await list.json()).posts).toHaveLength(1);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "ORG_POST_PUBLISHED", entityId: created.id }),
    );
  });

  it("answers 409 case_study_checks_required from the publish gate", async () => {
    const create = await CREATE_POST(
      new Request("https://asmita.test", {
        ...csrf(),
        body: JSON.stringify({ ...postInput, kind: "CASE_STUDY", titleEn: "A story" }),
      }),
    );
    const created = (await create.json()).post as { id: string };
    const publish = await PATCH_POST(
      new Request("https://asmita.test", { ...csrfFor("PATCH"), body: JSON.stringify({ action: "publish" }) }),
      params(created.id),
    );
    expect(publish.status).toBe(409);
    expect(await publish.json()).toEqual({ error: "case_study_checks_required" });
  });

  it("refuses a duplicate slug with 409 and validates payloads with 400", async () => {
    const first = await CREATE_POST(
      new Request("https://asmita.test", { ...csrf(), body: JSON.stringify(postInput) }),
    );
    expect(first.status).toBe(201);
    const second = await CREATE_POST(
      new Request("https://asmita.test", {
        ...csrf(),
        body: JSON.stringify({ ...postInput, titleEn: "Another piece", slug: "a-new-tool-for-survivors" }),
      }),
    );
    expect(second.status).toBe(409);

    const bad = await CREATE_POST(
      new Request("https://asmita.test", { ...csrf(), body: JSON.stringify({ kind: "NOPE" }) }),
    );
    expect(bad.status).toBe(400);
  });

  it("deletes a draft but not a published post", async () => {
    const create = await CREATE_POST(
      new Request("https://asmita.test", { ...csrf(), body: JSON.stringify(postInput) }),
    );
    const created = (await create.json()).post as { id: string };
    const gone = await DELETE_POST(new Request("https://asmita.test", csrfFor("DELETE")), params(created.id));
    expect(gone.status).toBe(200);
    expect(orgPosts).toHaveLength(0);
  });
});

describe("org admin submissions API", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    admin(true);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    orgSubmissions.splice(0, orgSubmissions.length);
    vi.clearAllMocks();
  });

  it("lists, filters, notes and changes status; closing records closedAt", async () => {
    await recordOrgSubmission("VOLUNTEER", {
      name: "Test Volunteer",
      email: "v@example.invalid",
      city: "Pune",
      state: "Maharashtra",
      languages: ["Hindi"],
      roles: ["TRANSLATION"],
      hours: "UP_TO_2",
      experience: "I can help with translation work.",
      adult: true,
      consent: true,
    });
    const [saved] = orgSubmissions;

    const list = await LIST_SUBMISSIONS(new Request("https://asmita.test/api/admin/org/submissions?status=NEW"));
    const body = (await list.json()) as { submissions: { email: string }[] };
    expect(body.submissions).toHaveLength(1);
    expect(body.submissions[0].email).toBe("v@example.invalid");

    const note = await NOTE_SUBMISSION(
      new Request("https://asmita.test", { ...csrfFor("POST"), body: JSON.stringify({ note: "Called; keen." }) }),
      params(saved.id),
    );
    expect(note.status).toBe(200);
    const notes = ((await note.json()) as { notes: string }).notes;
    expect(notes).toContain("Called; keen.");

    const close = await PATCH_SUBMISSION(
      new Request("https://asmita.test", { ...csrfFor("PATCH"), body: JSON.stringify({ status: "CLOSED" }) }),
      params(saved.id),
    );
    expect(close.status).toBe(200);
    expect(saved.status).toBe("CLOSED");
    expect(saved.closedAt).toBeTruthy();
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "ORG_SUBMISSION_STATUS_CHANGED", data: { status: "CLOSED" } }),
    );

    const filtered = await LIST_SUBMISSIONS(new Request("https://asmita.test/api/admin/org/submissions?status=NEW"));
    expect(((await filtered.json()) as { submissions: unknown[] }).submissions).toHaveLength(0);
  });

  it("exports the filtered list as CSV with a header, audit-logged", async () => {
    await recordOrgSubmission("VOLUNTEER", {
      name: "Test Volunteer",
      email: "v@example.invalid",
      city: "Pune",
      state: "Maharashtra",
      languages: ["Hindi"],
      roles: ["TRANSLATION"],
      hours: "UP_TO_2",
      experience: "I can help with translation work.",
      adult: true,
      consent: true,
    });
    const response = await EXPORT_SUBMISSIONS(new Request("https://asmita.test/api/admin/org/submissions/export?kind=VOLUNTEER"));
    expect(response.status).toBe(200);
    const csv = await response.text();
    expect(csv).toContain("id,kind,status,createdAt,closedAt,contact,email,city,state");
    expect(csv).toContain("Test Volunteer");
    expect(csv).toContain("v@example.invalid");
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "ORG_SUBMISSION_EXPORTED", data: expect.objectContaining({ kind: "VOLUNTEER" }) }),
    );
  });
});

describe("org admin jobs and events APIs", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    admin(true);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    orgJobs.splice(0, orgJobs.length);
    orgEvents.splice(0, orgEvents.length);
    vi.clearAllMocks();
  });

  it("creates a job, opens and closes it", async () => {
    const create = await CREATE_JOB(
      new Request("https://asmita.test", { ...csrf(), body: JSON.stringify(jobInput) }),
    );
    expect(create.status).toBe(201);
    const created = (await create.json()).job as { id: string; slug: string };
    expect(created.slug).toBe("community-lead");

    const open = await PUT_JOB(
      new Request("https://asmita.test", { ...csrfFor("PUT"), body: JSON.stringify({ status: "OPEN" }) }),
      params(created.id),
    );
    expect(((await open.json()).job as { status: string }).status).toBe("OPEN");
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "ORG_JOB_STATUS_CHANGED", data: expect.objectContaining({ status: "OPEN" }) }),
    );

    const close = await PUT_JOB(
      new Request("https://asmita.test", { ...csrfFor("PUT"), body: JSON.stringify({ status: "CLOSED" }) }),
      params(created.id),
    );
    expect(((await close.json()).job as { status: string }).status).toBe("CLOSED");
  });

  it("creates an event, publishes and cancels it", async () => {
    const create = await CREATE_EVENT(
      new Request("https://asmita.test", { ...csrf(), body: JSON.stringify(eventInput) }),
    );
    expect(create.status).toBe(201);
    const created = (await create.json()).event as { id: string };

    const publish = await PUT_EVENT(
      new Request("https://asmita.test", { ...csrfFor("PUT"), body: JSON.stringify({ status: "PUBLISHED" }) }),
      params(created.id),
    );
    expect(((await publish.json()).event as { status: string }).status).toBe("PUBLISHED");

    const cancel = await PUT_EVENT(
      new Request("https://asmita.test", { ...csrfFor("PUT"), body: JSON.stringify({ status: "CANCELLED" }) }),
      params(created.id),
    );
    expect(((await cancel.json()).event as { status: string }).status).toBe("CANCELLED");
  });

  it("refuses an event that ends before it starts", async () => {
    const parsed = orgEventSchema.safeParse({
      ...eventInput,
      endsAt: new Date(Date.now() + 10 * 24 * 60 * 60_000).toISOString(),
    });
    expect(parsed.success).toBe(false);
  });
});

describe("org admin newsletter API", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    admin(true);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    newsletterSubscribers.splice(0, newsletterSubscribers.length);
    vi.clearAllMocks();
  });

  it("counts by status and exports only confirmed subscribers", async () => {
    await subscribeToNewsletter({ email: "pending@example.invalid", locale: "en", source: "t" });
    const confirmed = await subscribeToNewsletter({ email: "confirmed@example.invalid", locale: "hi", source: "t" });
    const { confirmNewsletterSubscriber } = await import("@/lib/org-newsletter");
    await confirmNewsletterSubscriber(confirmed.confirmToken!);

    const counts = await NEWSLETTER_COUNTS();
    expect(((await counts.json()) as { counts: unknown }).counts).toEqual({
      pending: 1,
      confirmed: 1,
      unsubscribed: 0,
      total: 2,
    });

    const exported = await NEWSLETTER_EXPORT();
    const csv = await exported.text();
    expect(csv).toContain("email,locale,confirmedAt");
    expect(csv).toContain("confirmed@example.invalid,hi");
    expect(csv).not.toContain("pending@example.invalid");
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "ORG_NEWSLETTER_EXPORTED", data: { count: 1 } }),
    );
  });
});
