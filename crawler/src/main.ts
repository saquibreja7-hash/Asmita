/**
 * Container entrypoint: `node dist/main.js run`.
 * Always the production network policy; nothing here can loosen it.
 *
 * The only filesystem read in src/: the service key file named by
 * CRAWLER_SERVICE_KEY_FILE (src/secrets.ts). runMain deletes the key
 * variables from process.env before any decoder child is spawned.
 */
import { readFileSync } from "node:fs";
import { runMain } from "./cli.ts";

const code = await runMain({
  argv: process.argv.slice(2),
  env: process.env,
  readFile: (path) => readFileSync(path, "utf8"),
  handleSignals: true,
});
process.exitCode = code;
