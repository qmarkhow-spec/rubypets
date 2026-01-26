'use client';

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import type { PetsCategoryData, PetsCategoryClass, PetsCategorySpecies } from "@/lib/types";

const DRAFT_KEY = "pet_create_draft";

export default function PetCreateStepOnePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [categories, setCategories] = useState<PetsCategoryData | null>(null);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [classKey, setClassKey] = useState("");
  const [speciesKey, setSpeciesKey] = useState("");
  const [breedKey, setBreedKey] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push("/login");
      return;
    }
  }, [loading, user, router]);

  useEffect(() => {
    setLoadingCategories(true);
    apiFetch<PetsCategoryData>("/api/pets/categories")
      .then(({ data }) => setCategories(data))
      .catch((err) => {
        const status = (err as { status?: number }).status;
        setError(`Failed to load categories (HTTP ${status ?? "?"}).`);
      })
      .finally(() => setLoadingCategories(false));
  }, []);

  const selectedClass = useMemo<PetsCategoryClass | null>(() => {
    return categories?.classes.find((c) => c.key === classKey) ?? null;
  }, [categories, classKey]);

  const selectedSpecies = useMemo<PetsCategorySpecies | null>(() => {
    return selectedClass?.species.find((s) => s.key === speciesKey) ?? null;
  }, [selectedClass, speciesKey]);

  useEffect(() => {
    setSpeciesKey("");
    setBreedKey("");
  }, [classKey]);

  useEffect(() => {
    setBreedKey("");
  }, [speciesKey]);

  const speciesOptions = selectedClass?.species ?? [];
  const breedOptions = selectedSpecies?.breeds ?? [];
  const hasBreed = selectedSpecies?.hasBreed ?? false;

  const canNext =
    !!classKey && !!speciesKey && (!hasBreed || (hasBreed && !!breedKey)) && !loadingCategories && !error;

  function handleNext() {
    if (!canNext) return;
    const petId = crypto.randomUUID();
    const draft = {
      pet_id: petId,
      class: classKey,
      species: speciesKey,
      breed: hasBreed ? breedKey : null
    };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    router.push("/pets/new/details");
  }

  if (loading) return <div className="text-sm text-white/70">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Create a pet profile</h1>
        <p className="text-sm text-white/70">Step 1: choose category.</p>
      </div>

      <section className="rounded-xl border border-white/10 bg-white/5 p-4">
        {error && <p className="text-sm text-red-300">{error}</p>}
        {loadingCategories && <p className="text-sm text-white/70">Loading categories...</p>}
        {!loadingCategories && categories && (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm text-white/80">Class</label>
              <select
                className="w-full rounded border border-white/10 bg-black/20 px-3 py-2 text-white"
                value={classKey}
                onChange={(e) => setClassKey(e.target.value)}
              >
                <option value="">Select...</option>
                {categories.classes.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm text-white/80">Species</label>
              <select
                className="w-full rounded border border-white/10 bg-black/20 px-3 py-2 text-white disabled:opacity-50"
                value={speciesKey}
                onChange={(e) => setSpeciesKey(e.target.value)}
                disabled={!classKey}
              >
                <option value="">Select...</option>
                {speciesOptions.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            {selectedSpecies && hasBreed && (
              <div className="space-y-1">
                <label className="text-sm text-white/80">Breed</label>
                <select
                  className="w-full rounded border border-white/10 bg-black/20 px-3 py-2 text-white"
                  value={breedKey}
                  onChange={(e) => setBreedKey(e.target.value)}
                >
                  <option value="">Select...</option>
                  {breedOptions.map((b) => (
                    <option key={b.key} value={b.key}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleNext}
          disabled={!canNext}
          className="rounded bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-60"
        >
          Next
        </button>
      </div>
    </div>
  );
}
