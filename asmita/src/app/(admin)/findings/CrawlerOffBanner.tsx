// Shown on the crawler pages when the deployment switch is off (the server
// tells the page: crawlerEnabled). While it is off the crawler routes answer
// 503, nothing new arrives, and every change (review, notice, site changes)
// is refused. History stays readable.
export function CrawlerOffBanner() {
  return (
    <div className="a-card mt-6 p-4 text-sm" role="status">
      <p className="font-medium">The crawler is switched off.</p>
      <p className="muted mt-1">
        No new findings arrive. Reviewing findings, sending notices and changing sites are unavailable until it is switched
        on (<code>ENABLE_CRAWLER</code>). Existing findings and their history can still be read.
      </p>
    </div>
  );
}
