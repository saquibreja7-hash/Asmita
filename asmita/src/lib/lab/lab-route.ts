import { NextResponse } from "next/server";
import { verifyCsrfRequest } from "@/lib/csrf";
import { labEnabled } from "@/lib/lab/flags";

/*
 * Shared plumbing for the /api/lab admin routes (docs/lab/charter.md):
 * every route answers admin-only with lab:manage, never cached, and every
 * mutation is refused while ENABLE_LAB is off and CSRF-checked before the
 * payload is read — the same order the crawler's admin routes use.
 */

export function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Lab mutations: 503 while the Lab is off, 403 without a valid CSRF pair. */
export function refuseLabMutation(request: Request): NextResponse | null {
  if (!labEnabled()) return noStore({ error: "lab_disabled" }, 503);
  if (!verifyCsrfRequest(request)) return noStore({ error: "csrf_failed" }, 403);
  return null;
}
