export type PlatformResponseSample = {
  platformId: string;
  platformName: string;
  noticeSentAt: string;
  responseReceivedAt?: string;
  removedAt?: string;
};

export function calculatePlatformResponseRates(samples: PlatformResponseSample[], now = new Date()) {
  const windowStart = now.getTime() - 7 * 24 * 60 * 60_000;
  const recent = samples.filter((sample) => new Date(sample.noticeSentAt).getTime() >= windowStart);
  const byPlatform = new Map<string, PlatformResponseSample[]>();

  for (const sample of recent) {
    const existing = byPlatform.get(sample.platformId) || [];
    existing.push(sample);
    byPlatform.set(sample.platformId, existing);
  }

  return Array.from(byPlatform.entries()).map(([platformId, platformSamples]) => {
    const responded = platformSamples.filter((sample) => sample.responseReceivedAt || sample.removedAt).length;
    const responseRate = platformSamples.length ? responded / platformSamples.length : 0;
    return {
      platformId,
      platformName: platformSamples[0].platformName,
      noticesSent: platformSamples.length,
      responded,
      responseRate,
      recommendation:
        platformSamples.length >= 5 && responseRate < 0.5
          ? "Review escalation strategy and contact freshness"
          : "Keep current escalation strategy",
    };
  });
}
