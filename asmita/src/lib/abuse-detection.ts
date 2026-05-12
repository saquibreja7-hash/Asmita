import { publicUrlPatterns } from "@/lib/public-url-patterns";

export type UrlSubmissionSignal = {
  urls: string[];
  emailHash: string;
  previousSubmissionCount?: number;
  accountAgeHours?: number;
  rejectedProfileTargetCounts?: Record<string, number>;
  ipTargetSubmissionCounts?: Record<string, number>;
};

export function checkUrlSubmission(signal: UrlSubmissionSignal) {
  const reasons: string[] = [];
  const domains = signal.urls
    .map((url) => {
      try {
        return new URL(url).hostname.replace(/^www\./, "");
      } catch {
        return "invalid";
      }
    })
    .filter(Boolean);
  const uniqueDomains = new Set(domains);

  if (signal.urls.length > 10) reasons.push("too_many_urls");
  if (uniqueDomains.size > 5) reasons.push("many_unrelated_domains");
  if ((signal.previousSubmissionCount ?? 0) > 30) reasons.push("high_volume_submitter");
  if ((signal.accountAgeHours ?? Number.POSITIVE_INFINITY) < 1 && signal.urls.length >= 5) {
    reasons.push("new_account_burst");
  }
  if (Object.values(signal.rejectedProfileTargetCounts || {}).some((count) => count >= 3)) {
    reasons.push("repeated_rejected_profile_target");
  }
  if (domains.some((domain) => (signal.ipTargetSubmissionCounts?.[domain] ?? 0) >= 3)) {
    reasons.push("same_ip_same_target");
  }
  if (
    signal.urls.some((url) =>
      publicUrlPatterns.some((pattern) => url.toLowerCase().includes(pattern)),
    )
  ) {
    reasons.push("known_public_or_news_domain");
  }

  return reasons.length > 0 ? { flagged: true, reasons } : { flagged: false, reasons: [] };
}
