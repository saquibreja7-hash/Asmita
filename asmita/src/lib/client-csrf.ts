const DEFAULT_TIMEOUT_MS = 15_000;
const MINT_ATTEMPTS = 2;

/*
 * Every mutating call first mints a CSRF token: GET /api/csrf answers with
 * the token and replaces the asmita_csrf cookie in the same response, and
 * the double-submit pair only verifies if they still match when the POST
 * arrives. Two rules keep the pair intact (web audit WP53):
 *
 *   1. A mint is only used when /api/csrf really answered with a token.
 *      Any other response — a 5xx, a dev-server error page, a body without
 *      a token — used to leave `token` undefined, and the POST still went
 *      out with the literal header "undefined", which the server rightly
 *      refused with 403 csrf_failed while nothing looked wrong in the
 *      logs. A bad mint is retried once, and only then does csrfFetch
 *      reject without sending anything.
 *
 *   2. One tab mints one token at a time. Two overlapping csrfFetches
 *      used to race: the second mint's Set-Cookie could land between the
 *      first mint and the first POST, so that POST left with a token the
 *      server's cookie no longer matched — the same silent 403. The queue
 *      holds the turn until fetch() has started, because that is the
 *      moment the browser attaches the cookie to the request.
 */
let mintQueue: Promise<void> = Promise.resolve();

export async function csrfFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    let send: () => Promise<Response> = () => Promise.reject(new Error("csrf_mint_failed"));
    const turn = mintQueue.then(async () => {
      const token = await mintToken(controller.signal);
      const headers = new Headers(init.headers);
      headers.set("x-csrf-token", token);
      if (!headers.has("content-type") && init.body) {
        headers.set("content-type", "application/json");
      }
      send = () => fetch(input, { ...init, headers, signal: controller.signal });
    });
    mintQueue = turn.then(
      () => undefined,
      () => undefined,
    );
    await turn;
    const response = await send();
    // The budget has to cover the whole exchange, not stop at the headers.
    // fetch() resolves when the response headers arrive, so a caller's later
    // `.json()` on a body the server never finished waited forever with the
    // timeout already cleared: one stalled response in the filing flow left
    // the survivor on "Creating…" — no error, no recovery (WP101; the
    // full-suite e2e run died exactly there, waiting for a request the app
    // never sent). Read the body here, still inside the budget, and hand
    // back a fully-buffered response: the caller's `.json()` is instant, and
    // a stalled body now aborts at the deadline like every other stall.
    const body = await response.text();
    // A null-body status (204/205/304) must not carry a body, and the
    // reconstructed headers must not claim an encoding the decoded text no
    // longer has. Everything else (status, content-type, custom headers)
    // round-trips unchanged.
    const headers = new Headers(response.headers);
    headers.delete("content-encoding");
    headers.delete("content-length");
    return new Response(body || null, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

async function mintToken(signal: AbortSignal): Promise<string> {
  let reason = "csrf_mint_failed";
  for (let attempt = 0; attempt < MINT_ATTEMPTS; attempt += 1) {
    const csrfResponse = await fetch("/api/csrf", {
      cache: "no-store",
      signal,
    });
    if (csrfResponse.ok) {
      const body = (await csrfResponse.json().catch(() => null)) as { token?: unknown } | null;
      if (body && typeof body.token === "string" && body.token.length > 0) {
        return body.token;
      }
      reason = "csrf_mint_malformed";
    } else {
      reason = `csrf_mint_http_${csrfResponse.status}`;
    }
  }
  throw new Error(reason);
}
