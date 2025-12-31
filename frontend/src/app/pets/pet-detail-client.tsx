'use client';

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { PetDetail, PetsCategoryData } from "@/lib/types";

export default function PetDetailClient({ id }: { id: string }) {
  const [pet, setPet] = useState<PetDetail | null>(null);
  const [categories, setCategories] = useState<PetsCategoryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    apiFetch<{ data: PetDetail }>(`/api/pets/${encodeURIComponent(id)}`)
      .then(({ data }) => setPet(data.data))
      .catch((err) => {
        const status = (err as { status?: number }).status;
        setError(`載入失敗（${status ?? "?"}）`);
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    apiFetch<{ data: PetsCategoryData }>("/api/pets/categories")
      .then(({ data }) => setCategories(data.data))
      .catch(() => null);
  }, []);

  const labels = useMemo(() => {
    if (!pet || !categories) return null;
    const classItem = categories.classes.find((c) => c.key === pet.class);
    const speciesItem = classItem?.species.find((s) => s.key === pet.species);
    const breedItem = speciesItem?.breeds.find((b) => b.key === pet.breed);
    return {
      classLabel: classItem?.label ?? pet.class ?? "",
      speciesLabel: speciesItem?.label ?? pet.species ?? "",
      breedLabel: breedItem?.label ?? pet.breed ?? ""
    };
  }, [pet, categories]);

  const genderLabel = useMemo(() => {
    switch (pet?.gender) {
      case "male":
        return "公";
      case "female":
        return "母";
      default:
        return "不詳";
    }
  }, [pet?.gender]);

  return (
    <div className="space-y-6">
      {loading && <p className="text-sm text-white/70">載入中...</p>}
      {error && <p className="text-sm text-red-300">{error}</p>}
      {!loading && !error && pet && (
        <>
          <div className="flex items-center gap-4">
            <div className="h-24 w-24 overflow-hidden rounded-full bg-white/10">
              {pet.avatarUrl && <img src={pet.avatarUrl} alt={pet.name} className="h-full w-full object-cover" />}
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-white">{pet.name}</h1>
              <p className="text-sm text-white/70">{genderLabel}</p>
            </div>
          </div>

          <section className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2 text-sm text-white/80">
            <div>生日：{pet.birthday ?? "不詳"}</div>
            <div>
              分類：{labels?.classLabel || pet.class || "-"}
              {labels?.speciesLabel || pet.species ? ` / ${labels?.speciesLabel || pet.species}` : ""}
              {labels?.breedLabel ? ` / ${labels.breedLabel}` : ""}
            </div>
            <div>簡介：{pet.bio || "尚未填寫"}</div>
          </section>
        </>
      )}
      {!loading && !error && !pet && <p className="text-sm text-white/70">找不到寵物資料</p>}
    </div>
  );
}
