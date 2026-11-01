// Organisations that support Asmita with technology credits. Logos are their
// official single-colour marks, used with permission.
const supporters = [
  // Heights differ so the two marks look the same size.
  { name: "Cloudflare", href: "https://www.cloudflare.com", src: "/images/supporters/cloudflare.svg", width: 651, height: 95, size: "h-7 md:h-8" },
  { name: "Sarvam", href: "https://www.sarvam.ai", src: "/images/supporters/sarvam.svg", width: 202, height: 32, size: "h-[18px] md:h-5" },
] as const;

export function SupporterLogos({ className = "" }: { className?: string }) {
  return (
    <ul className={`flex flex-wrap items-center gap-x-12 gap-y-6 ${className}`}>
      {supporters.map((s) => (
        <li key={s.name}>
          <a href={s.href} rel="noopener noreferrer" target="_blank" aria-label={s.name} className="block opacity-80 transition-opacity hover:opacity-100">
            {/* Small static SVGs: next/image adds nothing here. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.src} alt={s.name} width={s.width} height={s.height} className={`${s.size} w-auto`} loading="lazy" decoding="async" />
          </a>
        </li>
      ))}
    </ul>
  );
}
