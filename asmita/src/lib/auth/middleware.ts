import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth/jwt";

export async function requireSession(options?: { adultOnly?: boolean }) {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get("asmita_session")?.value);
  if (!session) {
    return { ok: false as const, status: 401, error: "unauthorized" };
  }
  if (options?.adultOnly && !session.ageOver18) {
    return { ok: false as const, status: 403, error: "minor_pathway_required" };
  }
  return { ok: true as const, session };
}
