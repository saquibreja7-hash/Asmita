/**
 * One CSV cell for the admin exports of public-form data (org submissions,
 * newsletter subscribers). The values come from the public, so a value that
 * starts with a formula trigger (= + - @, or a tab or carriage return) gets a
 * leading apostrophe, which spreadsheet apps show as text instead of running
 * it. Values with a quote, comma or line break are quoted.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
