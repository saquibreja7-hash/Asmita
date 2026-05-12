import { afterEach, describe, expect, it, vi } from "vitest";
import { addUrlsToCase, createCase, cases } from "@/lib/store";

describe("no outbound URL fetching", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cases.clear();
  });

  it("does not call global fetch when URLs are submitted", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const record = await createCase("user-1");
    await addUrlsToCase(record.id, [
      "https://www.instagram.com/p/abc",
      "https://www.pornhub.com/view_video.php?viewkey=abc",
    ]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("keeps abuse-flagged URLs in human review", async () => {
    const record = await createCase("user-2");
    const [result] = await addUrlsToCase(record.id, ["https://www.instagram.com/p/abc"], {
      flagReasons: ["known_public_or_news_domain"],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url.status).toBe("PENDING_REVIEW");
      expect(result.url.flaggedForReview).toBe(true);
      expect(result.url.flagReason).toBe("known_public_or_news_domain");
    }
  });
});
