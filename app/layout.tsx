import type { Metadata } from "next";
import { Funnel_Display, Funnel_Sans, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const funnelDisplay = Funnel_Display({
  variable: "--font-funnel-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
const funnellsans = Funnel_Sans({
  variable: "--font-funnel-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://minidev.fun'),
  title: "MiniDev | Vibecode Farcaster Miniapps",
  description: "Create custom mini apps with AI. Generate, preview, and deploy mini applications instantly with MiniDev's intelligent development platform.",
  keywords: [
    "MiniDev", "AI mini app creator", "artificial intelligence", "app development",
    "AI automation", "mini apps", "AI tools", "app generator",
    "MiniDev platform", "AI-powered development", "automated app creation",
    "best app creator", "AI for development", "create apps with AI",
    "automated development", "AI development tools", "mini app generator"
  ],
  authors: [{ name: "MiniDev Team" }],
  robots: "index, follow",
  alternates: {
    canonical: 'https://minidev.fun',
  },
  openGraph: {
    title: "MiniDev | Vibecode Farcaster Miniapps",
    siteName: "MiniDev",
    url: "https://minidev.fun",
    type: "website",
    locale: "en_US",
    description: "Create custom mini apps with AI. Generate, preview, and deploy mini applications instantly with MiniDev's intelligent development platform.",
    images: [
      {
        url: "https://minidev.fun/og-image.png",
        width: 1200,
        height: 630,
        alt: "MiniDev Platform Preview",
      },
    ],
  },
  twitter: {
    site: "@minidev_fun",
    creator: "@minidev_fun",
    card: "summary_large_image",
    title: "MiniDev | Vibecode Farcaster Miniapps",
    description: "Create custom mini apps with AI. Generate, preview, and deploy mini applications instantly with MiniDev's intelligent development platform.",
    images: [
      {
        url: "https://minidev.ai/og-image.png",
        alt: "MiniDev Platform Preview",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${funnelDisplay.variable} ${funnellsans.variable} antialiased`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
