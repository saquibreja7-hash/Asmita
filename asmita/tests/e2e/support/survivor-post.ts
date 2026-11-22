import type { Page } from "@playwright/test";

// A survivor-side API POST minted through the live page's own request context
// shares the page's cookie jar, and the page's csrfFetch mints a fresh CSRF
// pair for every mutating call of its own (src/lib/client-csrf.ts): during
// one full-suite run the sign flow's acknowledgement mint landed six
// milliseconds after the spec helper's mint, the nonce cookie no longer
// matched the header token, and the POST was refused with a silent 403
// csrf_failed — the same race the client's mint queue prevents inside one
// tab (web audit WP53). A spec that posts as the survivor while her page is
// live therefore mints in a throwaway context whose cookie jar the page
// cannot overwrite, seeded with her session state as it stands right now.
// Nothing else changes: the request still needs her session, the double-
// submit pair still has to verify, and the route's own rule still answers.
//
// The response body is buffered before the throwaway context is closed
// (closing the context disposes its APIResponse), and the callers keep the
// surface they had: status(), ok(), text(), json().
export type SurvivorResponse = {
  status: () => number;
  ok: () => boolean;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
};

export async function survivorPost(page: Page, path: string, data: unknown): Promise<SurvivorResponse> {
  const context = await page.context().browser()!.newContext({
    storageState: await page.context().storageState(),
  });
  try {
    const { token } = (await (await context.request.get("/api/csrf")).json()) as { token: string };
    const response = await context.request.post(path, { data, headers: { "x-csrf-token": token } });
    const status = response.status();
    const ok = response.ok();
    const body = await response.text();
    return {
      status: () => status,
      ok: () => ok,
      text: async () => body,
      json: async () => JSON.parse(body),
    };
  } finally {
    await context.close();
  }
}
