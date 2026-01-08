import type { Metadata } from "next";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});


const UserStatus = dynamic(() => import("@/components/user-status").then((mod) => mod.UserStatus), {
  ssr: false
});
export const metadata: Metadata = {
  title: "Rubypets ?ç¼?§å¶??,
  description: "?å?ç«?API ä¸²æ¥?æ¸¬è©¦é¢??,
};


export const dynamic = "force-dynamic";
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
                  Rubypets ?§å¶??                </Link>
                <div className="flex items-center gap-6 text-white">
                  <nav className="flex items-center gap-4 text-sm text-white/80">
                    <Link href="/" className="hover:text-white">
                      é¦é?
                    </Link>
                    <Link href="/search" className="hover:text-white">
                      ?å?
                    </Link>
                  <Link href="/login" className="hover:text-white">
                    ?»å¥
                  </Link>
                  <Link href="/debug" className="hover:text-white">
                    Debug
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

