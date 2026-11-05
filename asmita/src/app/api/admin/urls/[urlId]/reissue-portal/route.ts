import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "portal_retired" }, { status: 410 });
}
