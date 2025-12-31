'use client';

import { useSearchParams } from "next/navigation";
import PetDetailClient from "./pet-detail-client";

export default function PetQueryClient() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return <div className="text-sm text-white/70">缺少 pet id</div>;
  }
  return <PetDetailClient id={id} />;
}
