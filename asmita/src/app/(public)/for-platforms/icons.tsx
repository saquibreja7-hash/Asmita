// Line icons for /for-platforms. 24px grid, stroke only, colour from CSS.
import type { ReactNode } from "react";

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const icons = {
  clock: (
    <Svg>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Svg>
  ),
  timer: (
    <Svg>
      <path d="M10 2.5h4M12 2.5v2.5" />
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 13.5 15 10.5" />
    </Svg>
  ),
  shield: (
    <Svg>
      <path d="M12 3 5 6v5.5c0 4.2 3 7.6 7 9.5 4-1.9 7-5.3 7-9.5V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </Svg>
  ),
  fingerprint: (
    <Svg>
      <path d="M7.5 6.2A7 7 0 0 1 19 11.5c0 1.6-.2 3.1-.6 4.5" />
      <path d="M5 9.5a7 7 0 0 0-.2 1.9c0 1.4.2 2.7.6 3.9" />
      <path d="M8.5 19.5c-.8-1.9-1.2-4-1.2-6.2a4.7 4.7 0 0 1 9.4 0c0 .8 0 1.6-.1 2.4" />
      <path d="M12 13.3c0 2.6.5 5 1.4 7.2" />
      <path d="M16.2 19.6c.2-.6.3-1.2.4-1.9" />
    </Svg>
  ),
  radar: (
    <Svg>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 12 18 6" />
      <circle cx="15.2" cy="9.2" r="0.6" fill="currentColor" />
    </Svg>
  ),
  inbox: (
    <Svg>
      <path d="M4 13.5 6.5 5h11l2.5 8.5V19H4v-5.5Z" />
      <path d="M4 13.5h4.5l1.5 2.5h4l1.5-2.5H20" />
    </Svg>
  ),
  recheck: (
    <Svg>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 4.5v4h-4" />
      <path d="m9 12 2 2 4-4" />
    </Svg>
  ),
  check: (
    <Svg>
      <path d="m5.5 12.5 4 4 9-9" />
    </Svg>
  ),
  lock: (
    <Svg>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </Svg>
  ),
};

export type IconName = keyof typeof icons;
