import { listPublicOrgPartners, type OrgPartner } from "@/lib/org-partners";

// Organisations that support Asmita with technology credits. Logos are their
// official marks in their own colours (Cloudflare orange, Sarvam black), used
// with permission.
//
// WP57 (docs/org/spec.md, 57.3): once an admin marks organization partners
// public, the strip shows those instead. With no public partners it keeps its
// original behaviour — the static supporters below.

const supporters = [
  // Heights differ so the two marks look the same size.
  { name: "Cloudflare", href: "https://www.cloudflare.com", src: "/images/supporters/cloudflare.svg", width: 651, height: 95, size: "h-7 md:h-8" },
  { name: "Sarvam", href: "https://www.sarvam.ai", src: "/images/supporters/sarvam.svg", width: 202, height: 32, size: "h-[18px] md:h-5" },
] as const;

export type SupporterEntry = {
  name: string;
  href?: string;
  src?: string;
  width?: number;
  height?: number;
  size?: string;
};

/**
 * What the strip shows: public organization partners when there are any,
 * otherwise the original static supporters. Pure, so the unit test can check
 * both behaviours without rendering the component.
 */
export function resolveSupporterStrip(partners: OrgPartner[]): SupporterEntry[] {
  if (partners.length === 0) return supporters.map((s) => ({ ...s }));
  return partners.map((partner) => ({
    name: partner.name,
    ...(partner.url ? { href: partner.url } : {}),
    ...(partner.logoPath ? { src: partner.logoPath } : {}),
    size: "h-8",
  }));
}

export async function SupporterLogos({ className = "", eager = false }: { className?: string; eager?: boolean }) {
  const partners = await listPublicOrgPartners();
  const entries = resolveSupporterStrip(partners);
  return (
    <ul className={`flex flex-wrap items-center gap-x-12 gap-y-6 ${className}`}>
      {entries.map((s) => (
        <li key={s.name}>
          {s.href ? (
            <a href={s.href} rel="noopener noreferrer" target="_blank" aria-label={s.name} className="block transition-opacity hover:opacity-80">
              {s.src ? (
                // Small static SVGs: next/image adds nothing here.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.src} alt={s.name} width={s.width} height={s.height} className={`${s.size} w-auto`} loading={eager ? "eager" : "lazy"} decoding="async" />
              ) : (
                <span className="text-[17px] font-semibold text-[var(--ink)]">{s.name}</span>
              )}
            </a>
          ) : s.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.src} alt={s.name} width={s.width} height={s.height} className={`${s.size} w-auto`} loading={eager ? "eager" : "lazy"} decoding="async" />
          ) : (
            <span className="text-[17px] font-semibold text-[var(--ink)]">{s.name}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
