import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";

// An admin's own named filters of the case list. Only the list's filter and
// sort parameters are kept; never a case, a cursor or an open preview.
const ALLOWED_KEYS = ["q", "status", "platform", "nextAction", "from", "to", "sort"] as const;
export const MAX_SAVED_VIEWS = 20;

export type SavedView = { id: string; name: string; query: string };

export function sanitiseViewQuery(query: string): string {
  const input = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
  const output = new URLSearchParams();
  for (const key of ALLOWED_KEYS) {
    const value = input.get(key)?.trim();
    if (value && value.length <= 100) output.set(key, value);
  }
  return output.toString();
}

const memory = new Map<string, SavedView[]>();

function devNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

export async function listSavedViews(ownerEmailHash: string): Promise<SavedView[]> {
  if (devNoDb()) return memory.get(ownerEmailHash) ?? [];
  return db.adminSavedView.findMany({
    where: { ownerEmailHash },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, query: true },
  });
}

export async function createSavedView(
  ownerEmailHash: string,
  input: { name: string; query: string },
): Promise<{ ok: true; view: SavedView } | { ok: false; error: "too_many_views" | "name_taken" | "empty_view" }> {
  const name = input.name.trim();
  const query = sanitiseViewQuery(input.query);
  if (!query) return { ok: false, error: "empty_view" };
  const existing = await listSavedViews(ownerEmailHash);
  if (existing.length >= MAX_SAVED_VIEWS) return { ok: false, error: "too_many_views" };
  if (existing.some((view) => view.name.toLowerCase() === name.toLowerCase())) return { ok: false, error: "name_taken" };

  if (devNoDb()) {
    const view = { id: randomUUID(), name, query };
    memory.set(ownerEmailHash, [...existing, view]);
    return { ok: true, view };
  }
  const view = await db.adminSavedView.create({
    data: { ownerEmailHash, name, query },
    select: { id: true, name: true, query: true },
  });
  return { ok: true, view };
}

/** Deletes one of the owner's own views; another admin's view is untouched. */
export async function deleteSavedView(ownerEmailHash: string, id: string): Promise<boolean> {
  if (devNoDb()) {
    const views = memory.get(ownerEmailHash) ?? [];
    memory.set(ownerEmailHash, views.filter((view) => view.id !== id));
    return views.length !== (memory.get(ownerEmailHash) ?? []).length;
  }
  const result = await db.adminSavedView.deleteMany({ where: { id, ownerEmailHash } });
  return result.count > 0;
}
