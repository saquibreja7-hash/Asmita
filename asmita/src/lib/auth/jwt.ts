import { SignJWT, jwtVerify } from "jose";
import type { AdminRole } from "@/lib/auth/admin-permissions";

export type SessionClaims = {
  sub: string;
  role: "VICTIM" | "SUPPORTER" | "NGO_WORKER" | "ADMIN";
  ageOver18: boolean;
  emailHash: string;
  namespace?: "victim" | "admin";
  adminRole?: AdminRole;
  mfaComplete?: boolean;
  /**
   * WP144 step-up MFA: when the admin last proved their authenticator (the
   * sign-in, the enrolment confirmation or POST /api/admin/mfa/step-up),
   * as epoch seconds. Absent on tokens minted before WP144, which read as
   * "not fresh" for the actions that need it.
   */
  mfaAt?: number;
};

const ISSUER = "asmita";
const AUDIENCE = "asmita-web";

function getSecret() {
  const configured = process.env.JWT_SECRET;
  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET is required in production.");
    }
    return new TextEncoder().encode("dev-secret-change-before-prod-32chars");
  }
  if (configured.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters.");
  }
  return new TextEncoder().encode(configured);
}

export async function signSession(claims: SessionClaims) {
  return new SignJWT({
    role: claims.role,
    ageOver18: claims.ageOver18,
    emailHash: claims.emailHash,
    namespace: claims.namespace || "victim",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime("4h")
    .sign(getSecret());
}

export async function signAdminSession(
  claims: Omit<SessionClaims, "role" | "ageOver18" | "namespace"> & { adminRole: AdminRole; mfaComplete: boolean },
) {
  return new SignJWT({
    role: "ADMIN",
    ageOver18: true,
    emailHash: claims.emailHash,
    namespace: "admin",
    adminRole: claims.adminRole,
    mfaComplete: claims.mfaComplete,
    ...(claims.mfaAt !== undefined ? { mfaAt: claims.mfaAt } : {}),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(claims.mfaComplete ? "8h" : "10m")
    .sign(getSecret());
}

export async function verifySession(token: string | undefined | null): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return {
      sub: payload.sub || "",
      role: payload.role as SessionClaims["role"],
      ageOver18: Boolean(payload.ageOver18),
      emailHash: String(payload.emailHash || ""),
      namespace: (payload.namespace as SessionClaims["namespace"]) || "victim",
      adminRole: payload.adminRole as SessionClaims["adminRole"],
      mfaComplete: payload.mfaComplete === true,
      mfaAt: typeof payload.mfaAt === "number" ? payload.mfaAt : undefined,
    };
  } catch {
    return null;
  }
}

export async function verifyAdminSession(token: string | undefined | null): Promise<SessionClaims | null> {
  const session = await verifySession(token);
  if (!session || session.role !== "ADMIN" || session.namespace !== "admin") return null;
  return session;
}
