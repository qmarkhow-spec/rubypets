
import { Suspense } from "react";
import PetQueryClient from "./pet-query-client";

export default function PetsPage() {
  return (
    <Suspense fallback={<div className="text-sm text-white/70">載入中...</div>}>
      <PetQueryClient />
    </Suspense>
  );
}
