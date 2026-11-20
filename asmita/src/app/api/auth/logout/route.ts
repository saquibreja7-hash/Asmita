import { NextResponse } from "next/server";
import { verifyCsrfRequest } from "@/lib/csrf";

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
  response.cookies.set("asmita_session", "", { path: "/", maxAge: 0 });
  response.cookies.set("asmita_eligible", "", { path: "/", maxAge: 0 });
  return response;
}
