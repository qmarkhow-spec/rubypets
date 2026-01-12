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
  storageProvider: "r2" | "cf_media";
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
  ipAllowlist?: string | null;
  createdAt: string;
  lastAt: string | null;
  updatedAt: string;
}

export interface OwnerPublic {
  uuid: string;
  displayName: string;
  avatarUrl?: string | null;
  city?: string | null;
  region?: string | null;
}

export interface FriendshipRequestItem {
  otherOwner: OwnerPublic;
  createdAt: string;
}

export interface Pet {
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
  createdAt: string;
  updatedAt: string;
  isActive: number;
}

export type ChatRequestState = "none" | "pending" | "accepted" | "rejected";

export interface ChatThread {
  id: string;
  ownerAId: string;
  ownerBId: string;
  pairKey: string;
  requestState: ChatRequestState;
  requestSenderId?: string | null;
  requestMessageId?: string | null;
  lastMessageId?: string | null;
  lastActivityAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ChatThreadParticipant {
  threadId: string;
  ownerId: string;
  lastReadMessageId?: string | null;
  archivedAt?: string | null;
  deletedAt?: string | null;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  senderId: string;
  bodyText: string;
  createdAt: string;
}

export interface ChatThreadListItem {
  threadId: string;
  requestState: ChatRequestState;
  requestSenderId?: string | null;
  requestMessageId?: string | null;
  lastMessageId?: string | null;
  lastActivityAt?: string | null;
  lastMessagePreview?: string | null;
  lastReadMessageId?: string | null;
  unreadCount?: number;
  archivedAt?: string | null;
  deletedAt?: string | null;
  otherOwner: OwnerPublic;
}
