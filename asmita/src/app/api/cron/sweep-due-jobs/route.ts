import { NextResponse, type NextRequest } from "next/server";
import { runDueEscalationsFromDb } from "@/lib/escalation-engine";
import { hardDeleteDueUsers } from "@/lib/case-ops";
import { sendOnCallAlertFireAndForget } from "@/lib/alerts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const unauthorized = verifyCronAuth(request);
  if (unauthorized) return unauthorized;

  const startedAt = new Date();
  const result: {
    startedAt: string;
    finishedAt?: string;
    escalations?: Awaited<ReturnType<typeof runDueEscalationsFromDb>>;
    deletions?: { hardDeletedUserIds: string[] };
    error?: string;
  } = { startedAt: startedAt.toISOString() };

  try {
    result.escalations = await runDueEscalationsFromDb(startedAt);
    const hardDeletedUserIds = await hardDeleteDueUsers(startedAt);
    result.deletions = { hardDeletedUserIds };
    result.finishedAt = new Date().toISOString();

    const escalationErrors = result.escalations.errors.length;
    if (escalationErrors > 0) {
      sendOnCallAlertFireAndForget({
        severity: "warning",
        title: "Escalation sweep had errors",
        description: `${escalationErrors} notice(s) failed during sweep; see cron logs.`,
        route: "/api/cron/sweep-due-jobs",
      });
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.error = message;
    result.finishedAt = new Date().toISOString();
    sendOnCallAlertFireAndForget({
      severity: "critical",
      title: "sweep-due-jobs cron failed",
      description: message,
      route: "/api/cron/sweep-due-jobs",
    });
    return NextResponse.json(result, { status: 500 });
  }
}

function verifyCronAuth(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }
  const header = request.headers.get("authorization");
  if (header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
