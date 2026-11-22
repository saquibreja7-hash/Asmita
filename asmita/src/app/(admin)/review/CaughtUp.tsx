import Link from "next/link";

// The empty state of the review loop (WP141): the queue holds nothing this
// reviewer can take. A drawn check, the words, and the way back.
export function CaughtUp({ queueKey }: { queueKey?: string }) {
  return (
    <section>
      <div className="a-card mt-8 grid justify-items-center gap-4 p-8 text-center">
        <svg aria-hidden="true" className="text-[var(--brand)]" fill="none" height="48" viewBox="0 0 48 48" width="48">
          <circle cx="24" cy="24" r="21" stroke="currentColor" strokeWidth="2.5" />
          <path d="M15 24.5l6.2 6L33 18.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
        </svg>
        <h1 className="text-[var(--t-xl)] font-semibold">You&apos;re all caught up</h1>
        <p className="muted max-w-md text-sm">
          {queueKey
            ? "Nothing is waiting for you in this queue right now."
            : "Nothing is waiting for you right now."}
        </p>
        <Link className="link-underline text-sm" href="/admin/review">
          Back to the queues
        </Link>
      </div>
    </section>
  );
}
