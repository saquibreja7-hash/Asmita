import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { listHashReviewQueue } from "@/lib/hash-submission";

export async function GET() {
  if (process.env.ENABLE_HASH_UPLOAD !== "true") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const queue = await listHashReviewQueue();
  return NextResponse.json({ queue });
}
