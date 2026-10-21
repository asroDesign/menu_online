import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { PlatformBrandingRuntime } from "@/components/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: "منوی دیجیتال | کاتالوگ آنلاین، منوی QR و سفارش‌گیری گارسون",
  description:
    "پلتفرم ساخت منوی دیجیتال و کاتالوگ آنلاین برای کافه و رستوران، همراه با پنل سفارش‌گیری گارسون و داشبورد مدیریت.",
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
