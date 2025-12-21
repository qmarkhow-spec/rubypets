'use client';

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";

type Json = Record<string, unknown> | Array<unknown> | string | number | boolean | null;
type PostKind = "text" | "image_set" | "video";

interface InitUploadResponse {
  asset_id: string;
  upload_url: string;
}

export default function NewPostPage() {
  const router = useRouter();
  const [kind, setKind] = useState<PostKind>("text");
  const [content, setContent] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [video, setVideo] = useState<File | null>(null);
  const [petTags, setPetTags] = useState<string[]>([]);
  const [visibility, setVisibility] = useState("public");
  const [result, setResult] = useState<Json | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const petTagsDisplay = useMemo(() => petTags.join(", "), [petTags]);

  function onKindChange(next: PostKind) {
    setKind(next);
    if (next === "text") {
      setImages([]);
      setVideo(null);
      setPetTags([]);
    } else if (next === "image_set") {
      setVideo(null);
    } else if (next === "video") {
      setImages([]);
    }
  }

  function handlePickImages(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const next = [...images, ...files].slice(0, 5);
    setImages(next);
    e.target.value = "";
  }

  function handlePickVideo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideo(file);
    e.target.value = "";
  }

  function removeImage(idx: number) {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  }

  function clearVideo() {
    setVideo(null);
  }

  function togglePetTag(tag: string) {
    setPetTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setSubmitting(true);
    try {
      if (kind === "text") {
        const created = await createPost({ content, post_type: "text", visibility });
        setResult(created);
        router.push("/");
        router.refresh();
        return;
      }

      if (kind === "image_set") {
        if (!images.length) throw new Error("請至少選擇 1 張圖片，最多 5 張");
        const created = await createPost({ content, post_type: "image_set", visibility });
        const assetIds = await Promise.all(images.map((file) => uploadImage(file, created.id)));
        await attachMedia(created.id, "image_set", assetIds);
        setResult(created);
        router.push("/");
        router.refresh();
        return;
      }

      if (kind === "video") {
        if (!video) throw new Error("請選擇 1 部 60 秒內的影片");
        const created = await createPost({ content, post_type: "video", visibility });
        const assetId = await uploadVideo(video, created.id);
        await attachMedia(created.id, "video", [assetId]);
        setResult(created);
        router.push("/");
        router.refresh();
      }
    } catch (err) {
      setError(readError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function createPost(body: Record<string, unknown>) {
    const { data } = await apiFetch("/api/posts", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const post = (data as any).data ?? data;
    if (!post?.id) {
      throw new Error("建立貼文失敗：缺少 id");
    }
    return post;
  }

  async function uploadImage(file: File, postId: string): Promise<string> {
    const { data } = await apiFetch<{ data: InitUploadResponse }>("/api/media/images/init", {
      method: "POST",
      body: JSON.stringify({
        usage: "post",
        related: { post_id: postId },
        file: { filename: file.name, mime_type: file.type, size_bytes: file.size },
      }),
    });
    const { upload_url, asset_id } = (data as any).data ?? data;

    const form = new FormData();
    form.append("file", file);
    const uploadResp = await fetch(upload_url, { method: "POST", body: form });
    if (!uploadResp.ok) throw new Error("上傳圖片失敗");

    return asset_id;
  }

  async function uploadVideo(file: File, postId: string): Promise<string> {
    const { data } = await apiFetch<{ data: InitUploadResponse }>("/api/media/videos/init", {
      method: "POST",
      body: JSON.stringify({
        usage: "post",
        related: { post_id: postId },
        file: { filename: file.name, mime_type: file.type, size_bytes: file.size },
      }),
    });
    const { upload_url, asset_id } = (data as any).data ?? data;

    const isTus = /\/tus\//i.test(upload_url) || /upload\.cloudflarestream\.com/i.test(upload_url);
    const filenameMeta = btoa(unescape(encodeURIComponent(file.name)));

    const uploadResp = await fetch(upload_url, {
      method: isTus ? "POST" : "POST",
      headers: isTus
        ? {
            "Tus-Resumable": "1.0.0",
            "Upload-Length": `${file.size}`,
            "Upload-Metadata": `filename ${filenameMeta}`,
            "Content-Type": "application/offset+octet-stream",
          }
        : { "Content-Type": file.type || "video/mp4" },
      body: file,
    });
    if (!uploadResp.ok) {
      const errText = await uploadResp.text().catch(() => "");
      throw new Error(`上傳影片失敗${errText ? `: ${errText}` : ""}`);
    }

    return asset_id;
  }

  async function attachMedia(postId: string, postType: "image_set" | "video", assetIds: string[]) {
    await apiFetch(`/api/posts/${postId}/media/attach`, {
      method: "POST",
      body: JSON.stringify({
        post_type: postType,
        asset_ids: assetIds,
        pet_tags: petTags,
      }),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-sm text-white/80 hover:text-white">
          返回首頁
        </Link>
        <h1 className="text-xl font-semibold text-white">新增貼文</h1>
      </div>

      <section className="rounded-xl border border-white/10 bg-white/90 p-4 shadow-sm">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="flex flex-wrap gap-2">
            <KindButton label="純文字" active={kind === "text"} onClick={() => onKindChange("text")} />
            <KindButton label="圖片串 (1-5 張)" active={kind === "image_set"} onClick={() => onKindChange("image_set")} />
            <KindButton label="影片 (1 分鐘內)" active={kind === "video"} onClick={() => onKindChange("video")} />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-slate-700">內容</label>
            <textarea
              className="w-full rounded border border-slate-200 p-3 text-sm"
              rows={5}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="寫點什麼吧..."
              required
            />
          </div>

          {kind === "image_set" && (
            <div className="space-y-2 rounded border border-dashed border-slate-200 p-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800"
                >
                  選擇圖片
                </button>
                <span className="text-xs text-slate-600">最多 5 張，JPG/PNG/WebP</span>
              </div>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handlePickImages}
              />
              <div className="space-y-1 text-sm text-slate-700">
                {images.length === 0 && <p>尚未選擇圖片</p>}
                {images.map((file, idx) => (
                  <div key={`${file.name}-${idx}`} className="flex items-center justify-between rounded bg-slate-100 px-2 py-1">
                    <span className="truncate">{file.name}</span>
                    <button type="button" className="text-xs text-red-600" onClick={() => removeImage(idx)}>
                      移除
                    </button>
                  </div>
                ))}
              </div>
              <PetTags petTags={petTags} onToggle={togglePetTag} />
            </div>
          )}

          {kind === "video" && (
            <div className="space-y-2 rounded border border-dashed border-slate-200 p-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800"
                >
                  選擇影片
                </button>
                <span className="text-xs text-slate-600">限 1 部，60 秒內</span>
              </div>
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handlePickVideo}
              />
              <div className="space-y-1 text-sm text-slate-700">
                {!video && <p>尚未選擇影片</p>}
                {video && (
                  <div className="flex items-center justify-between rounded bg-slate-100 px-2 py-1">
                    <span className="truncate">{video.name}</span>
                    <button type="button" className="text-xs text-red-600" onClick={clearVideo}>
                      移除
                    </button>
                  </div>
                )}
              </div>
              <PetTags petTags={petTags} onToggle={togglePetTag} />
            </div>
          )}

          <VisibilityField value={visibility} onChange={setVisibility} />

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300"
            >
              {submitting ? "發佈中..." : "發佈貼文"}
            </button>
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </form>
        {result && (
          <pre className="mt-4 max-h-64 overflow-auto rounded bg-slate-50 p-3 text-xs text-slate-800">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </section>

      <section className="rounded-xl border border-dashed border-white/20 bg-white/60 p-4 text-sm text-slate-700">
        <h2 className="text-base font-semibold text-slate-900">送出前預覽</h2>
        {content.trim() ? (
          <div className="mt-2 space-y-1">
            <p className="text-xs uppercase tracking-wide text-slate-500">內容預覽</p>
            <p className="rounded bg-slate-50 p-3 text-slate-800">{content}</p>
            {kind === "image_set" && images.length > 0 && (
              <p className="text-xs text-slate-600">圖片：{images.map((f) => f.name).join(", ")}</p>
            )}
            {kind === "video" && video && <p className="text-xs text-slate-600">影片：{video.name}</p>}
            {petTags.length > 0 && <p className="text-xs text-slate-600">標記寵物：{petTagsDisplay}</p>}
          </div>
        ) : (
          <p className="mt-2 text-slate-600">輸入內容後即可預覽，確認無誤再送出。</p>
        )}
      </section>
    </div>
  );
}

function readError(err: unknown): string {
  if (!err) return "未知錯誤";
  if (typeof err === "string") return err;
  const status = (err as { status?: number }).status;
  const details = (err as { details?: unknown }).details;
  if (details && typeof details === "object" && "error" in details) {
    return `${status ?? ""} ${(details as { error?: string }).error ?? "伺服器錯誤"}`;
  }
  return status ? `HTTP ${status}` : "伺服器錯誤";
}

function KindButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm ${active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
    >
      {label}
    </button>
  );
}

function PetTags({ petTags, onToggle }: { petTags: string[]; onToggle: (tag: string) => void }) {
  const options = ["Mochi", "Kiki", "Luna"];
  return (
    <div className="space-y-1">
      <p className="text-xs text-slate-600">標記寵物（之後可改成後端載入）</p>
      <div className="flex flex-wrap gap-2">
        {options.map((pet) => (
          <button
            key={pet}
            type="button"
            onClick={() => onToggle(pet)}
            className={`rounded-full px-3 py-1 text-xs ${petTags.includes(pet) ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}`}
          >
            {pet}
          </button>
        ))}
      </div>
    </div>
  );
}

function VisibilityField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1">
      <label className="text-sm text-slate-700">可見性</label>
      <select
        className="w-full rounded border border-slate-200 p-3 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="public">公開</option>
        <option value="friends">好友</option>
        <option value="private">私人</option>
      </select>
    </div>
  );
}
