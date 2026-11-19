import { NextResponse } from "next/server";
import { verifyCsrfRequest } from "@/lib/csrf";
import {
  COOKIE_BASE_NAMES,
  sessionCookieName,
  withLegacyFallback,
} from "@/lib/cookie-names";

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) {
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const response = NextResponse.json({ success: true });
  // Clear the current name and, for one release, the pre-__Host- name.
  // Secure is required to delete a __Host- cookie at all.
  for (const name of withLegacyFallback(sessionCookieName())) {
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      secure: process.env.NODE_ENV === "production",
    });
  }
  response.cookies.set(COOKIE_BASE_NAMES.eligibleAdult, "", { path: "/", maxAge: 0 });
  return response;
}
