import { SignJWT, jwtVerify } from "jose";

export type SessionClaims = {
  sub: string;
  role: "VICTIM" | "SUPPORTER" | "NGO_WORKER" | "ADMIN";
  ageOver18: boolean;
  emailHash: string;
  namespace?: "victim" | "admin";
};

function getSecret() {
  return new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret-change-before-prod-32chars");
}

export async function signSession(claims: SessionClaims) {
  return new SignJWT({
    role: claims.role,
    ageOver18: claims.ageOver18,
    emailHash: claims.emailHash,
    namespace: claims.namespace || "victim",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime("4h")
    .sign(getSecret());
}

export async function signAdminSession(claims: Omit<SessionClaims, "role" | "ageOver18" | "namespace">) {
  return new SignJWT({
    role: "ADMIN",
    ageOver18: true,
    emailHash: claims.emailHash,
    namespace: "admin",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(getSecret());
}

export async function verifySession(token: string | undefined | null) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      sub: payload.sub || "",
      role: payload.role as SessionClaims["role"],
      ageOver18: Boolean(payload.ageOver18),
      emailHash: String(payload.emailHash || ""),
      namespace: (payload.namespace as SessionClaims["namespace"]) || "victim",
    };
  } catch {
    return null;
  }
}

export async function verifyAdminSession(token: string | undefined | null) {
  const session = await verifySession(token);
  if (!session || session.role !== "ADMIN" || session.namespace !== "admin") return null;
  return session;
}
