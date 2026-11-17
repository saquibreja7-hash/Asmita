"use client";

import { useState } from "react";
import type { CrawlSourceView } from "@/lib/crawl-sources";
import type { CrawlBlockedHostView } from "@/lib/crawl-blocked-hosts";
import { SourcesManager } from "./SourcesManager";
import { BlockedHostsManager } from "./BlockedHostsManager";

// The two views of the "Crawler sites" console page (WP2): the site list
// with its import box, and the never-crawl list. Plain client-side tabs; the
// page (server) fetches both datasets and each manager refreshes the router
// after a change.

export function CrawlerSitesTabs({
  sources,
  blockedHosts,
  crawlerEnabled = true,
}: {
  sources: CrawlSourceView[];
  blockedHosts: CrawlBlockedHostView[];
  crawlerEnabled?: boolean;
}) {
  const [tab, setTab] = useState<"sites" | "never">("sites");
  return (
    <div className="grid gap-6">
      <div aria-label="Crawler sites views" className="flex flex-wrap gap-2">
        <button
          aria-pressed={tab === "sites"}
          className={`btn px-4 py-1 text-sm ${tab === "sites" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setTab("sites")}
          type="button"
        >
          Sites
        </button>
        <button
          aria-pressed={tab === "never"}
          className={`btn px-4 py-1 text-sm ${tab === "never" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setTab("never")}
          type="button"
        >
          Never crawl
        </button>
      </div>
      {tab === "sites" ? (
        <SourcesManager crawlerEnabled={crawlerEnabled} sources={sources} />
      ) : (
        <BlockedHostsManager blockedHosts={blockedHosts} crawlerEnabled={crawlerEnabled} />
      )}
    </div>
  );
}
