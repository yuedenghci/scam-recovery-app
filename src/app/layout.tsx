import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Ma_Shan_Zheng } from "next/font/google";

import { PwaRegister } from "@/components/pwa/PwaRegister";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Handwriting-style body for progress letters; loaded for mobile + desktop. */
const maShanZheng = Ma_Shan_Zheng({
  weight: "400",
  variable: "--font-progress-letter",
  subsets: ["latin"],
  display: "swap",
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "疗愈陪伴",
    template: "%s · 疗愈陪伴",
  },
  description:
    "在手机上使用的支持对话、日常恢复与成长记录网页应用。（可添加到主屏幕，像 App 一样打开）",
  applicationName: "疗愈陪伴",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "疗愈陪伴",
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  icons: {
    icon: [{ url: "/icons/pwa-maskable-placeholder.png", type: "image/png" }],
    apple: [{ url: "/icons/pwa-maskable-placeholder.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#57534e" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} ${maShanZheng.variable} h-full antialiased`}
    >
      <body className="min-h-dvh flex flex-col bg-[#f7f4ef]">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
