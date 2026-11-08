// Kept free of server imports: the home page chat runs it in the browser.
// Pasted case URLs must never enter feedback or chat, secondary stores that
// do not get the protection the case URL fields have.
export function containsUrlLikeText(value: string) {
  return /(?:https?:\/\/|www\.|\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\/(?:\S*)|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|org|net|in|co|io|me|site|xyz)\b)/i.test(value);
}
