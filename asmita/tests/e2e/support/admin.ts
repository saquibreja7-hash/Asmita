import type { Browser } from "@playwright/test";
import { SignJWT } from "jose";

export const baseURL = "http://127.0.0.1:3001";

// A signed admin session, as /api/admin/auth/verify would issue it.
export function signAdminToken(sub = "e2e-admin") {
  return new SignJWT({
    role: "ADMIN", adminRole: "SUPER_ADMIN", ageOver18: true, emailHash: sub, namespace: "admin", mfaComplete: true,
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
