/**
 * The service key, taken once at startup.
 *
 * Two ways to provide it:
 *   - CRAWLER_SERVICE_KEY_FILE: path to a file holding only the key (a
 *     Secret Manager secret mounted as a file). Recommended for production:
 *     the key is never in any process environment, and the file is outside
 *     the decoder child's --allow-fs-read paths.
 *   - CRAWLER_SERVICE_KEY: the key itself (local runs).
 *
 * Either way both names are deleted from the environment object passed in
 * (the real environment in production) before any decoder child exists, and
 * the key is never put on a child's argv or env (decoder-pool.ts).
 *
 * What deleting does NOT do: on Linux /proc/<pid>/environ shows a process's
 * INITIAL environment, so a key given as an env var stays readable there by
 * anything running as the same OS user, including native code in a
 * compromised decoder child. The file method keeps the key out of every
 * environment, but the file itself is still readable by native code running
 * as the same OS user (Node's --allow-fs-read does not bind native code).
 * Only running the decoder as a different user (or in a syscall sandbox)
 * closes that; see README "What this does not protect against".
 */
import { ConfigError } from "./config.ts";

export const KEY_VAR = "CRAWLER_SERVICE_KEY";
export const KEY_FILE_VAR = "CRAWLER_SERVICE_KEY_FILE";

/**
 * Resolve the key into a private copy of `env` and delete both variables from
 * `env` itself. Throws ConfigError naming only variables, never values.
 */
export function takeSecrets(
  env: Record<string, string | undefined>,
  readFile: ((path: string) => string) | undefined,
): Record<string, string | undefined> {
  const inline = env[KEY_VAR];
  const file = env[KEY_FILE_VAR];
  delete env[KEY_VAR];
  delete env[KEY_FILE_VAR];
  const out: Record<string, string | undefined> = { ...env };
  if (inline !== undefined && file !== undefined) throw new ConfigError([KEY_VAR, KEY_FILE_VAR]);
  if (file === undefined) {
    out[KEY_VAR] = inline;
    return out;
  }
  if (!readFile || file === "") throw new ConfigError([KEY_FILE_VAR]);
  let text: string;
  try {
    text = readFile(file);
  } catch {
    throw new ConfigError([KEY_FILE_VAR]);
  }
  // A mounted secret may end with one newline; nothing else is trimmed.
  out[KEY_VAR] = text.replace(/\r?\n$/, "");
  return out;
}
