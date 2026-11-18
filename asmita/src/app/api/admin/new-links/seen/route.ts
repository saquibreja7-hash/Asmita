import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { verifyCsrfRequest } from "@/lib/csrf";
import { NEW_LINKS_SEEN_COOKIE } from "@/lib/admin-new-links";

// Opening New links marks everything up to now as seen, in this browser.
// A timestamp only: nothing about a case or a link is stored in the cookie.
export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) {
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const auth = await requireAdminPermission("cases:read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const response = NextResponse.json({ success: true });
  response.cookies.set(NEW_LINKS_SEEN_COOKIE, new Date().toISOString(), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });
  return response;
}
