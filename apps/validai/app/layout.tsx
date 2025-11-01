import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { APP_NAME, APP_DESCRIPTION } from "@/lib/constants/app";
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: APP_NAME,
  description: APP_DESCRIPTION,
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  display: "swap",
  subsets: ["latin"],
});

/**
 * Root layout - minimal setup without locale-specific providers.
 * Locale-specific providers are in app/[locale]/layout.tsx
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html suppressHydrationWarning>
      <body className={`${geistSans.className} antialiased`}>
        {children}
      </body>
    </html>
  );
}
