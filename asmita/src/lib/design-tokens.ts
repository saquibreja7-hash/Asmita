/** Design tokens matched to thorn.org (extracted 2026-08-06). */
export const designTokens = {
  colors: {
    coral: "#f87b5e",
    coralDeep: "#f25c3a",
    midnight: "#264653",
    heading: "#335d70",
    warmGray: "#f7f6f5",
    mint: "#d7eae0",
    purple: "#7255c9",
    purpleSoft: "#bfa4fa",
    peach: "#ffd69e",
    border: "#c8c6c4",
    white: "#ffffff",
    // Legacy aliases used across the app
    ink: "#264653",
    muted: "#4b6d7d",
    paper: "#f7f6f5",
    surface: "#ffffff",
    teal: "#264653",
    tealDark: "#1a343d",
    tealSoft: "#d7eae0",
    saffron: "#f87b5e",
    rose: "#cb4c3c",
  },
  fontStack: {
    sans: '"Rubik", "Noto Sans Devanagari", system-ui, sans-serif',
    display: '"Red Hat Display", "Noto Sans Devanagari", system-ui, sans-serif',
    mono: '"Geist Mono", ui-monospace, monospace',
  },
  spacing: {
    xs: "0.5rem",
    sm: "0.75rem",
    md: "1rem",
    lg: "1.5rem",
    xl: "2rem",
    section: "5rem",
  },
  radius: {
    button: "10px",
    box: "15px",
  },
} as const;
