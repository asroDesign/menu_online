import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { PlatformBrandingRuntime } from "@/components/brand";
import { getSiteUrl } from "@/lib/site-url";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  applicationName: "MenuPeak",
  title: "منوی دیجیتال | کاتالوگ آنلاین، منوی QR و سفارش‌گیری گارسون",
  description:
    "پلتفرم ساخت منوی دیجیتال و کاتالوگ آنلاین برای کافه و رستوران، همراه با پنل سفارش‌گیری گارسون و داشبورد مدیریت.",
  keywords: ["منوی دیجیتال", "منوی QR رستوران", "سفارش آنلاین رستوران", "صندوق رستوران", "مدیریت کافه", "نرم‌افزار رستوران"],
  icons: { icon: "/icon.svg", shortcut: "/icon.svg" },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  openGraph: {
    type: "website",
    locale: "fa_IR",
    siteName: "MenuPeak",
    title: "منوی دیجیتال و مدیریت یکپارچه رستوران | منوپیک",
    description: "منوی QR، سفارش‌گیری، صندوق، انبار و حسابداری رستوران در یک مسیر؛ با پشتوانه بیش از ۲۰ سال تجربه رستوران‌داری.",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "منوی دیجیتال و مدیریت رستوران | منوپیک",
    description: "از منوی QR تا سفارش‌گیری و مدیریت رستوران؛ آشنا با نیازهای واقعی کافه و رستوران.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2563eb",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl" data-theme="menu" data-scroll-behavior="smooth">
      <body className="min-h-dvh antialiased"><PlatformBrandingRuntime />{children}</body>
    </html>
  );
}
