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

export interface OwnerSearchResult {
  uuid: string;
  displayName: string;
  avatarUrl?: string | null;
  city?: string | null;
  region?: string | null;
}

export interface OwnerPetSummary {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

export type FriendshipStatus = "none" | "pending_outgoing" | "pending_incoming" | "friends";

export interface FriendshipListItem {
  otherOwner: OwnerSearchResult;
  createdAt: string;
}

export interface PetDetail {
  id: string;
  ownerId: string;
  name: string;
  class: string | null;
  species: string | null;
  breed: string | null;
  gender: "male" | "female" | "unknown";
  birthday: string | null;
  avatarAssetId: string | null;
  avatarUrl: string | null;
  bio: string | null;
  followersCount: number;
  isFollowing?: boolean;
  createdAt: string;
  updatedAt: string;
  isActive: number;
}

export interface PetCard {
  id: string;
  name: string;
  avatarUrl: string | null;
  species: string | null;
  breed: string | null;
  followersCount: number;
  isActive: number;
}

export interface PetsCategoryBreed {
  key: string;
  label: string;
}

export interface PetsCategorySpecies {
  key: string;
  label: string;
  hasBreed: boolean;
  breeds: PetsCategoryBreed[];
}

export interface PetsCategoryClass {
  key: string;
  label: string;
  species: PetsCategorySpecies[];
}

export interface PetsCategoryData {
  classes: PetsCategoryClass[];
}
