import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_SAVED_VIEWS,
  createSavedView,
  deleteSavedView,
  listSavedViews,
  sanitiseViewQuery,
} from "@/lib/admin-saved-views";

describe("saved views", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps only the list's filter and sort parameters", () => {
    expect(sanitiseViewQuery("?nextAction=send_notice&cursor=abc&peek=ASMITA-2026-X&evil=1&sort=newest")).toBe(
      "nextAction=send_notice&sort=newest",
    );
    expect(sanitiseViewQuery(`q=${"x".repeat(101)}`)).toBe("");
  });

  it("saves, lists and removes an admin's own views only", async () => {
    const created = await createSavedView("owner-a", { name: " Ready to send ", query: "nextAction=send_notice" });
    expect(created).toMatchObject({ ok: true, view: { name: "Ready to send", query: "nextAction=send_notice" } });
    if (!created.ok) return;

    expect(await createSavedView("owner-a", { name: "ready to SEND", query: "sort=newest" })).toEqual({
      ok: false,
      error: "name_taken",
    });
    expect(await createSavedView("owner-a", { name: "Empty", query: "cursor=abc" })).toEqual({
      ok: false,
      error: "empty_view",
    });

    // Another admin cannot remove it.
    expect(await deleteSavedView("owner-b", created.view.id)).toBe(false);
    expect(await listSavedViews("owner-a")).toHaveLength(1);
    expect(await deleteSavedView("owner-a", created.view.id)).toBe(true);
    expect(await listSavedViews("owner-a")).toHaveLength(0);
  });

  it("keeps pasted links out of the name and the search", async () => {
    expect(await createSavedView("owner-d", { name: "https://example.invalid/post", query: "sort=newest" })).toEqual({
      ok: false,
      error: "links_not_allowed",
    });
    expect(await createSavedView("owner-d", { name: "Search", query: "q=www.example.invalid" })).toEqual({
      ok: false,
      error: "links_not_allowed",
    });
    expect(await createSavedView("owner-d", { name: "Dates", query: "from=2026-11-01&to=2026-11-08" })).toMatchObject({
      ok: true,
    });
  });

  it(`stops at ${MAX_SAVED_VIEWS} views`, async () => {
    for (let index = 0; index < MAX_SAVED_VIEWS; index += 1) {
      await createSavedView("owner-c", { name: `View ${index}`, query: `q=${index}` });
    }
    expect(await createSavedView("owner-c", { name: "One more", query: "q=extra" })).toEqual({
      ok: false,
      error: "too_many_views",
    });
  });
});
