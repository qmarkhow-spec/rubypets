'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import type { PetCard } from "@/lib/types";

type FollowedPetsResponse = {
  items: PetCard[];
  nextCursor: string | null;
};

export default function FollowedPetsPage() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<PetCard[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingPage, setLoadingPage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    if (items.length > 0) return;
    void loadPage();
  }, [user]);

  async function loadPage(cursor?: string | null) {
    if (!user) return;
    setLoadingPage(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("limit", "20");
    if (cursor) params.set("cursor", cursor);
    try {
      const { data } = await apiFetch<FollowedPetsResponse>(`/api/me/followed-pets?${params.toString()}`);
      setItems((prev) => (cursor ? [...prev, ...data.items] : data.items));
      setNextCursor(data.nextCursor ?? null);
    } catch (err) {
      const status = (err as { status?: number }).status;
      setError("Failed to load followed pets (" + (status ?? "?") + ")");
    } finally {
      setLoadingPage(false);
    }
  }

  if (loading) return <div className="text-sm text-white/70">Loading...</div>;
  if (!user) return <div className="text-sm text-white/70">Please log in to view followed pets.</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-white">Followed pets</h1>

      {error && <p className="text-sm text-red-300">{error}</p>}
      {!items.length && !loadingPage && !error && (
        <p className="text-sm text-white/70">You are not following any pets.</p>
      )}

      <div className="space-y-2">
        {items.map((pet) => (
          <Link
            key={pet.id}
            href={`/pets?id=${encodeURIComponent(pet.id)}`}
            className="flex items-center gap-3 rounded border border-white/10 bg-white/5 p-3 text-sm text-white/80 hover:bg-white/10"
          >
            <div className="h-10 w-10 overflow-hidden rounded-full bg-white/10">
              {pet.avatarUrl && <img src={pet.avatarUrl} alt={pet.name} className="h-full w-full object-cover" />}
            </div>
            <div className="flex-1">
              <div className="font-medium text-white">{pet.name}</div>
              <div className="text-xs text-white/60">
                {[pet.species, pet.breed].filter(Boolean).join(" / ") || "No details"}
              </div>
            </div>
            <div className="text-xs text-white/60">{pet.followersCount} followers</div>
          </Link>
        ))}
      </div>

      {nextCursor && (
        <button
          type="button"
          onClick={() => loadPage(nextCursor)}
          disabled={loadingPage}
          className="rounded border border-white/20 px-3 py-1.5 text-sm text-white/80 hover:bg-white/10 disabled:opacity-60"
        >
          {loadingPage ? "Loading..." : "Load more"}
        </button>
      )}
    </div>
  );
}
