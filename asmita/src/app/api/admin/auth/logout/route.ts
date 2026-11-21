import { NextResponse } from "next/server";
import { verifyCsrfRequest } from "@/lib/csrf";
import {
  COOKIE_BASE_NAMES,
  adminSessionCookieName,
  withLegacyFallback,
} from "@/lib/cookie-names";

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) {
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const response = NextResponse.json({ success: true });
  // Leave nothing behind on a shared phone (web audit WP41): cookies go via
  // the Set-Cookie headers below, the origin's storage and caches via
  // Clear-Site-Data ("storage" covers the admin keyboard-shortcut
  // preference in localStorage too).
  response.headers.set("Clear-Site-Data", '"cache", "storage"');
  // Clear the current name and, for one release, the pre-__Host- name.
  // Secure is required to delete a __Host- cookie at all.
  for (const name of withLegacyFallback(adminSessionCookieName())) {
    response.cookies.set(name, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
  }
  // Older sessions were scoped to /admin and stay valid for up to 8 hours
  // unless cleared at that path too. response.cookies keys by name, so the
  // second path needs its own header. A __Host- cookie can never live at
  // /admin, so only the plain name needs clearing there.
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.headers.append(
    "Set-Cookie",
    `${COOKIE_BASE_NAMES.adminSession}=; Path=/admin; Max-Age=0; HttpOnly; SameSite=Lax${secure}`,
  );
  return response;
}
