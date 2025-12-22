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
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[var(--background)] text-[var(--text)]`}>
        <AuthProvider>
          <div className="min-h-screen hero-shell">
            <header className="border-b border-white/10 bg-white/5 backdrop-blur">
              <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
                <Link href="/" className="text-lg font-semibold text-white drop-shadow">
                  Rubypets 控制台
                </Link>
                <div className="flex items-center gap-6 text-white">
                  <nav className="flex items-center gap-4 text-sm text-white/80">
                    <Link href="/" className="hover:text-white">
                      首頁
                    </Link>
                  <Link href="/login" className="hover:text-white">
                    登入
                  </Link>
                  <Link href="/debug" className="hover:text-white">
                    Debug
                  </Link>
                  <Link href="/admin/posts" className="hover:text-white">
                    貼文管理
                  </Link>
                  </nav>
                  <UserStatus />
                </div>
              </div>
            </header>
            <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
