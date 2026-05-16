import { expect, test } from "@playwright/test";
import { SignJWT } from "jose";
import { hasAdminPermission, type AdminPermission, type AdminRole } from "@/lib/auth/admin-permissions";

async function signCookie(payload: Record<string, unknown>, sub: string) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret-change-before-prod-32chars"));
}

test("admin routes reject anonymous and victim sessions", async ({ page, context }) => {
  await page.goto("/admin/cases");
  await expect(page.getByText("Restricted workspace")).toBeVisible();

  const victimToken = await signCookie(
    { role: "VICTIM", ageOver18: true, emailHash: "victim-hash", namespace: "victim" },
    "victim-1",
  );
  await context.addCookies([
    {
      name: "asmita_admin_session",
      value: victimToken,
      domain: "127.0.0.1",
      path: "/admin",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto("/admin/cases");
  await expect(page.getByText("Restricted workspace")).toBeVisible();
});

test("admin session can open operational admin routes", async ({ page, context }) => {
  test.setTimeout(60_000);
  const adminToken = await signCookie(
    { role: "ADMIN", ageOver18: true, emailHash: "admin-hash", namespace: "admin" },
    "admin-1",
  );
  await context.addCookies([
    {
      name: "asmita_admin_session",
      value: adminToken,
      domain: "127.0.0.1",
      path: "/admin",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  const routes = [
    ["/admin/cases", "Cases"],
    ["/admin/queue", "Flagged review queue"],
    ["/admin/platforms", "Platform database"],
    ["/admin/templates", "Notice templates"],
    ["/admin/metrics", "Platform response rates"],
    ["/admin/analytics", "Analytics dashboard"],
    ["/admin/milestones", "100-case milestone"],
    ["/admin/audit", "Audit log"],
  ] as const;

  for (const [route, heading] of routes) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
});

test("admin role permissions allow and deny expected actions", () => {
  const expectations: Array<[AdminRole, AdminPermission, boolean]> = [
    ["SUPER_ADMIN", "users:manage", true],
    ["LEGAL_ADVISOR", "templates:activate", true],
    ["LEGAL_ADVISOR", "platforms:edit", false],
    ["CASE_REVIEWER", "cases:review", true],
    ["CASE_REVIEWER", "templates:activate", false],
    ["GO_EDITOR", "platforms:edit", true],
    ["GO_EDITOR", "cases:review", false],
    ["SUPPORT_AGENT", "cases:note", true],
    ["SUPPORT_AGENT", "audit:read", false],
  ];

  for (const [role, permission, allowed] of expectations) {
    expect(hasAdminPermission(role, permission)).toBe(allowed);
  }
});
