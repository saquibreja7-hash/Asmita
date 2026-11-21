import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { sha256 } from "@/lib/hash";
import { csrfCookieName, withLegacyFallback } from "@/lib/cookie-names";
import { safeEqual } from "@/lib/safe-equal";

function secret() {
  const configured = process.env.CSRF_SECRET || process.env.JWT_SECRET;
  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("CSRF_SECRET (or JWT_SECRET) is required in production.");
    }
    return "dev-secret-change-before-prod-32chars";
  }
  if (configured.length < 32) {
    throw new Error("CSRF_SECRET must be at least 32 characters.");
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
  const header = request.headers.get("cookie");
  const nonce = withLegacyFallback(csrfCookieName())
    .map((name) => readCookie(header, name))
    .find((value): value is string => value !== null);
  const submitted = request.headers.get("x-csrf-token");
  return Boolean(nonce && submitted && safeEqual(submitted, createCsrfToken(nonce)));
}

export function attachCsrfCookie(response: NextResponse, nonce: string) {
  response.cookies.set(csrfCookieName(), nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60,
  });
  return response;
}
