/**
 * The service key is taken out of the environment before any decoder child
 * exists, can come from a file (recommended in production), and never
 * appears in an error.
 */
import { describe, expect, it } from "vitest";
import { runMain } from "../../src/cli.ts";
import { ConfigError } from "../../src/config.ts";
import { takeSecrets } from "../../src/secrets.ts";

const KEY = "file-secret-key-value-0123456789abcdef";

const errKeys = (fn: () => unknown): string[] => {
  try {
    fn();
    return [];
  } catch (e) {
    expect(e).toBeInstanceOf(ConfigError);
    expect(String((e as Error).message)).not.toContain(KEY);
    return (e as ConfigError).keys;
  }
};

describe("takeSecrets", () => {
  it("moves an inline key into a private copy and deletes it from the given env", () => {
    const env: Record<string, string | undefined> = { CRAWLER_SERVICE_KEY: KEY, OTHER: "x" };
    const out = takeSecrets(env, undefined);
    expect(out.CRAWLER_SERVICE_KEY).toBe(KEY);
    expect(out.OTHER).toBe("x");
    expect("CRAWLER_SERVICE_KEY" in env).toBe(false);
  });
  it("reads the key from CRAWLER_SERVICE_KEY_FILE and deletes both names", () => {
    const env: Record<string, string | undefined> = { CRAWLER_SERVICE_KEY_FILE: "/run/secrets/key" };
    const read: string[] = [];
    const out = takeSecrets(env, (p) => (read.push(p), `${KEY}\n`));
    expect(read).toEqual(["/run/secrets/key"]);
    expect(out.CRAWLER_SERVICE_KEY).toBe(KEY); // one trailing newline dropped
    expect(out.CRAWLER_SERVICE_KEY_FILE).toBeUndefined();
    expect(Object.keys(env)).toEqual([]);
  });
  it("refuses both at once, an unreadable file, or a file without a reader, naming variables only", () => {
    expect(errKeys(() => takeSecrets({ CRAWLER_SERVICE_KEY: KEY, CRAWLER_SERVICE_KEY_FILE: "/k" }, () => KEY))).toEqual([
      "CRAWLER_SERVICE_KEY",
      "CRAWLER_SERVICE_KEY_FILE",
    ]);
    expect(
      errKeys(() =>
        takeSecrets({ CRAWLER_SERVICE_KEY_FILE: "/missing" }, () => {
          throw new Error(`ENOENT ${KEY}`);
        }),
      ),
    ).toEqual(["CRAWLER_SERVICE_KEY_FILE"]);
    expect(errKeys(() => takeSecrets({ CRAWLER_SERVICE_KEY_FILE: "/k" }, undefined))).toEqual(["CRAWLER_SERVICE_KEY_FILE"]);
    // Even on refusal, the given env no longer holds the key.
    const env: Record<string, string | undefined> = { CRAWLER_SERVICE_KEY: KEY, CRAWLER_SERVICE_KEY_FILE: "/k" };
    errKeys(() => takeSecrets(env, undefined));
    expect(env).toEqual({});
  });
});

describe("runMain", () => {
  it("deletes the key from the environment it was given before doing anything else", async () => {
    const env: Record<string, string | undefined> = { CRAWLER_SERVICE_KEY: KEY };
    const lines: string[] = [];
    // Config is otherwise invalid, so the run stops before any network or child.
    expect(await runMain({ argv: ["run"], env, sink: (l) => lines.push(l) })).toBe(1);
    expect(env.CRAWLER_SERVICE_KEY).toBeUndefined();
    expect(lines.join("\n")).not.toContain(KEY);
  });
  it("accepts the key from a file through the injected reader", async () => {
    const env: Record<string, string | undefined> = { CRAWLER_SERVICE_KEY_FILE: "/run/secrets/key", CRAWLER_USER_AGENT: "Mozilla" };
    const lines: string[] = [];
    await runMain({ argv: ["run"], env, sink: (l) => lines.push(l), readFile: () => KEY });
    const invalid = Object.keys((JSON.parse(lines[0]!) as { invalidKeys: Record<string, number> }).invalidKeys);
    // The key resolved from the file is valid; only the other settings are not.
    expect(invalid.sort()).toEqual(["ASMITA_API_URL", "CRAWLER_USER_AGENT"]);
    expect(env).toEqual({ CRAWLER_USER_AGENT: "Mozilla" });
  });
});
