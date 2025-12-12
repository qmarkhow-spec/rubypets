"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const NAV_LINKS = [
  { href: "/", label: "總覽" },
  { href: "/owners", label: "飼主審核" },
  { href: "/login", label: "登入/Token" }
];

const envLabel = process.env.NEXT_PUBLIC_ENV_LABEL ?? "dev";

export function AppShell({
  title,
  intro,
  actions,
  children
}: {
  title: string;
  intro?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <main>
      <header className="top-nav">
        <div className="brand">
          <span className="dot" aria-hidden />
          <span>Rubypets Admin</span>
        </div>
        <nav className="nav-links" aria-label="Primary">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));
            return (
              <Link key={link.href} href={link.href} className={`nav-link${active ? " active" : ""}`}>
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="env-pill">環境：{envLabel}</div>
      </header>

      <div className="hero">
        <h1>{title}</h1>
        {intro ? <p>{intro}</p> : null}
        {actions ? <div className="btn-row" style={{ marginTop: 10 }}>{actions}</div> : null}
      </div>

      {children}
    </main>
  );
}
