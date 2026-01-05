import { loadTokens, clearTokens } from './auth-storage';
import { ApiError, ApiResult } from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'https://api.rubypets.com';

type ApiOptions = RequestInit & { parseJson?: boolean };

export async function apiFetch<T = unknown>(path: string, options: ApiOptions = {}): Promise<ApiResult<T>> {
  const target = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const tokens = loadTokens();

  const headers = new Headers(options.headers);
  if (!headers.has('content-type') && options.body && !(options.body instanceof FormData)) {
    headers.set('content-type', 'application/json');
  }
  if (tokens?.accessToken) {
    headers.set('authorization', `Bearer ${tokens.accessToken}`);
  }

  const response = await fetch(target, { ...options, headers });
  const text = await response.text();
  const parseJson = options.parseJson ?? true;
  const raw = parseJson && text ? safeJson(text) : (text as unknown as T);

  if (!response.ok) {
    const err = new Error('API error') as ApiError;
    err.status = response.status;
    err.details = raw;
    if (response.status === 401) {
      clearTokens();
    }
    throw err;
  }

  const normalized = parseJson ? unwrapOkPayload(raw) : raw;
  return { status: response.status, data: normalized as T };
}

function safeJson(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function unwrapOkPayload(payload: unknown) {
  if (payload && typeof payload === "object") {
    const record = payload as { ok?: unknown; data?: unknown };
    if (record.ok === true && "data" in record) {
      return record.data;
    }
  }
  return payload;
}
