import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfRequest } from "@/lib/csrf";
import { dispatchTier2Notice } from "@/lib/notice-dispatch";

const schema = z.object({
  caseId: z.string().min(1),
  urlId: z.string().min(1),
  recipientEmail: z.email(),
  subject: z.string().min(1),
  body: z.string().min(1),
});

export async function POST(request: Request) {
  if (!verifyCsrfRequest(request)) {
    return NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const result = await dispatchTier2Notice(parsed.data);
  return NextResponse.json(result);
}
