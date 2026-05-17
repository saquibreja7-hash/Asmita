import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { createReverificationQueue } from "@/lib/go-reverification";
import { summarizeDeliverability } from "@/lib/deliverability-monitor";
import { sendOnCallAlertFireAndForget } from "@/lib/alerts";
import type { DeliveryEvent } from "@/lib/webhook-events";
import type { PlatformDirectoryEntry } from "@/lib/platforms";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DELIVERABILITY_LOOKBACK_DAYS = 7;

export async function GET(request: NextRequest) {
  const unauthorized = verifyCronAuth(request);
  if (unauthorized) return unauthorized;

  const startedAt = new Date();
  const result: {
    startedAt: string;
    finishedAt?: string;
    reverification?: { dueCount: number; items: ReturnType<typeof createReverificationQueue> };
    deliverability?: ReturnType<typeof summarizeDeliverability>;
    error?: string;
  } = { startedAt: startedAt.toISOString() };

  try {
    const platforms = await loadPlatformDirectoryFromDb();
    const queue = createReverificationQueue(platforms, startedAt);
    result.reverification = { dueCount: queue.length, items: queue };

    if (queue.length > 0) {
      sendOnCallAlertFireAndForget({
        severity: "warning",
        title: "GO reverification due",
        description: `${queue.length} platform contact(s) need re-verification by a human.`,
        route: "/api/cron/maintenance",
      });
    }

    const lookbackStart = new Date(startedAt.getTime() - DELIVERABILITY_LOOKBACK_DAYS * 24 * 60 * 60_000);
    const events = await loadDeliveryEvents(lookbackStart);
    const deliverability = summarizeDeliverability(events);
    result.deliverability = deliverability;

    if (!deliverability.healthy) {
      sendOnCallAlertFireAndForget({
        severity: "critical",
        title: "Email deliverability degraded",
        description: `bounceRate=${deliverability.bounceRate}, complaintRate=${deliverability.complaintRate} over ${DELIVERABILITY_LOOKBACK_DAYS}d (n=${deliverability.total}).`,
        route: "/api/cron/maintenance",
      });
    }

    result.finishedAt = new Date().toISOString();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.error = message;
    result.finishedAt = new Date().toISOString();
    sendOnCallAlertFireAndForget({
      severity: "critical",
      title: "maintenance cron failed",
      description: message,
      route: "/api/cron/maintenance",
    });
    return NextResponse.json(result, { status: 500 });
  }
}

async function loadPlatformDirectoryFromDb(): Promise<PlatformDirectoryEntry[]> {
  const rows = await db.platform.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      domainPatterns: true,
      tier: true,
      noticeBasis: true,
      grievanceEmail: true,
      formUrl: true,
      apiEndpoint: true,
      lastContactVerifiedByHuman: true,
      lastContactVerifiedAt: true,
    },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    domainPatterns: row.domainPatterns,
    tier: row.tier,
    noticeBasis: row.noticeBasis,
    grievanceEmail: row.grievanceEmail ?? "<TO_BE_VERIFIED_BY_HUMAN>",
    formUrl: row.formUrl ?? undefined,
    apiEndpoint: row.apiEndpoint ?? undefined,
    lastContactVerifiedByHuman: row.lastContactVerifiedByHuman,
    lastContactVerifiedAt: row.lastContactVerifiedAt?.toISOString(),
  }));
}

async function loadDeliveryEvents(since: Date): Promise<DeliveryEvent[]> {
  const rows = await db.emailDeliveryProof.findMany({
    where: {
      receivedAt: { gte: since },
      eventType: { in: ["delivered", "bounced", "complained"] },
    },
    select: { messageId: true, eventType: true, platformId: true, receivedAt: true },
  });
  return rows.map((row) => ({
    type: row.eventType as DeliveryEvent["type"],
    messageId: row.messageId,
    platformId: row.platformId ?? undefined,
    createdAt: row.receivedAt.toISOString(),
  }));
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
