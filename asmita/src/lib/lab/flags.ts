/*
 * The one place ENABLE_LAB is read (docs/lab/charter.md), like
 * crawler-flags.ts reads the crawler's switches. A deployment switch, not a
 * dev bypass: it opens nothing that is safe only in development, so it is
 * read here directly and the helper stays client-safe (no imports).
 *
 * On in dev and test, off in production until the owner turns it on in
 * wrangler.jsonc. An explicit ENABLE_LAB always wins, both ways: "false"
 * in a dev shell switches the Lab off, "true" in production switches it
 * on. While off, lab admin pages still read (analysts can see history)
 * and every mutation answers 503 lab_disabled, like ENABLE_CRAWLER does.
 */
export function labEnabled(env: Record<string, string | undefined> = process.env) {
  if (env.ENABLE_LAB !== undefined && env.ENABLE_LAB !== "") return env.ENABLE_LAB === "true";
  return env.NODE_ENV !== "production";
}
