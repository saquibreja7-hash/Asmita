import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Noto_Sans } from "next/font/google";
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
      className={`${sans.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {children}
      </body>
    </html>
  );
}
