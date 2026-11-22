import { z } from "zod";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { noStore, refuseLabMutation } from "@/lib/lab/lab-route";
import { reviewServiceLink } from "@/lib/lab/infra/store";

// WP115 (research-tools-spec.md): an analyst confirms or dismisses a
// cluster candidate link. Same gates as every lab mutation.

const REVIEWS_PER_HOUR = 240;

const reviewSchema = z
  .object({ status: z.enum(["CONFIRMED", "DISMISSED"]) })
  .strict();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const refused = refuseLabMutation(request);
  if (refused) return refused;
  const auth = await requireAdminPermission("lab:manage");
  if (!auth.ok) return noStore({ error: auth.error }, auth.status);
  const { id } = await context.params;
  const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return noStore({ error: "invalid_payload" }, 400);
  const limit = await checkRateLimitAsync(`lab-link-reviews:${auth.session.sub}`, REVIEWS_PER_HOUR, 60 * 60_000);
  if (!limit.allowed) return noStore({ error: "rate_limited" }, 429);
  const result = await reviewServiceLink(id, parsed.data.status, auth.session.sub);
  if (!result.ok) return noStore({ error: result.error }, result.error === "link_not_found" ? 404 : 400);
  return noStore({ link: result.link });
}
