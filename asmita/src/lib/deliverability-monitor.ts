import type { DeliveryEvent } from "@/lib/webhook-events";

export function summarizeDeliverability(events: DeliveryEvent[]) {
  const delivered = events.filter((event) => event.type === "delivered").length;
  const bounced = events.filter((event) => event.type === "bounced").length;
  const complained = events.filter((event) => event.type === "complained").length;
  const total = events.length;
  return {
    total,
    delivered,
    bounced,
    complained,
    bounceRate: total ? Number((bounced / total).toFixed(3)) : 0,
    complaintRate: total ? Number((complained / total).toFixed(3)) : 0,
    healthy: total === 0 || (bounced / total < 0.02 && complained / total < 0.005),
  };
}
