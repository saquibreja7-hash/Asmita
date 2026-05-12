import { NextResponse, type NextRequest } from "next/server";

const guardedFlowRoutes = ["/submit", "/identity", "/delete-account"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (guardedFlowRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
    if (!request.cookies.get("asmita_session")?.value) {
      return NextResponse.redirect(new URL("/start", request.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/submit/:path*", "/identity/:path*", "/delete-account/:path*"],
};
