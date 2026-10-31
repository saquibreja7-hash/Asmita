import { NextResponse } from "next/server";
import { verifyCsrfRequest } from "@/lib/csrf";

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) {
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const response = NextResponse.json({ success: true });
  response.cookies.set("asmita_admin_session", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  // Older sessions were scoped to /admin and stay valid for up to 8 hours
  // unless cleared at that path too. response.cookies keys by name, so the
  // second path needs its own header.
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.headers.append(
    "Set-Cookie",
    `asmita_admin_session=; Path=/admin; Max-Age=0; HttpOnly; SameSite=Lax${secure}`,
  );
  return response;
}
