// In production the app sits behind Cloudflare, which sets cf-connecting-ip
// itself. x-forwarded-for and x-real-ip can be sent by the client, so trusting
// them lets anyone pick a fresh per-IP rate-limit bucket on every request.
// If the header is missing in production, every such request shares one fixed
// bucket, so the limit still applies. Outside production (local dev, tests,
// the Node dev server used by E2E) there is no Cloudflare in front, so the
// forwarded headers are used.
export const MISSING_CLIENT_IP = "missing-cf-connecting-ip";

export function getClientIp(request: Request) {
  const cfIp = request.headers.get("cf-connecting-ip")?.trim();
  if (process.env.NODE_ENV === "production") {
    return cfIp || MISSING_CLIENT_IP;
  }
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip") || cfIp || "unknown";
}
