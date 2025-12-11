'use client';

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState, useId, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import type { OwnerDetail } from "@/lib/types";
import { apiFetch } from "@/lib/api-client";
import { TAIWAN_CITIES } from "@/data/taiwan-districts";

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
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [idFrontFile, setIdFrontFile] = useState<File | null>(null);
  const [idBackFile, setIdBackFile] = useState<File | null>(null);
  const [idSelfieFile, setIdSelfieFile] = useState<File | null>(null);

  useEffect(() => {
    if (!showForm || csvData.length > 0) return;
    setCsvData(
      TAIWAN_CITIES.flatMap((c) => c.regions.map((r) => ({ city: c.code, region: r.code })))
    );
  }, [showForm, csvData.length]);

  const cities = useMemo(() => TAIWAN_CITIES, []);
  const regions = useMemo(
    () => (city ? cities.find((c) => c.code === city)?.regions ?? [] : []),
    [city, cities]
  );

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
                  <option key={c.code} value={c.code}>
                    {c.label}
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
                  <option key={r.code} value={r.code}>
                    {r.label}
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

      <section className="rounded-xl border border-white/10 bg-white/90 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">實名認證</h2>
          <p className="text-xs text-slate-600">請依序上傳三張照片供審核</p>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <FileUploadField
            label="上傳身分證正面"
            helper="點擊下方 85.7mm x 54mm 的方塊上傳"
            file={idFrontFile}
            onChange={setIdFrontFile}
            boxStyle={{ width: "85.7mm", maxWidth: "100%", height: "54mm" }}
            sizeHint="85.7mm x 54mm"
          />
          <FileUploadField
            label="上傳身分證背面"
            helper="點擊下方 85.7mm x 54mm 的方塊上傳"
            file={idBackFile}
            onChange={setIdBackFile}
            boxStyle={{ width: "85.7mm", maxWidth: "100%", height: "54mm" }}
            sizeHint="85.7mm x 54mm"
          />
          <FileUploadField
            label="上傳手持身分證正面並和自己拍照"
            helper="尺寸不拘，請確保證件與本人清晰可辨"
            file={idSelfieFile}
            onChange={setIdSelfieFile}
            boxStyle={{ minHeight: "200px" }}
            spanCols
          />
        </div>
      </section>
    </div>
  );
}

function FileUploadField({
  label,
  helper,
  file,
  onChange,
  boxStyle,
  spanCols = false,
  sizeHint
}: {
  label: string;
  helper?: string;
  file: File | null;
  onChange: (file: File | null) => void;
  boxStyle?: CSSProperties;
  spanCols?: boolean;
  sizeHint?: string;
}) {
  const inputId = useId();

  return (
    <div className={`space-y-2 ${spanCols ? "md:col-span-2" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-slate-800">{label}</p>
          {helper && <p className="text-xs text-slate-500">{helper}</p>}
        </div>
        <span className="truncate text-xs text-slate-500">
          {file ? `已選擇：${file.name}` : "尚未選擇檔案"}
        </span>
      </div>
      <label
        htmlFor={inputId}
        className="flex w-full cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-slate-300 bg-white/60 px-3 py-4 text-sm text-slate-600 transition hover:border-emerald-500 hover:text-emerald-700"
        style={boxStyle}
      >
        <div className="space-y-1 text-center">
          <div className="text-sm font-semibold">點擊上傳</div>
          <div className="text-xs text-slate-500">
            {sizeHint ? `${sizeHint}｜支援圖片檔案` : "支援圖片檔案"}
          </div>
        </div>
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
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
