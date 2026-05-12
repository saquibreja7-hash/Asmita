export async function csrfFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const csrfResponse = await fetch("/api/csrf", { cache: "no-store" });
  const { token } = (await csrfResponse.json()) as { token: string };
  const headers = new Headers(init.headers);
  headers.set("x-csrf-token", token);
  if (!headers.has("content-type") && init.body) {
    headers.set("content-type", "application/json");
  }
  return fetch(input, { ...init, headers });
}
