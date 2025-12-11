'use client';

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { OwnerDetail } from "@/lib/types";
import { apiFetch } from "@/lib/api-client";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "https://api.rubypets.com";

export default function OwnerPage() {
  return (
    <Suspense fallback={<PageShell loading ownerId="" onUpdated={() => {}} />}>
      <OwnerContent />
    </Suspense>
  );
}

function OwnerContent() {
  const searchParams = useSearchParams();
  const ownerId = useMemo(() => searchParams.get("id") || "", [searchParams]);

  const [owner, setOwner] = useState<OwnerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ownerId) {
      setOwner(null);
      setError("缺少 id 參數");
      return;
    }
    setLoading(true);
    setError(null);
    fetchOwner(ownerId)
      .then(({ owner, error }) => {
        setOwner(owner);
        setError(error);
      })
      .finally(() => setLoading(false));
  }, [ownerId]);

  return <PageShell loading={loading} error={error} owner={owner} ownerId={ownerId} onUpdated={setOwner} />;
}

function PageShell({
  loading,
  error,
  owner,
  ownerId,
  onUpdated
}: {
  loading?: boolean;
  error?: string | null;
  owner?: OwnerDetail | null;
  ownerId: string;
  onUpdated: (owner: OwnerDetail | null) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [csvData, setCsvData] = useState<Array<{ city: string; region: string }>>([]);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!showForm || csvData.length > 0) return;
    void loadCsv();
  }, [showForm, csvData.length]);

  const cities = useMemo(() => Array.from(new Set(csvData.map((r) => r.city))), [csvData]);
  const regions = useMemo(() => csvData.filter((r) => r.city === city).map((r) => r.region), [csvData, city]);

  async function loadCsv() {
    try {
      const res = await fetch("/data_taiwan_districts.csv");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const text = await res.text();
      const rows = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.split(","))
        .filter((cols) => cols.length >= 2)
        .map((cols) => ({ city: cols[0].trim(), region: cols[1].trim() }));
      if (rows.length === 0) {
        throw new Error("檔案為空或格式不符");
      }
      setCsvData(rows);
      setCsvError(null);
    } catch (err) {
      setCsvError(`無法載入行政區資料：${String(err)}`);
    }
  }

  async function saveLocation() {
    if (!city || !region || !ownerId) {
      setSaveError("請選擇縣市與行政區");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const { data } = await apiFetch<OwnerDetail>(`/api/owners/${ownerId}/location`, {
        method: "POST",
        body: JSON.stringify({ city, region })
      });
      onUpdated(data);
      setShowForm(false);
    } catch (err) {
      const status = (err as { status?: number }).status;
      const details = (err as { details?: unknown }).details;
      setSaveError(`儲存失敗（${status ?? "?"}）：${typeof details === "string" ? details : JSON.stringify(details)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-sm text-white/80 hover:text-white">
          ← 返回首頁
        </Link>
        <h1 className="text-xl font-semibold text-white">飼主資訊</h1>
      </div>

      <section className="rounded-xl border border-white/10 bg-white/90 p-4 shadow-sm">
        {loading && <p className="text-sm text-slate-600">載入中...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!error && !owner && !loading && <p className="text-sm text-slate-600">找不到飼主資料。</p>}
        {owner && (
          <div className="space-y-2 text-sm text-slate-800">
            <p>
              <span className="font-medium text-slate-600">UUID：</span>
              <span className="font-mono text-slate-900 break-all">{owner.uuid}</span>
            </p>
            <p>
              <span className="font-medium text-slate-600">Email：</span>
              {owner.email || "（未提供）"}
            </p>
            <p>
              <span className="font-medium text-slate-600">暱稱：</span>
              {owner.displayName}
            </p>
            <p>
              <span className="font-medium text-slate-600">頭像：</span>
              {owner.avatarUrl || "（未設定）"}
            </p>
            <p>
              <span className="font-medium text-slate-600">可建立寵物數上限：</span>
              {owner.maxPets}
            </p>
            <p>
              <span className="font-medium text-slate-600">建立時間：</span>
              {owner.createdAt}
            </p>
            <p>
              <span className="font-medium text-slate-600">最後更新：</span>
              {owner.updatedAt}
            </p>
            <p>
              <span className="font-medium text-slate-600">狀態：</span>
              {owner.isActive ? "啟用" : "停用"}
            </p>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-white/10 bg-white/90 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">新增資料</h2>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800"
          >
            {showForm ? "收起" : "填寫所在地"}
          </button>
        </div>
        {showForm && (
          <div className="mt-4 space-y-3">
            {csvError && <p className="text-sm text-red-600">{csvError}</p>}
            <div className="space-y-1">
              <label className="text-sm text-slate-700">縣市</label>
              <select
                className="w-full rounded border border-slate-200 p-2 text-sm"
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  setRegion("");
                }}
              >
                <option value="">請選擇</option>
                {cities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm text-slate-700">行政區</label>
              <select
                className="w-full rounded border border-slate-200 p-2 text-sm"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                disabled={!city}
              >
                <option value="">請先選縣市</option>
                {regions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={saveLocation}
                disabled={saving}
                className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                {saving ? "儲存中..." : "儲存"}
              </button>
              {saveError && <span className="text-sm text-red-600">{saveError}</span>}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

async function fetchOwner(id: string): Promise<{ owner: OwnerDetail | null; error: string | null }> {
  try {
    const res = await fetch(`${API_BASE}/api/owners/${id}`);
    if (!res.ok) {
      const text = await res.text();
      return { owner: null, error: `載入失敗（${res.status}）：${text || res.statusText}` };
    }
    const data = (await res.json()) as OwnerDetail;
    return { owner: data, error: null };
  } catch (err) {
    return { owner: null, error: `載入失敗：${String(err)}` };
  }
}
