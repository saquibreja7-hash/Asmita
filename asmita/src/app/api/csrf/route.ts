import { NextResponse } from "next/server";
import { attachCsrfCookie, createCsrfPair } from "@/lib/csrf";

export async function GET() {
  const pair = createCsrfPair();
  return attachCsrfCookie(NextResponse.json({ token: pair.token }), pair.nonce);
}
