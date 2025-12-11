'use client';

import Link from "next/link";
import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  useId,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type SyntheticEvent
} from "react";
import { useSearchParams } from "next/navigation";
import type { OwnerDetail } from "@/lib/types";
import { apiFetch } from "@/lib/api-client";
import { TAIWAN_CITIES } from "@/data/taiwan-districts";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "https://api.rubypets.com";

type CropTarget = "front" | "back";

type CropState = {
  target: CropTarget | null;
  imageUrl: string | null;
  file: File | null;
  scale: number;
  baseScale: number;
  offset: { x: number; y: number };
  naturalWidth: number;
  naturalHeight: number;
};

const CROP_CANVAS_WIDTH = 857;
const CROP_CANVAS_HEIGHT = 540;

function createInitialCropState(): CropState {
  return {
    target: null,
    imageUrl: null,
    file: null,
    scale: 1,
    baseScale: 1,
    offset: { x: 0, y: 0 },
    naturalWidth: 0,
    naturalHeight: 0
  };
}

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
  const [idFrontPreview, setIdFrontPreview] = useState<string | null>(null);
  const [idBackPreview, setIdBackPreview] = useState<string | null>(null);
  const [idSelfiePreview, setIdSelfiePreview] = useState<string | null>(null);
  const [selfieAspectRatio, setSelfieAspectRatio] = useState<number | null>(null);
  const [idFrontFile, setIdFrontFile] = useState<File | null>(null);
  const [idBackFile, setIdBackFile] = useState<File | null>(null);
  const [idSelfieFile, setIdSelfieFile] = useState<File | null>(null);
  const [cropState, setCropState] = useState<CropState>(createInitialCropState);
  const [cropBoxSize, setCropBoxSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0
  });
  const cropBoxRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

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
  const isCropping = Boolean(cropState.target && cropState.imageUrl);
  const minScale = cropState.baseScale || 1;
  const maxScale = minScale * 3;
  const clampedScale = Math.min(Math.max(cropState.scale, minScale), maxScale);
  const selfieBoxStyle: CSSProperties =
    selfieAspectRatio && selfieAspectRatio > 0
      ? {
          width: "100%",
          maxWidth: "100%",
          aspectRatio: selfieAspectRatio,
          maxHeight: "500px"
        }
      : { minHeight: "200px" };

  useEffect(() => {
    if (!isCropping) return;
    const updateSize = () => {
      if (!cropBoxRef.current) return;
      const rect = cropBoxRef.current.getBoundingClientRect();
      setCropBoxSize({ width: rect.width, height: rect.height });
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, [isCropping]);

  useEffect(() => {
    if (!isCropping || !cropBoxSize.width || !cropState.naturalWidth || !cropState.naturalHeight) return;
    const nextBaseScale = Math.max(
      cropBoxSize.width / cropState.naturalWidth,
      cropBoxSize.height / cropState.naturalHeight
    );
    setCropState((prev) => {
      const hasSameBase = Math.abs(prev.baseScale - nextBaseScale) < 0.0001;
      const nextScale = Math.max(nextBaseScale, prev.scale);
      if (hasSameBase && prev.scale === nextScale && prev.offset.x === 0 && prev.offset.y === 0) {
        return prev;
      }
      return {
        ...prev,
        baseScale: nextBaseScale,
        scale: nextScale,
        offset: { x: 0, y: 0 }
      };
    });
  }, [
    cropBoxSize.height,
    cropBoxSize.width,
    cropState.naturalHeight,
    cropState.naturalWidth,
    isCropping
  ]);

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: PointerEvent) => {
      if (!dragStartRef.current) return;
      const deltaX = e.clientX - dragStartRef.current.startX;
      const deltaY = e.clientY - dragStartRef.current.startY;
      setCropState((prev) => ({
        ...prev,
        offset: {
          x: dragStartRef.current!.originX + deltaX,
          y: dragStartRef.current!.originY + deltaY
        }
      }));
    };
    const stopDrag = () => {
      setDragging(false);
      dragStartRef.current = null;
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
    };
  }, [dragging]);

  function startCrop(target: CropTarget, file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCropState({
        target,
        imageUrl: reader.result as string,
        file,
        scale: 1,
        baseScale: 1,
        offset: { x: 0, y: 0 },
        naturalWidth: 0,
        naturalHeight: 0
      });
    };
    reader.readAsDataURL(file);
  }

  function handleSelfieChange(file: File | null) {
    setIdSelfieFile(file);
    if (!file) {
      setIdSelfiePreview(null);
      setSelfieAspectRatio(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setIdSelfiePreview(dataUrl);
      const img = new Image();
      img.onload = () => {
        if (!img.naturalWidth || !img.naturalHeight) {
          setSelfieAspectRatio(null);
          return;
        }
        setSelfieAspectRatio(img.naturalWidth / img.naturalHeight);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  function closeCropper() {
    setCropState(createInitialCropState());
    setDragging(false);
    dragStartRef.current = null;
  }

  function handleCropPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: cropState.offset.x,
      originY: cropState.offset.y
    };
    setDragging(true);
  }

  function handleCropImageLoad(e: SyntheticEvent<HTMLImageElement>) {
    const imgEl = e.currentTarget;
    if (!imgEl.naturalWidth || !imgEl.naturalHeight) return;
    setCropState((prev) => {
      if (prev.naturalWidth === imgEl.naturalWidth && prev.naturalHeight === imgEl.naturalHeight) {
        return prev;
      }
      return {
        ...prev,
        naturalWidth: imgEl.naturalWidth,
        naturalHeight: imgEl.naturalHeight
      };
    });
  }

  function handleZoomChange(nextScale: number) {
    setCropState((prev) => ({
      ...prev,
      scale: Math.min(Math.max(nextScale, minScale), maxScale)
    }));
  }

  async function confirmCrop() {
    if (!cropState.target || !cropState.imageUrl || !cropBoxRef.current) {
      closeCropper();
      return;
    }
    const img = new Image();
    img.src = cropState.imageUrl;
    if (!img.complete) {
      await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });
    }
    if (!img.naturalWidth || !img.naturalHeight) {
      closeCropper();
      return;
    }

    const rect = cropBoxRef.current.getBoundingClientRect();
    const imgLeft = rect.width / 2 - (img.naturalWidth * cropState.scale) / 2 + cropState.offset.x;
    const imgTop = rect.height / 2 - (img.naturalHeight * cropState.scale) / 2 + cropState.offset.y;
    const sourceX = (0 - imgLeft) / cropState.scale;
    const sourceY = (0 - imgTop) / cropState.scale;
    const sourceW = rect.width / cropState.scale;
    const sourceH = rect.height / cropState.scale;

    const canvas = document.createElement("canvas");
    canvas.width = CROP_CANVAS_WIDTH;
    canvas.height = CROP_CANVAS_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      closeCropper();
      return;
    }

    ctx.drawImage(
      img,
      sourceX,
      sourceY,
      sourceW,
      sourceH,
      0,
      0,
      CROP_CANVAS_WIDTH,
      CROP_CANVAS_HEIGHT
    );

    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    if (cropState.target === "front") {
      setIdFrontPreview(dataUrl);
      setIdFrontFile(cropState.file);
    } else {
      setIdBackPreview(dataUrl);
      setIdBackFile(cropState.file);
    }
    closeCropper();
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
            onChange={(file) => startCrop("front", file)}
            boxStyle={{ width: "85.7mm", maxWidth: "100%", height: "54mm" }}
            sizeHint="85.7mm x 54mm"
            previewUrl={idFrontPreview}
          />
          <FileUploadField
            label="上傳身分證背面"
            helper="點擊下方 85.7mm x 54mm 的方塊上傳"
            file={idBackFile}
            onChange={(file) => startCrop("back", file)}
            boxStyle={{ width: "85.7mm", maxWidth: "100%", height: "54mm" }}
            sizeHint="85.7mm x 54mm"
            previewUrl={idBackPreview}
          />
          <FileUploadField
            label="上傳手持身分證正面並和自己拍照"
            helper="尺寸不拘，請確保證件與本人清晰可辨"
            file={idSelfieFile}
            onChange={handleSelfieChange}
            boxStyle={selfieBoxStyle}
            spanCols
            previewUrl={idSelfiePreview}
            previewFit="contain"
          />
        </div>
      </section>
      {isCropping && cropState.imageUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
          <div className="w-full max-w-4xl space-y-4 rounded-xl bg-white p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">調整圖片位置</h3>
                <p className="text-sm text-slate-600">
                  拖曳移動，使用滑桿縮放，讓身分證填滿固定方框。
                </p>
              </div>
              <button
                type="button"
                onClick={closeCropper}
                className="rounded bg-slate-100 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-200"
              >
                關閉
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
              <div className="flex flex-col items-center gap-3">
                <div
                  ref={cropBoxRef}
                  className={`relative overflow-hidden rounded-md border border-slate-200 bg-slate-100 ${
                    dragging ? "cursor-grabbing" : "cursor-grab"
                  }`}
                  style={{ width: "85.7mm", maxWidth: "100%", height: "54mm", maxHeight: "60vh" }}
                  onPointerDown={handleCropPointerDown}
                >
                  <img
                    src={cropState.imageUrl}
                    alt="裁切預覽"
                    className="pointer-events-none select-none"
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: "50%",
                      width: cropState.naturalWidth || "auto",
                      height: cropState.naturalHeight || "auto",
                      maxWidth: "none",
                      maxHeight: "none",
                      transform: `translate(-50%, -50%) translate(${cropState.offset.x}px, ${cropState.offset.y}px) scale(${clampedScale})`,
                      transformOrigin: "center center"
                    }}
                    onLoad={handleCropImageLoad}
                    draggable={false}
                  />
                </div>
                <p className="text-xs text-slate-500">
                  方框尺寸固定 85.7mm x 54mm，請把身分證完整填滿框線。
                </p>
              </div>
              <div className="space-y-4 rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span>縮放</span>
                    <span>{clampedScale.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min={minScale}
                    max={maxScale}
                    step={0.01}
                    value={clampedScale}
                    onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeCropper}
                    className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={confirmCrop}
                    className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500"
                  >
                    確認
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
  sizeHint,
  previewUrl,
  previewFit = "cover"
}: {
  label: string;
  helper?: string;
  file: File | null;
  onChange: (file: File | null) => void;
  boxStyle?: CSSProperties;
  spanCols?: boolean;
  sizeHint?: string;
  previewUrl?: string | null;
  previewFit?: "cover" | "contain";
}) {
  const inputId = useId();
  const hasPreview = Boolean(previewUrl);

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
        className={`flex w-full cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-slate-300 bg-white/60 text-sm text-slate-600 transition hover:border-emerald-500 hover:text-emerald-700 ${
          hasPreview ? "p-0" : "px-3 py-4"
        }`}
        style={boxStyle}
      >
        {hasPreview ? (
          <img
            src={previewUrl ?? undefined}
            alt={label}
            className="h-full w-full rounded-md object-cover"
            style={{ objectFit: previewFit }}
            draggable={false}
          />
        ) : (
          <div className="space-y-1 text-center">
            <div className="text-sm font-semibold">點擊上傳</div>
            <div className="text-xs text-slate-500">
              {sizeHint ? `${sizeHint}｜支援圖片檔案` : "支援圖片檔案"}
            </div>
          </div>
        )}
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
