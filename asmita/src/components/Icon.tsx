// Line icons for text-heavy pages: drawn on a 24px grid with a 1.75 stroke,
// coloured by the text colour around them. Decorative; the text beside each
// icon says the same thing.
const ICONS = {
  compass: <><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></>,
  building: <path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M3 21h18M8 8h3M8 12h3M8 16h3" />,
  clipboard: <><rect x="8" y="3" width="8" height="4" rx="1" /><path d="M8 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2M9 12h6M9 16h4" /></>,
  eyeOff: <path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-2.6 3.2M6.6 6.6C4.3 8.1 3 12 3 12s4 6 9 6a9 9 0 0 0 4.4-1.2M9.9 9.9a3 3 0 0 0 4.2 4.2" />,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  scale: <path d="M12 3v18M7 21h10M5 7h14M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><circle cx="17" cy="9" r="2.5" /><path d="M16 14.5a5 5 0 0 1 5 5.5" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  shieldCheck: <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6zM9 12l2 2 4-4" />,
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  cookie: <path d="M12 3a9 9 0 1 0 9 9 3 3 0 0 1-3-3 3 3 0 0 1-3-3 3 3 0 0 1-3-3zM8.5 11.5h.01M12 16h.01M15.5 14.5h.01" />,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  alert: <path d="M12 3.5l9 16H3zM12 10v4M12 17h.01" />,
  refresh: <path d="M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20v-4h-4" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  notice: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M8.5 12.5h6" /><path d="M8 17c1.2-1.2 2.2-1.2 2.8 0s1.6 1 3.2-.8" /></>,
  fingerprint: <path d="M7 18.5A10 10 0 0 1 6 13a6 6 0 0 1 12 0v1M12 13v3a8 8 0 0 1-1.6 4.8M9 13a3 3 0 0 1 6 0v2.5a12 12 0 0 1-.9 4.5M17.6 18.5A14 14 0 0 0 18 16M4.5 9a8.5 8.5 0 0 1 15 0" />,
  radar: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><path d="M12 12l6.4-6.4" /><circle cx="15.5" cy="9.5" r="1" /></>,
  chat: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12zM8.5 11h7M8.5 14h4" />,
  scan: <><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><circle cx="12" cy="12" r="3.2" /><path d="M14.4 14.4L17 17" /></>,
  overlap: <><rect x="3" y="3" width="11" height="11" rx="2" /><rect x="10" y="10" width="11" height="11" rx="2" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  handshake: (
    <>
      <path d="m11 17 2 2a1 1 0 1 0 3-3" />
      <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.883-3.883a1 1 0 0 0-1.414 0L10.589 9.83" />
      <path d="m15 5 4 4" />
      <path d="m18 12-3.89-3.89a1 1 0 0 0-1.414 0L10.59 9.83" />
      <path d="m2 12 5-5" />
      <path d="m9 19 3 3" />
      <path d="m5 18 3.35-3.35a1 1 0 0 1 1.414 0l.21.21a1 1 0 0 0 1.414 0L15 13" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="M9 8V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18" />
    </>
  ),
  presentation: (
    <>
      <path d="M2 4h20" />
      <path d="M20 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4" />
      <path d="m7 20 5-5 5 5" />
    </>
  ),
  newspaper: (
    <>
      <path d="M4 22h15a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v15a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-8c0-1.1.9-2 2-2h2" />
      <path d="M18 14h-8M15 18h-5M10 7h7v4h-7z" />
    </>
  ),
  // WP151 (docs/lab/open-tools-spec.md): category icons for the open tools
  // directory — a hashing grid, layered model nodes, a provenance seal, a
  // chain link for the free services, an open book for directories, and the
  // site's own flame for "From Asmita" entries. Same 24px grid, 1.75 stroke.
  hashgrid: <><rect x="4" y="4" width="5" height="5" rx="1" /><rect x="9.5" y="4" width="5" height="5" rx="1" /><rect x="15" y="4" width="5" height="5" rx="1" /><rect x="4" y="9.5" width="5" height="5" rx="1" /><rect x="9.5" y="9.5" width="5" height="5" rx="1" /><rect x="15" y="9.5" width="5" height="5" rx="1" /><rect x="4" y="15" width="5" height="5" rx="1" /><rect x="9.5" y="15" width="5" height="5" rx="1" /><rect x="15" y="15" width="5" height="5" rx="1" /></>,
  layers: <><path d="M12 3.5l8.5 4.5L12 12.5 3.5 8 12 3.5z" /><path d="M3.5 12.5L12 17l8.5-4.5" /><path d="M3.5 17L12 21.5 20.5 17" /></>,
  seal: <><circle cx="12" cy="9.5" r="5.5" /><path d="M12 6.5v6M9.8 9.5h4.4" /><path d="M9.2 14 8 21l4-2 4 2-1.2-7" /></>,
  link: <><path d="M10 13.2a4.6 4.6 0 0 0 6.5 0l2.2-2.2a4.6 4.6 0 0 0-6.5-6.5l-1.2 1.2" /><path d="M14 10.8a4.6 4.6 0 0 0-6.5 0l-2.2 2.2a4.6 4.6 0 0 0 6.5 6.5l1.2-1.2" /></>,
  book: <><path d="M12 6.3C10.4 4.9 8 4.4 4 4.4v13.2c4 0 6.5.5 8 2 1.5-1.5 4-2 8-2V4.4c-4 0-6.4.5-8 1.9z" /><path d="M12 6.3v13.3" /></>,
  flame: <path d="M12 3.2c.7 2.4-.4 4.4-1.7 5.9-1.2 1.4-2.5 2.9-2.5 5a4.9 4.9 0 0 0 9.8.3c0-1.6-.7-3-1.7-4.1-.6-.7-1.4-1.3-1.8-2.1-.2.8-.1 1.6.3 2.3-2.6-1-3-4.4-2.4-7.3z" />,
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20, className = "" }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`shrink-0 ${className}`}
    >
      {ICONS[name]}
    </svg>
  );
}
