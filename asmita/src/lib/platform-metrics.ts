export type PlatformNoticeMetric = {
  platformId: string;
  platformName: string;
  sent: boolean;
  delivered?: boolean;
  acknowledged?: boolean;
  removed?: boolean;
};

export function calculatePlatformMetrics(samples: PlatformNoticeMetric[]) {
  const grouped = new Map<string, PlatformNoticeMetric[]>();
  for (const sample of samples) {
    const values = grouped.get(sample.platformId) || [];
    values.push(sample);
    grouped.set(sample.platformId, values);
  }

  return Array.from(grouped.entries()).map(([platformId, values]) => {
    const sent = values.filter((item) => item.sent).length;
    const delivered = values.filter((item) => item.delivered).length;
    const acknowledged = values.filter((item) => item.acknowledged).length;
    const removed = values.filter((item) => item.removed).length;
    return {
      platformId,
      platformName: values[0].platformName,
      sent,
      deliverySuccessRate: rate(delivered, sent),
      acknowledgmentRate: rate(acknowledged, sent),
      removalRate: rate(removed, sent),
    };
  });
}

function rate(numerator: number, denominator: number) {
  return denominator ? Number((numerator / denominator).toFixed(2)) : 0;
}
