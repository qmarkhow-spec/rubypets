const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "https://api.rubypets.com").replace(/\/$/, "");

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(init.headers ?? {});

  const bodyIsFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (!headers.has("content-type") && init.body && !bodyIsFormData) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(url, { ...init, headers });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `API error (${response.status})`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = (await response.json()) as unknown;
    return unwrapOkPayload(payload) as T;
  }

  return (await response.text()) as unknown as T;
}

export { API_BASE };

function unwrapOkPayload(payload: unknown) {
  if (payload && typeof payload === "object") {
    const record = payload as { ok?: unknown; data?: unknown };
    if (record.ok === true && "data" in record) {
      return record.data;
    }
  }
  return payload;
}
