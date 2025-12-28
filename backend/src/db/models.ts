export interface User {
  id: string;
  handle: string;
  displayName: string;
  email?: string | null;
  avatarUrl?: string | null;
  passwordHash?: string | null;
  createdAt: string;
}

export interface Post {
  id: string;
  authorId: string; // owner uuid
  body: string | null;
  mediaKey: string | null;
  createdAt: string;
  authorHandle?: string | null;
  authorDisplayName?: string | null;
  visibility?: string;
  postType?: string;
  mediaCount?: number;
  mediaUrls?: string[];
  isDeleted?: number;
  likeCount?: number;
  commentCount?: number;
  repostCount?: number;
  originPostId?: string | null;
  originPost?: Post | null;
  isLiked?: boolean;
}

export interface Comment {
  id: string;
  postId: string;
  ownerId: string;
  ownerDisplayName?: string | null;
  content: string;
  parentCommentId: string | null;
  createdAt: string;
  likeCount?: number;
  isLiked?: boolean;
}

export interface CommentThread extends Comment {
  replies: Comment[];
}

export interface MediaAsset {
  id: string;
  ownerId: string;
  kind: "image" | "video";
  usage: "avatar" | "pet_avatar" | "post" | "kyc" | "other";
  storageKey: string;
  url?: string | null;
  thumbnailUrl?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  width?: number | null;
  height?: number | null;
  durationSec?: number | null;
  status: "uploaded" | "processing" | "ready" | "failed";
  createdAt: string;
  updatedAt: string;
}

export interface Owner {
  accountId: string;
  uuid: string;
  email?: string | null;
  passwordHash?: string | null;
  displayName: string;
  avatarUrl: string | null;
  maxPets: number;
  city?: string | null;
  region?: string | null;
  createdAt: string;
  updatedAt: string;
  isActive: number;
  isVerified?: number;
  idLicenseFrontUrl?: string | null;
  idLicenseBackUrl?: string | null;
  faceWithLicenseUrl?: string | null;
}

export interface Account {
  accountId: string;
  email: string;
  passwordHash: string;
  realName?: string | null;
  idNumber?: string | null;
  phoneNumber?: string | null;
  isVerified: number;
  idLicenseFrontUrl?: string | null;
  idLicenseBackUrl?: string | null;
  faceWithLicenseUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminAccount {
  id: number;
  adminId: string;
  permission: string;
  createdAt: string;
  lastAt: string | null;
  updatedAt: string;
}
