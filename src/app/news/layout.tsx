import type { Metadata } from "next";
import { Libre_Franklin, Newsreader } from "next/font/google";
import "./news.css";

// Scoped to /news on purpose: the rest of the app keeps Satoshi. Both faces cover Vietnamese.
const newsreader = Newsreader({
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: "variable",
  style: ["normal", "italic"],
  axes: ["opsz"],
  display: "swap",
  variable: "--font-newsreader",
});
const franklin = Libre_Franklin({
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: ["400", "600", "700"],
  display: "swap",
  variable: "--font-franklin",
});

// Open Graph image URLs must be absolute; without this, link previews point at localhost.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "News · DGS Sports Datahub",
  description: "Recaps, analysis and news from the DGS Sports Data Analytics Club.",
};

export default function NewsLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${newsreader.variable} ${franklin.variable}`}>{children}</div>;
}
