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
  maxPets?: number;
  createdAt?: string;
  updatedAt?: string;
  isActive?: number;
}

export interface Post {
  id: string;
  authorId: string;
  content?: string | null;
  body?: string | null;
  mediaKey?: string | null;
  createdAt: string;
  authorHandle?: string | null;
  authorDisplayName?: string | null;
  visibility?: string | null;
  postType?: string | null;
  mediaCount?: number | null;
  mediaUrls?: string[];
  isDeleted?: number;
  likeCount?: number | null;
  commentCount?: number | null;
  repostCount?: number | null;
  originPostId?: string | null;
  originPost?: Post | null;
  latestComment?: Comment | null;
  isLiked?: boolean;
}

export interface Comment {
  id: string;
  postId: string;
  ownerId: string;
  ownerDisplayName?: string | null;
  content: string;
  parentCommentId?: string | null;
  createdAt: string;
  likeCount?: number | null;
  isLiked?: boolean;
}

export interface ApiResult<T> {
  status: number;
  data: T;
}

export interface ApiError extends Error {
  status?: number;
  details?: unknown;
}

export interface OwnerDetail {
  accountId: string;
  uuid: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  maxPets: number;
  createdAt: string;
  updatedAt: string;
  isActive: number;
  city?: string | null;
  region?: string | null;
  isVerified?: number;
  idLicenseFrontUrl?: string | null;
  idLicenseBackUrl?: string | null;
  faceWithLicenseUrl?: string | null;
}
