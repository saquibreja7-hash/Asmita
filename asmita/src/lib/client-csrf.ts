const DEFAULT_TIMEOUT_MS = 15_000;

export async function csrfFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const csrfResponse = await fetch("/api/csrf", {
      cache: "no-store",
      signal: controller.signal,
    });
    const { token } = (await csrfResponse.json()) as { token: string };
    const headers = new Headers(init.headers);
    headers.set("x-csrf-token", token);
    if (!headers.has("content-type") && init.body) {
      headers.set("content-type", "application/json");
    }
    return await fetch(input, { ...init, headers, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}
