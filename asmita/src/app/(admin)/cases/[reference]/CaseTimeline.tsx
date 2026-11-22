import { formatIst } from "../case-format";

// The case timeline, shared by the case page and the review job screen
// (review-console-spec.md WP141: "reuse the case page component"). Times in
// IST, event names in words, the actor as recorded.
export type CaseTimelineEventView = {
  sequence: number;
  eventType: string;
  actorId: string;
  createdAt: string;
};

export function CaseTimeline({ events }: { events: CaseTimelineEventView[] }) {
  if (events.length === 0) {
    return <p className="muted mt-3 text-sm">No recorded events.</p>;
  }
  return (
    <ol className="mt-4 grid gap-2 text-sm">
      {events.map((event) => (
        <li className="grid gap-x-4 sm:grid-cols-[12rem_1fr_auto]" key={event.sequence}>
          <span className="muted tabular-nums">{formatIst(event.createdAt)}</span>
          <span>{event.eventType.replaceAll("_", " ").toLowerCase()}</span>
          <span className="muted font-mono text-xs">{event.actorId}</span>
        </li>
      ))}
    </ol>
  );
}
