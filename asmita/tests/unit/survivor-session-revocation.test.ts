import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Synthetic placeholders only; no real survivor data.
const fake = vi.hoisted(() => ({
  cookie: "",
  kysely: false,
  row: null as { emailHash: string; deactivatedAt: Date | null } | null,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "asmita_session" ? { value: fake.cookie } : undefined) }),
}));
vi.mock("@/lib/db", () => ({
  db: { user: { findUnique: vi.fn(async () => fake.row) } },
}));
vi.mock("@/lib/worker-kysely", () => {
  const query = {
    select: () => query,
    where: () => query,
    executeTakeFirst: async () => fake.row ?? undefined,
  };
  return {
    usesWorkerKysely: () => fake.kysely,
    getWorkerDb: () => ({ selectFrom: () => query }),
  };
});

import { signSession } from "@/lib/auth/jwt";
import { requireSession } from "@/lib/auth/middleware";
import { deactivateUser, hardDeleteDueUsers, upsertVerifiedUser } from "@/lib/case-ops";
import { createCsrfPair } from "@/lib/csrf";
import { POST as deleteAccount } from "@/app/api/account/delete/route";

const original = { DATABASE_URL: process.env.DATABASE_URL };

async function sessionFor(sub: string) {
  fake.cookie = await signSession({ sub, role: "VICTIM", ageOver18: true, emailHash: "synthetic-hash" });
}

afterEach(() => {
  fake.kysely = false;
  fake.row = null;
  if (original.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = original.DATABASE_URL;
});

describe("requireSession on the memory store", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
  });

  it("accepts an active survivor, then refuses the same token once deletion is requested", async () => {
    const user = await upsertVerifiedUser("survivor-a@example.invalid", true);
    await sessionFor(user.id);
    await expect(requireSession({ adultOnly: true })).resolves.toMatchObject({ ok: true, session: { sub: user.id } });

    // The deletion request itself goes through, and answers with its schedule.
    const csrf = createCsrfPair();
    const response = await deleteAccount(new Request("https://asmita.test/api/account/delete", {
      method: "POST", headers: { cookie: `asmita_csrf=${csrf.nonce}`, "x-csrf-token": csrf.token },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, hardDeleteAfter: expect.any(String) });

    await expect(requireSession()).resolves.toEqual({ ok: false, status: 401, error: "account_deactivated" });
  });

  it("refuses a session after the account is hard-deleted", async () => {
    const user = await upsertVerifiedUser("survivor-b@example.invalid", true);
    await sessionFor(user.id);
    await deactivateUser(user.id);
    await hardDeleteDueUsers(new Date(Date.now() + 31 * 24 * 60 * 60 * 1000));
    await expect(requireSession()).resolves.toEqual({ ok: false, status: 401, error: "unauthorized" });
  });

  it("refuses a validly signed session for an account that never existed", async () => {
    await sessionFor("no-such-user");
    await expect(requireSession()).resolves.toEqual({ ok: false, status: 401, error: "unauthorized" });
  });
});

describe.each([
  ["Prisma (Node)", false],
  ["Kysely (Worker)", true],
])("requireSession on %s", (_label, kysely) => {
  beforeEach(async () => {
    process.env.DATABASE_URL = "postgresql://placeholder.invalid/asmita";
    fake.kysely = kysely;
    await sessionFor("user-synthetic");
  });

  it("accepts an active account", async () => {
    fake.row = { emailHash: "synthetic-hash", deactivatedAt: null };
    await expect(requireSession()).resolves.toMatchObject({ ok: true });
  });

  it("refuses a deactivated account", async () => {
    fake.row = { emailHash: "synthetic-hash", deactivatedAt: new Date() };
    await expect(requireSession()).resolves.toMatchObject({ ok: false, error: "account_deactivated" });
  });

  it("refuses a hard-deleted (tombstoned) account", async () => {
    fake.row = { emailHash: "deleted:user-synthetic", deactivatedAt: null };
    await expect(requireSession()).resolves.toMatchObject({ ok: false, error: "unauthorized" });
  });

  it("refuses a missing account", async () => {
    fake.row = null;
    await expect(requireSession()).resolves.toMatchObject({ ok: false, error: "unauthorized" });
  });
});
