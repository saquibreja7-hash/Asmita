/**
 * Container entrypoint: `node dist/main.js run`.
 * Always the production network policy; nothing here can loosen it.
 */
import { runMain } from "./cli.ts";

const code = await runMain({ argv: process.argv.slice(2), env: process.env, handleSignals: true });
process.exitCode = code;
