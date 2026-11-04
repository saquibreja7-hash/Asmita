"use client";

import Link from "next/link";
import { useState } from "react";

type Audience = { label: string; href: string; art?: string };

// Audience buttons with an illustration that changes to match the button
// being hovered or focused. With nothing hovered, the group scene shows.
export function AudiencePicker({ audiences, defaultArt }: { audiences: Audience[]; defaultArt: string }) {
  const [active, setActive] = useState<number | null>(null);
  const shown = (active !== null && audiences[active].art) || defaultArt;
  const scenes = [defaultArt, ...new Set(audiences.flatMap((a) => (a.art ? [a.art] : [])))];

  return (
    <div onMouseLeave={() => setActive(null)}>
      <div className="audience-pills mt-10">
        {audiences.map((a, i) => (
          <Link
            key={a.href}
            href={a.href}
            className={`btn btn-secondary ${active === i ? "audience-pill-active" : ""}`}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
          >
            {a.label}
          </Link>
        ))}
      </div>
      <div className="relative mx-auto mt-12 h-[260px] max-w-[760px] sm:h-[360px] md:h-[420px]" aria-hidden>
        {scenes.map((src) => (
          // Small static files: next/image adds nothing here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={src}
            src={src}
            alt=""
            className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${
              src === shown ? "opacity-100" : "opacity-0"
            }`}
            loading="lazy"
            decoding="async"
          />
        ))}
      </div>
    </div>
  );
}
