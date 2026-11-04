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
  "start-support-B": [400, 300, "svg"],
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
} as const;

export function Illustration({
  name,
  className = "",
  eager = false,
}: {
  name: keyof typeof SIZES;
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
