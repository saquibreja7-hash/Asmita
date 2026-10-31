import type { Metadata } from "next";
import { cookies } from "next/headers";
import { IBM_Plex_Mono, Newsreader } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "@fontsource/noto-sans-devanagari/400.css";
import "@fontsource/noto-sans-devanagari/700.css";
import "@fontsource/noto-serif-devanagari/400.css";
import "./globals.css";

const siteUrl = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://meriasmita.org");
const siteTitle = "Asmita - Dignity restoration support";
const siteDescription =
  "Free, confidential support for Indian women reporting non-consensual intimate content.";

/*
 * Editorial system (see DESIGN.md): serif for headings at weight 400 only,
 * monospace for every body and UI string.
 * Newsreader stands in for Untitled Serif; IBM Plex Mono for ABC Diatype Mono.
 */
const serif = Newsreader({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  display: "swap",
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono-ui",
  subsets: ["latin"],
  weight: ["400", "500"],
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
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const lang = cookieStore.get("asmita_lang")?.value === "hi" ? "hi" : "en";
  return (
    <html
      lang={lang}
      className={`${serif.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
