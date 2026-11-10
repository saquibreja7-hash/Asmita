import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth/jwt";
import { getSessionUserStatus } from "@/lib/case-ops";

export async function requireSession(options?: { adultOnly?: boolean }) {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get("asmita_session")?.value);
  if (!session || session.namespace !== "victim" || session.role === "ADMIN") {
    return { ok: false as const, status: 401, error: "unauthorized" };
  }
  // The token outlives the account: once the survivor asks for deletion, or
  // the account is erased, every session already issued stops working.
  const status = await getSessionUserStatus(session.sub);
  if (status === "gone") {
    return { ok: false as const, status: 401, error: "unauthorized" };
  }
  if (status === "deactivated") {
    return { ok: false as const, status: 401, error: "account_deactivated" };
  }
  if (options?.adultOnly && !session.ageOver18) {
    return { ok: false as const, status: 403, error: "minor_pathway_required" };
  }
  return { ok: true as const, session };
}
