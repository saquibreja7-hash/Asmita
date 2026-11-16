// ESLint fixture, not a test suite (vitest and ESLint both skip tests/lint).
// tests/unit/eslint-no-url-fetch.test.ts lints this text and expects every
// fetch in the first block to be reported, and nothing in the second.
const submittedUrl = "https://example.com/content";
const pageUrl = "https://example.com/page";
const imageUrl = "https://example.com/image.jpg";
const findingUrl = "https://example.com/finding";
const finding = { pageUrl, imageUrl };

fetch(submittedUrl);
fetch(pageUrl);
fetch(imageUrl);
fetch(findingUrl);
fetch(finding.pageUrl);
fetch(finding.imageUrl);
fetch(new URL(pageUrl));
fetch(`${pageUrl}`);
fetch(`https://proxy.example/?u=${encodeURIComponent(finding.imageUrl)}`);
fetch(finding["pageUrl"]);
globalThis.fetch(pageUrl);
window.fetch(finding.imageUrl);
self.fetch(new URL(imageUrl).href);
fetch(new URL(pageUrl).toString());
fetch(String(imageUrl));
fetch(pageUrl.trim());
// -- not reported below this line --
const caseId = "case-1";
fetch(`/api/cases/${caseId}/preview-notice`);
fetch("/api/cases/case-1/urls", { method: "POST", body: JSON.stringify({ urls: [pageUrl] }) });
fetch(caseId);
const api = { fetch: (x: string) => x };
api.fetch(pageUrl);
