/*
 * The review screen's keyboard map (review-console-spec.md, WP141), pure so
 * the suppression rules can be tested without a browser.
 *
 * WCAG 2.1.4: the single-key shortcuts have an off switch, stored per
 * admin. Two chords stay on when the switch is off, because they cannot be
 * typed by accident: Ctrl/Cmd+Enter submits, and Escape closes a drawer.
 * Single-key shortcuts are suppressed while typing in an input, textarea,
 * select or contenteditable.
 */

export type PanelShortcut =
  | { type: "decision"; index: number }
  | { type: "focusReason" }
  | { type: "submit" }
  | { type: "skip" }
  | { type: "guidance" }
  | { type: "help" }
  | { type: "close" };

/** The event target as the map needs to see it (a DOM node, or a test stub). */
export type ShortcutTarget = { tagName?: string; isContentEditable?: boolean } | null;

export function isTypingTarget(target: ShortcutTarget): boolean {
  if (!target) return false;
  const tag = target.tagName?.toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || Boolean(target.isContentEditable);
}

export function panelShortcut(
  event: { key: string; ctrlKey?: boolean; metaKey?: boolean; target?: ShortcutTarget },
  options: { shortcutsOn: boolean; decisionCount: number },
): PanelShortcut | null {
  if (event.ctrlKey || event.metaKey) {
    return event.key === "Enter" ? { type: "submit" } : null;
  }
  if (event.key === "Escape") return { type: "close" };
  // While typing, single-key shortcuts are off: the keys belong to the field.
  if (isTypingTarget(event.target ?? null)) return null;
  if (!options.shortcutsOn) return null;
  if (event.key >= "1" && event.key <= "9") {
    const index = Number(event.key) - 1;
    return index < options.decisionCount ? { type: "decision", index } : null;
  }
  switch (event.key) {
    case "r":
      return { type: "focusReason" };
    case "s":
      return { type: "skip" };
    case "g":
      return { type: "guidance" };
    case "?":
      return { type: "help" };
    default:
      return null;
  }
}
