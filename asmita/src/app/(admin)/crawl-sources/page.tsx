import { listCrawlSources } from "@/lib/crawl-sources";
import { crawlerEnabled } from "@/lib/crawler-auth";
import { deniedFor } from "../page-permission";
import { CrawlerOffBanner } from "../findings/CrawlerOffBanner";
import { SourcesManager } from "./SourcesManager";

export const dynamic = "force-dynamic";

export default async function CrawlSourcesPage() {
  const denied = await deniedFor("crawler:manage");
  if (denied) return denied;
  const sources = await listCrawlSources();

  return (
    <section>
      <p className="eyebrow">Console · Crawler</p>
      <h1 className="mt-3">Crawler sites</h1>
      <p className="muted mt-4 max-w-2xl text-sm">
        The public sites the crawler may visit. New sites start switched off. Every change is recorded.
      </p>
      {!crawlerEnabled() && <CrawlerOffBanner />}
      <div className="mt-6">
        <SourcesManager sources={sources} />
      </div>
    </section>
  );
}
