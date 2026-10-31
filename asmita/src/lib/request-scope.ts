import { AsyncLocalStorage } from "node:async_hooks";

// Per-request storage on the Worker. Workers forbid reusing an I/O object,
// such as a database connection, that another request opened, so anything
// connection-backed is cached here for one request instead of module-wide.
// src/cloudflare-worker.ts opens a scope around every fetch and cron run.
export const requestScope = new AsyncLocalStorage<Map<string, unknown>>();
