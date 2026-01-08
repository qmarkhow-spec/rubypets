import MessageThreadClient from "./thread-client";

export const dynamicParams = false;

export function generateStaticParams() {
  return [];
}

export default function MessageThreadPage({ params }: { params: { id: string } }) {
  return <MessageThreadClient threadId={params.id ?? ""} />;
}
