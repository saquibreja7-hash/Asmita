import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = path.join(process.cwd(), "prisma", "migrations");

function allMigrationSql() {
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readFileSync(path.join(migrationsDir, entry.name, "migration.sql"), "utf8"))
    .join("\n");
}

function tableNames(sql: string, pattern: RegExp) {
  return new Set([...sql.matchAll(pattern)].map((match) => match[1]));
}

describe("database migrations", () => {
  const sql = allMigrationSql();
  const created = tableNames(sql, /CREATE TABLE "(\w+)"/g);

  it("enables row-level security on every table", () => {
    const protectedTables = tableNames(sql, /ALTER TABLE "(\w+)" ENABLE ROW LEVEL SECURITY/g);
    const missing = [...created].filter((table) => !protectedTables.has(table));
    expect(created.size).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  it("gives the app role a policy on every table", () => {
    const withPolicy = tableNames(sql, /CREATE POLICY asmita_app_all ON "(\w+)"/g);
    const missing = [...created].filter((table) => !withPolicy.has(table));
    expect(missing).toEqual([]);
  });
});
