import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Noto_Sans } from "next/font/google";
import { COOKIE_BASE_NAMES } from "@/lib/cookie-names";
import devanagariRegularWoff2 from "@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff2";
import "@fontsource/noto-sans-devanagari/400.css";
import "@fontsource/noto-sans-devanagari/500.css";
import "@fontsource/noto-sans-devanagari/600.css";
import "./globals.css";

const siteUrl = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://meriasmita.org");
const siteTitle = "Asmita - Dignity restoration support";
const siteDescription =
  "Free, confidential support for Indian women reporting non-consensual intimate content.";

/*
 * One plain sans for everything (see docs/design/03-design-system.md).
 * Noto Sans pairs with Noto Sans Devanagari, so English and Hindi match.
 */
const sans = Noto_Sans({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: siteUrl,
  applicationName: "Asmita",
  title: {
    default: siteTitle,
    template: "%s | Asmita",
  },
  description: siteDescription,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: "/",
    siteName: "Asmita",
    images: [
      {
        url: "/asmita-link-preview.png",
        width: 1200,
        height: 630,
        alt: "Asmita - Dignity restoration support",
      },
    ],
    locale: "en_IN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: [
      {
        url: "/asmita-link-preview.png",
        alt: "Asmita - Dignity restoration support",
      },
    ],
  },
  // All font sizes are in rem, so the page follows the OS and browser text
  // size; this meta tells mobile WebViews it is safe to scale the text.
  other: {
    "text-scale": "scale",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const lang = cookieStore.get(COOKIE_BASE_NAMES.language)?.value === "hi" ? "hi" : "en";
  return (
    <html
      lang={lang}
      className={`${sans.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {/* Hindi pages: the Devanagari text is set in Noto Sans Devanagari,
            whose @font-face only starts loading once the stylesheet has been
            parsed — late enough for the glyphs to pop in on slow connections.
            Preload the same regular-weight file the CSS requests (the bundler
            hashes both references identically). crossOrigin is required for a
            font preload to be reused by the CSS font fetch. */}
        {lang === "hi" && (
          <link
            rel="preload"
            href={devanagariRegularWoff2}
            as="font"
            type="font/woff2"
            crossOrigin="anonymous"
          />
        )}
        {children}
      </body>
    </html>
  );
}
