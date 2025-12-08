export interface HealthStatus {
  ok: boolean;
  environment?: string;
  d1?: boolean;
  r2?: boolean;
  ts?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

export interface User {
  id: string;
  handle: string;
  displayName: string;
  email?: string | null;
  avatarUrl?: string | null;
}

export interface Post {
  id: string;
  authorId: string;
  content: string;
  mediaKey?: string | null;
  createdAt: string;
  authorHandle?: string | null;
  authorDisplayName?: string | null;
}

export interface ApiResult<T> {
  status: number;
  data: T;
}

export interface ApiError extends Error {
  status?: number;
  details?: unknown;
}
