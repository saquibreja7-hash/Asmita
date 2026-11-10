import type { Browser } from "@playwright/test";
import { createHash } from "node:crypto";
import { SignJWT } from "jose";

export const baseURL = "http://127.0.0.1:3001";

// Synthetic admin identities the specs sign sessions for. The server checks
// every admin session against ADMIN_EMAILS and ADMIN_ROLES by email hash, so
// playwright.config.ts lists these emails; global-setup enrols each hash,
// since MFA is enforced in E2E as in production.
export const testAdminEmail = (sub: string) => `${sub}@example.invalid`;
export const testAdminHash = (sub: string) => createHash("sha256").update(testAdminEmail(sub)).digest("hex");
const testAdmins = ["e2e-admin", "integrity-admin", "admin-1"];
export const enrolledTestAdmins = testAdmins.map(testAdminHash);
// e2e-new-admin enrols through the real flow in admin-access.spec.ts.
export const testAdminEmails = [...testAdmins, "e2e-new-admin"].map(testAdminEmail);

// A signed admin session, as /api/admin/auth/verify would issue it.
export function signAdminToken(sub = "e2e-admin") {
  return new SignJWT({
    role: "ADMIN", adminRole: "SUPER_ADMIN", ageOver18: true, emailHash: testAdminHash(sub), namespace: "admin", mfaComplete: true,
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
export async function adminContext(browser: Browser, sub?: string) {
  const context = await browser.newContext({ baseURL });
  await context.addCookies([
    { name: "asmita_admin_session", value: await signAdminToken(sub), domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" },
  ]);
  return context;
}
