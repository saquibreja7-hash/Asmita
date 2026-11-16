// Shown on the crawler pages when the deployment switch is off. While it is
// off the crawler routes answer 503 and nothing new arrives; notice actions
// are refused too.
export function CrawlerOffBanner() {
  return (
    <div className="a-card mt-6 p-4 text-sm" role="status">
      <p className="font-medium">The crawler is switched off.</p>
      <p className="muted mt-1">
        No new findings arrive, and sending notices for findings is unavailable until it is switched on
        (<code>ENABLE_CRAWLER</code>). Existing findings can still be reviewed.
      </p>
    </div>
  );
}
