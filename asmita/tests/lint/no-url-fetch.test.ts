// ESLint fixture, not a test suite (vitest and ESLint both skip tests/lint).
// tests/unit/eslint-no-url-fetch.test.ts lints this text and expects every
// fetch below to be reported.
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
