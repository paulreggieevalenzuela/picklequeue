import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import { StoreSync } from "@/components/StoreSync";
import "./globals.css";

const barlow = Barlow({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-barlow" });
const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-barlow-condensed",
});

export const metadata: Metadata = {
  title: { default: "Pickle Queue", template: "%s | Pickle Queue" },
  description: "Fair rotation, live scoring and a courtside board for pickleball open play.",
  applicationName: "Pickle Queue",
  appleWebApp: { capable: true, title: "Pickle Queue", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#1f4e6b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${barlow.variable} ${barlowCondensed.variable}`}>
      <body className="min-h-dvh antialiased">
        <StoreSync />
        {children}
      </body>
    </html>
  );
}
