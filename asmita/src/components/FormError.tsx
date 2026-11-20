// One shared failure message for the survivor-facing forms (WP40 A4): a plain
// <p> is never announced, role="alert" is, the moment it appears. Rendered
// only when `message` is non-empty, so call sites may pass state directly.
export function FormError({
  id,
  message,
  className = "",
}: {
  /** Set when the message must be referenced from aria-describedby. */
  id?: string;
  message: string;
  /** Extra classes (layout, alignment); the danger colour stays. */
  className?: string;
}) {
  if (!message) return null;
  const classes = ["text-sm", "font-medium", "text-[var(--danger)]"];
  if (className) classes.push(className);
  return (
    <p role="alert" id={id} className={classes.join(" ")}>
      {message}
    </p>
  );
}
