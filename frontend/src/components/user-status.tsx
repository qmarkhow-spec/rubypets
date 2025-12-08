'use client';

import Link from "next/link";
import { useAuth } from "@/lib/auth";

export function UserStatus() {
  const { user, logout, loading } = useAuth();

  if (loading) {
    return <span className="text-xs text-slate-500">載入中…</span>;
  }

  if (!user) {
    return (
      <Link href="/login" className="text-xs text-blue-600 hover:underline">
        未登入，前往登入
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <div className="flex flex-col leading-tight">
        <span className="font-medium">{user.displayName || user.handle}</span>
        <span className="text-xs text-slate-500">{user.email ?? "未提供 email"}</span>
      </div>
      <button
        type="button"
        onClick={logout}
        className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
      >
        登出
      </button>
    </div>
  );
}
