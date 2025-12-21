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
    setPetTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
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
        if (!images.length) throw new Error("Ë´ãËá≥Â∞ëÈÅ∏??1 ÂºµÂ??áÔ??ÄÂ§?5 Âº?);
        const created = await createPost({ content, post_type: "image_set", visibility });
        const assetIds = await Promise.all(images.map((file) => uploadImage(file, created.id)));
        await attachMedia(created.id, "image_set", assetIds);
        setResult(created);
        router.push("/");
        router.refresh();
        return;
      }

      if (kind === "video") {
        if (!video) throw new Error("Ë´ãÂ??∏Ê?ÂΩ±Á?ÔºàÈ???1 ?®Ô?60 ÁßíÂÖßÔº?);
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
      throw new Error("Âª∫Á?Ë≤ºÊ?Â§±Ê?ÔºöÁº∫Â∞?id");
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
    if (!uploadResp.ok) throw new Error("‰∏äÂÇ≥?ñÁ?Â§±Ê?");

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
      method: isTus ? "PATCH" : "POST",
      headers: isTus
        ? {
            "Tus-Resumable": "1.0.0",
            "Upload-Offset": "0",
            "Upload-Length": `${file.size}`,
            "Upload-Metadata": `filename ${filenameMeta}`,
            "Content-Type": "application/offset+octet-stream",
          }
        : { "Content-Type": file.type || "video/mp4" },
      body: file,
    });
    if (!uploadResp.ok) {
      const errText = await uploadResp.text().catch(() => "");
      throw new Error(`§W∂«ºv§˘•¢±—${errText ? `: ${errText}` : ""}`);
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
          ËøîÂ?È¶ñÈ?
        </Link>
        <h1 className="text-xl font-semibold text-white">?∞Â?Ë≤ºÊ?</h1>
      </div>

      <section className="rounded-xl border border-white/10 bg-white/90 p-4 shadow-sm">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="flex flex-wrap gap-2">
            <KindButton label="Á¥îÊ?Â≠? active={kind === "text"} onClick={() => onKindChange("text")} />
            <KindButton label="?ñÁ?‰∏?(1-5Âº?" active={kind === "image_set"} onClick={() => onKindChange("image_set")} />
            <KindButton label="ÂΩ±Á? (1 ?ÜÈ???" active={kind === "video"} onClick={() => onKindChange("video")} />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-slate-700">?ßÂÆπ</label>
            <textarea
              className="w-full rounded border border-slate-200 p-3 text-sm"
              rows={5}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="ÂØ´È?‰ªÄÈ∫?.."
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
                  ?∏Ê??ñÁ?
                </button>
                <span className="text-xs text-slate-600">?ÄÂ§?5 ÂºµÔ?JPG/PNG/WebP</span>
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
                {images.length === 0 && <p>Â∞öÊú™?∏Ê??ñÁ?</p>}
                {images.map((file, idx) => (
                  <div key={`${file.name}-${idx}`} className="flex items-center justify-between rounded bg-slate-100 px-2 py-1">
                    <span className="truncate">{file.name}</span>
                    <button type="button" className="text-xs text-red-600" onClick={() => removeImage(idx)}>
                      ÁßªÈô§
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
                  ?∏Ê?ÂΩ±Á?
                </button>
                <span className="text-xs text-slate-600">??1 ?®Ô?60 ÁßíÂÖß</span>
              </div>
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handlePickVideo}
              />
              <div className="space-y-1 text-sm text-slate-700">
                {!video && <p>Â∞öÊú™?∏Ê?ÂΩ±Á?</p>}
                {video && (
                  <div className="flex items-center justify-between rounded bg-slate-100 px-2 py-1">
                    <span className="truncate">{video.name}</span>
                    <button type="button" className="text-xs text-red-600" onClick={clearVideo}>
                      ÁßªÈô§
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
              {submitting ? "?ºÂ?‰∏?.." : "?ºÂ?Ë≤ºÊ?"}
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
        <h2 className="text-base font-semibold text-slate-900">?ÅÂá∫?çÈ?Ë¶?/h2>
        {content.trim() ? (
          <div className="mt-2 space-y-1">
            <p className="text-xs uppercase tracking-wide text-slate-500">?ßÂÆπ?êË¶Ω</p>
            <p className="rounded bg-slate-50 p-3 text-slate-800">{content}</p>
            {kind === "image_set" && images.length > 0 && (
              <p className="text-xs text-slate-600">?ñÁ?Ôºö{images.map((f) => f.name).join(", ")}</p>
            )}
            {kind === "video" && video && <p className="text-xs text-slate-600">ÂΩ±Á?Ôºö{video.name}</p>}
            {petTags.length > 0 && <p className="text-xs text-slate-600">ÂØµÁâ© TagÔºö{petTagsDisplay}</p>}
          </div>
        ) : (
          <p className="mt-2 text-slate-600">Ëº∏ÂÖ•?ßÂÆπÂæåÂç≥?ØÈ?Ë¶ΩÔ?Á¢∫Ë?Ê≤íÂ?È°åÂ??º‰???/p>
        )}
      </section>
    </div>
  );
}

function readError(err: unknown): string {
  if (!err) return "?™Áü•?ØË™§";
  if (typeof err === "string") return err;
  const status = (err as { status?: number }).status;
  const details = (err as { details?: unknown }).details;
  if (details && typeof details === "object" && "error" in details) {
    return `${status ?? ""} ${(details as { error?: string }).error ?? "‰º∫Ê??®ÈåØË™?}`;
  }
  return status ? `HTTP ${status}` : "‰º∫Ê??®ÈåØË™?;
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
      <p className="text-xs text-slate-600">Ê®ôË?ÂØµÁâ©Ôºà‰?ÂæåÂèØ?πÊ?ÂæûÂ?Á´ØË??•Ô?</p>
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
      <label className="text-sm text-slate-700">?ØË???/label>
      <select
        className="w-full rounded border border-slate-200 p-3 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="public">?¨È?</option>
        <option value="friends">Â•ΩÂ?</option>
        <option value="private">?ÖËá™Â∑?/option>
      </select>
    </div>
  );
}

