/**
 * Import platforms from a human-verified CSV into the Platform table.
 *
 *   npm run import:platforms -- --file=data/platforms-tier1.csv --confirm
 *
 * Refuses to run without --confirm. Prints the target DATABASE_URL host
 * before touching anything so you can confirm you are not pointed at prod
 * by mistake. Every changed field is recorded into PlatformGoHistory and a
 * GO_DATABASE_CHANGED audit-log entry, with actorId = csv-import:<username>.
 *
 * Rows are matched by `name` (case-insensitive). Rows with `mark_verified=true`
 * MUST have at least one of grievance_email, form_url, or api_endpoint, plus a
 * source_url — otherwise the row is rejected. Placeholder rows
 * (mark_verified=false) are upserted but do not flip the verified flag.
 */
import { readFile } from "node:fs/promises";
import { userInfo } from "node:os";
import path from "node:path";
import process from "node:process";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  NoticeBasis,
  PlatformTier,
  PrismaClient,
  type Prisma,
} from "@prisma/client";
import { writeAuditLog } from "../src/lib/audit";

const TRACKED_FIELDS = [
  "grievanceEmail",
  "grievanceName",
  "grievanceAddress",
  "formUrl",
  "apiEndpoint",
] as const;
type TrackedField = (typeof TRACKED_FIELDS)[number];

type CsvRow = {
  name: string;
  domain_patterns: string;
  tier: string;
  notice_basis: string;
  grievance_email: string;
  grievance_name: string;
  grievance_address: string;
  form_url: string;
  api_endpoint: string;
  source_url: string;
  mark_verified: string;
};

type Args = { file: string; confirm: boolean };

function parseArgs(): Args {
  const args: Record<string, string | boolean> = {};
  for (const raw of process.argv.slice(2)) {
    if (!raw.startsWith("--")) continue;
    const [key, value] = raw.slice(2).split("=", 2);
    args[key] = value ?? true;
  }
  return {
    file: typeof args.file === "string" ? args.file : "data/platforms-tier1.csv",
    confirm: Boolean(args.confirm),
  };
}

export function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const header = splitCsvLine(lines[0]).map((cell) => cell.trim());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    header.forEach((key, index) => {
      row[key] = (cells[index] ?? "").trim();
    });
    return row as unknown as CsvRow;
  });
}

export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"' && line[i - 1] !== "\\") {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out;
}

export function nullOrTrim(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed === "<TO_BE_VERIFIED_BY_HUMAN>") return null;
  return trimmed;
}

export function parseTier(value: string): PlatformTier {
  const upper = value.trim().toUpperCase();
  if (upper === "TIER_1") return PlatformTier.TIER_1;
  if (upper === "TIER_2") return PlatformTier.TIER_2;
  if (upper === "TIER_3") return PlatformTier.TIER_3;
  throw new Error(`invalid_tier:${value}`);
}

export function parseNoticeBasis(value: string): NoticeBasis {
  const upper = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (upper in NoticeBasis) return NoticeBasis[upper as keyof typeof NoticeBasis];
  throw new Error(`invalid_notice_basis:${value}`);
}

export function parseDomainPatterns(value: string): string[] {
  return value
    .split(/[;,|]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function dbHostFromUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "(unparseable)";
  }
}

type RejectReason = { row: number; name: string; reason: string };

async function main() {
  const args = parseArgs();
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL not set. Aborting.");
    process.exit(2);
  }

  const filePath = path.resolve(process.cwd(), args.file);
  const csvText = await readFile(filePath, "utf-8");
  const rows = parseCsv(csvText);

  console.log(`\n[import-platforms-csv]`);
  console.log(`  Target database host : ${dbHostFromUrl(dbUrl)}`);
  console.log(`  CSV file             : ${filePath}`);
  console.log(`  Row count            : ${rows.length}`);
  console.log(`  Actor                : csv-import:${userInfo().username}`);
  console.log("");

  if (!args.confirm) {
    console.log("Dry-run mode (no --confirm). Pass --confirm to write to the database.");
    console.log("Refusing to mutate.");
    return;
  }

  const adapter = new PrismaPg({ connectionString: dbUrl });
  const prisma = new PrismaClient({ adapter });
  const actorId = `csv-import:${userInfo().username}`;

  const rejected: RejectReason[] = [];
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  try {
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const rowNumber = i + 2;
      if (!row.name) {
        rejected.push({ row: rowNumber, name: "(blank)", reason: "missing_name" });
        continue;
      }

      let tier: PlatformTier;
      let basis: NoticeBasis;
      try {
        tier = parseTier(row.tier);
        basis = parseNoticeBasis(row.notice_basis);
      } catch (err) {
        rejected.push({ row: rowNumber, name: row.name, reason: err instanceof Error ? err.message : "parse_error" });
        continue;
      }

      const markVerified = /^(true|1|yes)$/i.test(row.mark_verified || "");
      const sourceUrl = nullOrTrim(row.source_url);
      const fields = {
        grievanceEmail: nullOrTrim(row.grievance_email),
        grievanceName: nullOrTrim(row.grievance_name),
        grievanceAddress: nullOrTrim(row.grievance_address),
        formUrl: nullOrTrim(row.form_url),
        apiEndpoint: nullOrTrim(row.api_endpoint),
      } satisfies Record<TrackedField, string | null>;

      if (markVerified) {
        if (!fields.grievanceEmail && !fields.formUrl && !fields.apiEndpoint) {
          rejected.push({ row: rowNumber, name: row.name, reason: "verified_row_needs_contact" });
          continue;
        }
        if (!sourceUrl) {
          rejected.push({ row: rowNumber, name: row.name, reason: "verified_row_needs_source_url" });
          continue;
        }
      }

      const existing = await prisma.platform.findFirst({
        where: { name: { equals: row.name, mode: "insensitive" } },
      });

      if (!existing) {
        const createdRow = await prisma.platform.create({
          data: {
            name: row.name,
            domainPatterns: parseDomainPatterns(row.domain_patterns),
            tier,
            noticeBasis: basis,
            grievanceEmail: fields.grievanceEmail,
            grievanceName: fields.grievanceName,
            grievanceAddress: fields.grievanceAddress,
            formUrl: fields.formUrl,
            apiEndpoint: fields.apiEndpoint,
            lastContactVerifiedAt: markVerified ? new Date() : null,
            lastContactVerifiedByHuman: markVerified,
          },
        });

        const changes = TRACKED_FIELDS.filter((field) => fields[field] !== null).map((field) => ({
          field,
          previousValue: null,
          newValue: fields[field],
        }));

        if (changes.length > 0) {
          await prisma.platformGoHistory.createMany({
            data: changes.map((change) => ({
              platformId: createdRow.id,
              fieldName: change.field,
              oldValue: change.previousValue,
              newValue: change.newValue,
              sourceUrl,
              verifiedBy: actorId,
              changedById: actorId,
            })),
          });
        }

        await writeAuditLog({
          eventType: "GO_DATABASE_CHANGED",
          entityType: "Platform",
          entityId: createdRow.id,
          actorId,
          data: {
            platformName: row.name,
            operation: "create",
            sourceUrl,
            markVerified,
            changes,
          },
        });

        created += 1;
        continue;
      }

      const diffs: Array<{ field: TrackedField; oldValue: string | null; newValue: string | null }> = [];
      const updateData: Prisma.PlatformUpdateInput = {
        domainPatterns: parseDomainPatterns(row.domain_patterns),
        tier,
        noticeBasis: basis,
      };

      for (const field of TRACKED_FIELDS) {
        const incoming = fields[field];
        const current = (existing[field] ?? null) as string | null;
        if (incoming === current) continue;
        diffs.push({ field, oldValue: current, newValue: incoming });
        updateData[field] = incoming;
      }

      if (markVerified) {
        updateData.lastContactVerifiedAt = new Date();
        updateData.lastContactVerifiedByHuman = true;
      }

      if (diffs.length === 0 && !markVerified) {
        unchanged += 1;
        continue;
      }

      await prisma.platform.update({ where: { id: existing.id }, data: updateData });

      if (diffs.length > 0) {
        await prisma.platformGoHistory.createMany({
          data: diffs.map((diff) => ({
            platformId: existing.id,
            fieldName: diff.field,
            oldValue: diff.oldValue,
            newValue: diff.newValue,
            sourceUrl,
            verifiedBy: actorId,
            changedById: actorId,
          })),
        });
      }

      await writeAuditLog({
        eventType: "GO_DATABASE_CHANGED",
        entityType: "Platform",
        entityId: existing.id,
        actorId,
        data: {
          platformName: row.name,
          operation: "update",
          sourceUrl,
          markVerified,
          changes: diffs.map((diff) => ({
            field: diff.field,
            previousValue: diff.oldValue,
            newValue: diff.newValue,
          })),
        },
      });

      updated += 1;
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(`\nDone.`);
  console.log(`  Created   : ${created}`);
  console.log(`  Updated   : ${updated}`);
  console.log(`  Unchanged : ${unchanged}`);
  console.log(`  Rejected  : ${rejected.length}`);
  if (rejected.length > 0) {
    console.log("");
    for (const reject of rejected) {
      console.log(`  Row ${reject.row} [${reject.name}] - ${reject.reason}`);
    }
    process.exit(1);
  }
}

if (!process.env.VITEST) {
  main().catch((err) => {
    console.error("Import failed:", err instanceof Error ? err.stack || err.message : err);
    process.exit(1);
  });
}
