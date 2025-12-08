import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { UserStatus } from "@/components/user-status";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rubypets 開發控制台",
  description: "前後端 API 串接與測試面板",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-50 text-slate-900`}>
        <AuthProvider>
          <div className="min-h-screen">
            <header className="border-b bg-white/80 backdrop-blur">
              <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
                <Link href="/" className="text-lg font-semibold">
                  Rubypets 控制台
                </Link>
                <div className="flex items-center gap-6">
                  <nav className="flex items-center gap-4 text-sm text-slate-600">
                    <Link href="/">首頁</Link>
                    <Link href="/login">登入</Link>
                    <Link href="/debug">Debug</Link>
                  </nav>
                  <UserStatus />
                </div>
              </div>
            </header>
            <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
