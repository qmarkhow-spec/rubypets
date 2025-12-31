import PetDetailClient from "./pet-detail-client";

export const dynamicParams = false;

export async function generateStaticParams() {
  return [];
}

export default function PetDetailPage() {
  return <PetDetailClient />;
}
