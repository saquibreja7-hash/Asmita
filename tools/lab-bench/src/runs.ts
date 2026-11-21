/**
 * Run directories: one folder under runs/ (gitignored) per match, detect or
 * trace invocation, holding results.json, the per-pair / per-item records,
 * and the generated report. Nothing here ever holds image bytes.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function defaultRunsDir(): string {
  return process.env.LAB_BENCH_RUNS_DIR ?? join(import.meta.dirname ?? ".", "..", "runs");
}

export function defaultModelsDir(): string {
  return process.env.LAB_BENCH_MODELS_DIR ?? join(import.meta.dirname ?? ".", "..", "models");
}

export function newRunDir(kind: "match" | "detect" | "trace", runsDir = defaultRunsDir()): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  const dir = join(runsDir, `${stamp}-${kind}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeJson(runDir: string, name: string, value: unknown): string {
  const path = join(runDir, name);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  return path;
}

export function writeJsonl(runDir: string, name: string, rows: Array<Record<string, unknown>>): string {
  const path = join(runDir, name);
  const chunks: string[] = [];
  for (const row of rows) chunks.push(`${JSON.stringify(row)}\n`);
  writeFileSync(path, chunks.join(""));
  return path;
}

export function readResults(runDir: string): Record<string, unknown> {
  const path = join(runDir, "results.json");
  if (!existsSync(path)) throw new Error(`no results.json in ${runDir}`);
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}
