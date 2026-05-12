import { NextResponse } from "next/server";
import { parseSubmittedUrl } from "@/lib/url-parser";

export async function GET(request: Request) {
  const submitted = new URL(request.url).searchParams.get("url");
  if (!submitted) {
    return NextResponse.json({ error: "missing_url" }, { status: 400 });
  }
  const parsed = parseSubmittedUrl(submitted);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  return NextResponse.json({
    domain: parsed.domain,
    platformName: parsed.platform?.name || "Unknown - will be reviewed",
    tier: parsed.platform?.tier || null,
  });
}
