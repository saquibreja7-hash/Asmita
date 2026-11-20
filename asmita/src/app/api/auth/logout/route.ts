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
  // Leave nothing behind on a shared phone (web audit WP41): the cookies go
  // below, and everything else this origin holds in the browser — the submit
  // draft and the eligibility answers in session storage, any cached page —
  // goes with the response. Quick Exit and the idle sign-out also clear the
  // tab's sessionStorage themselves, because the keepalive request may never
  // finish, so this header is one of two independent clears.
  response.headers.set("Clear-Site-Data", '"cache", "storage"');
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
