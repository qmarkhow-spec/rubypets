'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import type { PetDetail } from "@/lib/types";

type Draft = {
  pet_id: string;
  class: string;
  species: string;
  breed: string | null;
};

const DRAFT_KEY = "pet_create_draft";

export default function PetCreateStepTwoPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "unknown" | "">("");
  const [birthday, setBirthday] = useState("");
  const [birthdayUnknown, setBirthdayUnknown] = useState(false);
  const [bio, setBio] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) {
      router.replace(`/owners?id=${user.id}`);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as Draft;
      if (!parsed?.pet_id || !parsed?.class || !parsed?.species) {
        sessionStorage.removeItem(DRAFT_KEY);
        router.replace(`/owners?id=${user.id}`);
        return;
      }
      setDraft(parsed);
    } catch {
      sessionStorage.removeItem(DRAFT_KEY);
      router.replace(`/owners?id=${user.id}`);
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!birthdayUnknown) return;
    setBirthday("");
  }, [birthdayUnknown]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  const bioRemaining = useMemo(() => 200 - bio.length, [bio.length]);

  const canSubmit =
    !!draft &&
    name.trim().length > 0 &&
    gender !== "" &&
    (birthdayUnknown || birthday.trim().length > 0) &&
    !!avatarFile &&
    bio.length <= 200 &&
    !saving;

  async function handleAvatarChange(file: File | null) {
    setError(null);
    if (!file || !draft) {
      setAvatarFile(null);
      setAvatarPreview(null);
      return;
    }

    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      setError("Only JPG, PNG, or WEBP files are supported.");
      return;
    }

    try {
      const cropped = await centerCropToSquare(file);
      const ext = mimeToExt(cropped.type);
      const finalFile = new File([cropped], `${draft.pet_id}_avatar.${ext}`, { type: cropped.type });

      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const previewUrl = URL.createObjectURL(cropped);
      previewUrlRef.current = previewUrl;
      setAvatarPreview(previewUrl);
      setAvatarFile(finalFile);
    } catch (err) {
      setError(`Image processing failed: ${String(err)}`);
    }
  }

  async function handleSubmit() {
    if (!draft || !user || !canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("pet_id", draft.pet_id);
      form.append("file", avatarFile as File);

      const upload = await apiFetch<{ storage_key: string; public_url: string }>("/api/r2/pets/avatar/upload", {
        method: "POST",
        body: form
      });

      const payload = {
        pet_id: draft.pet_id,
        owners_uuid: user.id,
        class: draft.class,
        species: draft.species,
        breed: draft.breed,
        name: name.trim(),
        gender,
        birthday: birthdayUnknown ? "unknown" : birthday.trim(),
        bio: bio.trim() || null,
        avatar_storage_key: upload.data.storage_key,
        avatar_url: upload.data.public_url
      };

      const created = await apiFetch<PetDetail>("/api/create-pets", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      sessionStorage.removeItem(DRAFT_KEY);
      router.push(`/pets?id=${encodeURIComponent(created.data.id)}`);
    } catch (err) {
      const status = (err as { status?: number }).status;
      setError(`Create pet failed (HTTP ${status ?? "?"}).`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-sm text-white/70">Loading...</div>;
  if (!draft) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Create a pet profile</h1>
        <p className="text-sm text-white/70">Step 2: add details.</p>
      </div>

      <section className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm text-white/80">Name</label>
            <input
              className="w-full rounded border border-white/10 bg-black/20 px-3 py-2 text-white"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter a name"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-white/80">Gender</label>
            <select
              className="w-full rounded border border-white/10 bg-black/20 px-3 py-2 text-white"
              value={gender}
              onChange={(e) => setGender(e.target.value as "male" | "female" | "unknown" | "")}
            >
              <option value="">Select...</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm text-white/80">Birthday</label>
            <input
              type="date"
              className="w-full rounded border border-white/10 bg-black/20 px-3 py-2 text-white disabled:opacity-50"
              value={birthday}
              onChange={(e) => setBirthday(e.target.value)}
              disabled={birthdayUnknown}
            />
            <label className="mt-2 flex items-center gap-2 text-xs text-white/70">
              <input
                type="checkbox"
                className="accent-emerald-500"
                checked={birthdayUnknown}
                onChange={(e) => setBirthdayUnknown(e.target.checked)}
              />
              Birthday unknown
            </label>
          </div>
          <div className="space-y-1">
            <label className="text-sm text-white/80">Avatar</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => handleAvatarChange(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-white/70 file:mr-3 file:rounded file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-white hover:file:bg-white/20"
            />
            {avatarPreview && (
              <img
                src={avatarPreview}
                alt="Pet avatar preview"
                className="mt-2 h-32 w-32 rounded-full object-cover ring-2 ring-white/10"
              />
            )}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm text-white/80">Bio (max 200 characters)</label>
          <textarea
            className="w-full rounded border border-white/10 bg-black/20 px-3 py-2 text-white"
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Write something about your pet"
          />
          <p className={`text-xs ${bioRemaining < 0 ? "text-red-300" : "text-white/60"}`}>
            Remaining: {bioRemaining}
          </p>
        </div>
      </section>

      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded border border-white/20 px-4 py-2 text-sm text-white/80 hover:text-white"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="rounded bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Create"}
        </button>
      </div>
    </div>
  );
}

function mimeToExt(mimeType: string): "jpg" | "png" | "webp" {
  switch (mimeType.toLowerCase()) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
}

function centerCropToSquare(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const size = Math.min(img.width, img.height);
      if (!size) {
        reject(new Error("invalid image size"));
        return;
      }
      const sx = (img.width - size) / 2;
      const sy = (img.height - size) / 2;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("canvas not supported"));
        return;
      }
      ctx.drawImage(img, sx, sy, size, size, 0, 0, size, size);
      const mimeType = file.type || "image/jpeg";
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("failed to create blob"));
            return;
          }
          resolve(blob);
        },
        mimeType,
        0.9
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("failed to load image"));
    };
    img.src = objectUrl;
  });
}
