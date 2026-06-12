import { NextResponse, type NextRequest } from "next/server";

const guardedFlowRoutes = ["/submit", "/identity", "/delete-account"];

const MAINTENANCE_COOKIE = "asmita_maint_bypass";

function maintenanceResponse() {
  return new NextResponse(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>Asmita — back soon</title>
</head>
<body style="margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#f4f4f5;font-family:system-ui,sans-serif;">
  <div style="max-width:420px;padding:40px 32px;background:#fff;border:1px solid #e5e7eb;border-radius:14px;text-align:center;">
    <p style="margin:0 0 18px 0;font-size:13px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#0f766e;">Asmita</p>
    <h1 style="margin:0 0 12px 0;font-size:20px;font-weight:600;color:#1f2937;">We are doing some maintenance.</h1>
    <p style="margin:0;font-size:15px;line-height:1.7;color:#6b7280;">The service will be back shortly. If you need urgent help, call CHILDLINE 1098 or Emergency 112.</p>
  </div>
</body>
</html>`,
    { status: 503, headers: { "content-type": "text/html; charset=utf-8", "retry-after": "3600" } },
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Maintenance mode: MAINTENANCE_MODE=true blocks everything except
  // operators presenting the bypass secret (?maint_bypass=SECRET once,
  // then via cookie). MAINTENANCE_BYPASS_SECRET must be set alongside it.
  if (process.env.MAINTENANCE_MODE === "true") {
    const secret = process.env.MAINTENANCE_BYPASS_SECRET;
    const provided =
      request.nextUrl.searchParams.get("maint_bypass") ??
      request.cookies.get(MAINTENANCE_COOKIE)?.value;
    if (!secret || provided !== secret) {
      return maintenanceResponse();
    }
    if (request.nextUrl.searchParams.has("maint_bypass")) {
      const clean = request.nextUrl.clone();
      clean.searchParams.delete("maint_bypass");
      const response = NextResponse.redirect(clean);
      response.cookies.set(MAINTENANCE_COOKIE, secret, {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/",
        maxAge: 24 * 60 * 60,
      });
      return response;
    }
  }

  if (guardedFlowRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
    if (!request.cookies.get("asmita_session")?.value) {
      return NextResponse.redirect(new URL("/start", request.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
