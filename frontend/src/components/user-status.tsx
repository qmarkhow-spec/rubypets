'use client';

import Link from "next/link";
import { useAuth } from "@/lib/auth";

export function UserStatus() {
  const { user, logout, loading } = useAuth();

  if (loading) {
    return <span className="text-xs text-slate-500">載入中...</span>;
  }

  if (!user) {
    return (
      <Link href="/login" className="text-xs text-blue-600 hover:underline">
        立即登入 / 註冊
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <div className="flex flex-col leading-tight">
        <Link
          href={`/owners?id=${encodeURIComponent(user.id)}`}
          className="font-medium text-blue-100 underline-offset-4 hover:text-white hover:underline"
        >
          {user.displayName || user.handle}
        </Link>
        <span className="text-xs text-slate-500">{user.email ?? "未留 email"}</span>
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
