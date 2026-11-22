import type { Browser } from "@playwright/test";
import { createHash } from "node:crypto";
import { SignJWT } from "jose";

export const baseURL = "http://127.0.0.1:3001";

// Synthetic admin identities the specs sign sessions for. The server checks
// every admin session against ADMIN_EMAILS and ADMIN_ROLES by email hash, so
// playwright.config.ts lists these emails; global-setup enrols each hash,
// since MFA is enforced in E2E as in production. Every admin is a
// SUPER_ADMIN except "e2e-reviewer", a CASE_REVIEWER the review-console spec
// (WP141) uses to prove the protected minor-hold queue stays invisible to it.
type TestAdmin = { sub: string; role: "SUPER_ADMIN" | "CASE_REVIEWER" };

const testAdmins: TestAdmin[] = [
  { sub: "e2e-admin", role: "SUPER_ADMIN" },
  { sub: "integrity-admin", role: "SUPER_ADMIN" },
  { sub: "admin-1", role: "SUPER_ADMIN" },
  { sub: "e2e-reviewer", role: "CASE_REVIEWER" },
];
// e2e-new-admin enrols through the real flow in admin-access.spec.ts.
const enrolledByFlow = ["e2e-new-admin"];

export const testAdminEmail = (sub: string) => `${sub}@example.invalid`;
export const testAdminHash = (sub: string) => createHash("sha256").update(testAdminEmail(sub)).digest("hex");
export const enrolledTestAdmins = testAdmins.map((admin) => testAdminHash(admin.sub));
export const allAdmins: TestAdmin[] = [
  ...testAdmins,
  ...enrolledByFlow.map((sub) => ({ sub, role: "SUPER_ADMIN" } as const)),
];
export const testAdminEmails = allAdmins.map((admin) => testAdminEmail(admin.sub));
export const testAdminRoles = allAdmins.map((admin) => `${testAdminEmail(admin.sub)}=${admin.role}`);

// A signed admin session, as /api/admin/auth/verify would issue it.
export function signAdminToken(sub = "e2e-admin", role: "SUPER_ADMIN" | "CASE_REVIEWER" = "SUPER_ADMIN") {
  return new SignJWT({
    role: "ADMIN", adminRole: role, ageOver18: true, emailHash: testAdminHash(sub), namespace: "admin", mfaComplete: true,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("asmita")
    .setAudience("asmita-web")
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode("e2e-test-only-jwt-secret-32-chars-long"));
}

// A separate browser context signed in as an admin.
export async function adminContext(browser: Browser, sub?: string, role?: "SUPER_ADMIN" | "CASE_REVIEWER") {
  const context = await browser.newContext({ baseURL });
  await context.addCookies([
    { name: "asmita_admin_session", value: await signAdminToken(sub, role), domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" },
  ]);
  return context;
}
