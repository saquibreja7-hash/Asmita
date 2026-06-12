import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { sha256 } from "@/lib/hash";

const CSRF_COOKIE = "asmita_csrf";

function secret() {
  const configured = process.env.CSRF_SECRET || process.env.JWT_SECRET;
  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("CSRF_SECRET (or JWT_SECRET) is required in production.");
    }
    return "dev-secret-change-before-prod-32chars";
  }
  return configured;
}

export function createCsrfPair() {
  const nonce = randomUUID();
  return { nonce, token: sha256(`${nonce}:${secret()}`) };
}

export function createCsrfToken(nonce: string) {
  return sha256(`${nonce}:${secret()}`);
}

export function readCookie(header: string | null, name: string) {
  return (
    header
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? null
  );
}

export function verifyCsrfRequest(request: Request) {
  const nonce = readCookie(request.headers.get("cookie"), CSRF_COOKIE);
  const submitted = request.headers.get("x-csrf-token");
  return Boolean(nonce && submitted && submitted === createCsrfToken(nonce));
}

export function attachCsrfCookie(response: NextResponse, nonce: string) {
  response.cookies.set(CSRF_COOKIE, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60,
  });
  return response;
}
