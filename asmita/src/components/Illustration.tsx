// Decorative scene illustrations from /images/illustrations. They repeat what
// the text says, so screen readers skip them. The images have transparent
// paper, so they sit on any light background; keep them off dark sections.
const SIZES = {
  "home-hero": [720, 540, "webp"],
  "how-1-tell": [720, 720, "webp"],
  "how-2-send": [720, 720, "webp"],
  "how-3-protect": [720, 720, "webp"],
  "done-relief": [720, 540, "webp"],
  "stop-paths": [720, 540, "webp"],
  "who-we-help": [960, 540, "webp"],
  "start-journey": [720, 540, "webp"],
  "page-issue": [720, 540, "webp"],
  "page-what-we-do": [720, 540, "webp"],
  "page-how-it-works": [720, 540, "webp"],
  "page-check-image": [720, 540, "webp"],
  "page-resources": [720, 540, "webp"],
  "page-faq": [720, 540, "webp"],
  "page-get-help": [720, 540, "webp"],
  "page-about": [720, 540, "webp"],
  "page-privacy": [720, 540, "webp"],
  "page-contact": [720, 540, "webp"],
  "audience-helping": [720, 525, "webp"],
  "audience-parents": [720, 525, "webp"],
  "audience-young": [720, 263, "webp"],
  "audience-platforms": [720, 540, "webp"],
  "issue-ncii": [720, 540, "webp"],
  "issue-deepfakes": [720, 540, "webp"],
  "issue-morphing": [720, 540, "webp"],
  "issue-sextortion": [720, 540, "webp"],
  "issue-doxxing": [720, 540, "webp"],
  "page-guides": [720, 540, "webp"],
  "page-legal": [720, 540, "webp"],
  "page-directory": [720, 540, "webp"],
  "page-glossary": [720, 540, "webp"],
  "page-research": [720, 540, "webp"],
  "page-terms": [720, 540, "webp"],
  "page-talk": [720, 540, "webp"],
  "page-feedback": [720, 540, "webp"],
} as const;

export type IllustrationName = keyof typeof SIZES;

export function Illustration({
  name,
  className = "",
  eager = false,
}: {
  name: IllustrationName;
  className?: string;
  eager?: boolean;
}) {
  const [width, height, ext] = SIZES[name];
  return (
    // Small static files: next/image adds nothing here.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/images/illustrations/${name}.${ext}`}
      alt=""
      aria-hidden
      width={width}
      height={height}
      className={`h-auto w-full ${className}`}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
    />
  );
}
