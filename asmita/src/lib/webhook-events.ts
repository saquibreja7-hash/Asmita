export type DeliveryEvent = {
  type: "bounced" | "complained" | "delivered";
  messageId: string;
  platformId?: string;
  createdAt: string;
};

export const deliveryEvents: DeliveryEvent[] = [];
export const stalePlatforms = new Set<string>();

export function recordDeliveryEvent(event: Omit<DeliveryEvent, "createdAt">) {
  const entry = { ...event, createdAt: new Date().toISOString() };
  deliveryEvents.push(entry);
  if (event.platformId && (event.type === "bounced" || event.type === "complained")) {
    stalePlatforms.add(event.platformId);
  }
  return entry;
}
