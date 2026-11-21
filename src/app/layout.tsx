import type { Metadata } from "next";
import { themeInitScript } from "@/components/theme-toggle";
import "./globals.css";

// Every page shows live data or depends on who's signed in, so never pre-render.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "DGS Sports Datahub",
  description: "Live scores, stats and news from the DGS Sports Data Analytics Club",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link rel="preconnect" href="https://api.fontshare.com" />
        {/* Satoshi is hosted on Fontshare (free for personal and commercial use). */}
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=swap"
        />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
