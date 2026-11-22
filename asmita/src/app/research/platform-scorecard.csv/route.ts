import { scorecardCsv } from "@/lib/scorecard";
import { getPublishedScorecard, latestPublishedScorecard } from "@/lib/scorecard-snapshots";

// The scorecard's CSV download (docs/org/spec.md, WP58 58.3): the latest
// published snapshot, or an earlier one via ?period=. Drafts are never
// exported; before the first publish there is nothing to download (404).

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const period = url.searchParams.get("period");
  const snapshot = period ? await getPublishedScorecard(period) : await latestPublishedScorecard();
  if (!snapshot) {
    return new Response("No published scorecard yet.\n", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return new Response(scorecardCsv(snapshot.data), {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="platform-scorecard-${snapshot.period}.csv"`,
      "cache-control": "no-store",
    },
  });
}
