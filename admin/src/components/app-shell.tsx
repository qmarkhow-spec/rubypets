"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type NavItem = {
  href: string;
  label: string;
  children?: NavItem[];
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "總覽" },
  {
    href: "/review",
    label: "審核管理",
    children: [
      { href: "/review", label: "Overview" },
      { href: "/review/kyc", label: "實名認證審核" }
    ]
  },
  {
    href: "/admin",
    label: "管理員管理",
    children: [
      { href: "/admin", label: "總覽" },
      { href: "/admin/accounts", label: "管理員帳號" }
    ]
  },
  { href: "/login", label: "登入/Token" }
];

const envLabel = process.env.NEXT_PUBLIC_ENV_LABEL ?? "dev";

export function AppShell({
  title,
  intro,
  actions,
  children,
  requireAuth = true
}: {
  title: string;
  intro?: string;
  actions?: ReactNode;
  children: ReactNode;
  requireAuth?: boolean;
}) {
  const pathname = usePathname();

  const renderNav = (item: NavItem) => {
    const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
    return (
      <div key={item.href} className="side-link-group">
        <Link href={item.href} className={`side-link${active ? " active" : ""}`}>
          {item.label}
        </Link>
        {item.children ? (
          <div className="side-children">
            {item.children.map((child) => {
              const childActive = pathname === child.href;
              return (
                <Link key={child.href} href={child.href} className={`side-link child${childActive ? " active" : ""}`}>
                  {child.label}
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="layout">
      <AuthGate enabled={requireAuth}>
        <aside className="sidebar">
          <div className="brand">
            <span className="dot" aria-hidden />
            <span>Rubypets Admin</span>
          </div>
          <div className="side-links">{NAV_ITEMS.map(renderNav)}</div>
          <div className="env-pill">環境：{envLabel}</div>
        </aside>
        <div className="content">
          <header className="top-bar">
            <h1 className="top-title">{title}</h1>
            <Link href="/login" className="btn ghost">
              登入/Token
            </Link>
          </header>
          {intro ? <p className="page-intro">{intro}</p> : null}
          {actions ? <div className="btn-row" style={{ marginTop: 4 }}>{actions}</div> : null}
          <div className="page-body">{children}</div>
        </div>
      </AuthGate>
    </div>
  );
}

function AuthGate({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  if (!enabled) return <>{children}</>;
  if (typeof window === "undefined") return null;
  const token = window.localStorage.getItem("ADMIN_TOKEN");
  if (!token) {
    window.location.href = "/admin-login";
    return null;
  }
  return <>{children}</>;
}
