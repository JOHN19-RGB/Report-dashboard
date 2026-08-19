import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "cyrillic"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const baseUrl = `${protocol}://${host}`;
  const title = "Ажлын тайлан · 2026";
  const description = "Багийн ажлын гүйцэтгэл, ачаалал болон сарын өөрчлөлтийн интерактив тайлан.";

  return {
    metadataBase: new URL(baseUrl),
    title,
    description,
    icons: { icon: "/cody-logo.svg", shortcut: "/cody-logo.svg" },
    openGraph: {
      title,
      description,
      type: "website",
      url: baseUrl,
      images: [{ url: `${baseUrl}/og.png`, width: 1200, height: 630, alt: "2026 оны ажлын гүйцэтгэлийн тайлан" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${baseUrl}/og.png`],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="mn">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
