import PetDetailClient from "./pet-detail-client";

export default function PetsPage({ searchParams }: { searchParams: { id?: string } }) {
  const id = searchParams?.id?.trim();
  if (!id) {
    return <div className="text-sm text-white/70">缺少 pet id</div>;
  }
  return <PetDetailClient id={id} />;
}
