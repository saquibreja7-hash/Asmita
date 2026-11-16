/**
 * Dates printed on notices and signed documents are India dates. One helper,
 * so the authorisation she signs and the notice that cites it always agree.
 */
export function noticeDate(date: Date) {
  return date.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", year: "numeric", month: "long", day: "numeric" });
}
