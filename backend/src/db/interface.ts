import { Comment, CommentThread, Post } from "./models";

export interface CreatePostInput {
  authorId: string; // owner uuid
  body: string | null;
  visibility?: string;
  postType?: string;
  mediaCount?: number;
  originPostId?: string | null;
}

export interface DBClient {
  ping(): Promise<boolean>;
  createPost(input: CreatePostInput): Promise<Post>;
  getPostsByOwner(ownerUuid: string, limit?: number, currentOwnerUuid?: string): Promise<Post[]>;
  listRecentPosts(limit?: number, currentOwnerUuid?: string): Promise<Post[]>;
  getPostById(id: string): Promise<Post | null>;
  getCommentById(commentId: string, currentOwnerUuid?: string): Promise<Comment | null>;
  getLatestComment(postId: string, currentOwnerUuid?: string): Promise<Comment | null>;
  getOwnerByEmail(email: string): Promise<import("./models").Owner | null>;
  getOwnerByUuid(uuid: string): Promise<import("./models").Owner | null>;
  getOwnerByAccountId(accountId: string): Promise<import("./models").Owner | null>;
  isFriends(ownerId: string, friendId: string): Promise<boolean>;
  hasLiked(postId: string, ownerId: string): Promise<boolean>;
  likePost(postId: string, ownerId: string): Promise<void>;
  unlikePost(postId: string, ownerId: string): Promise<void>;
  toggleLike(postId: string, ownerId: string): Promise<{ isLiked: boolean; likeCount: number }>;
  updateRepostCount(postId: string): Promise<number>;
  createComment(input: { postId: string; ownerId: string; content: string; parentCommentId?: string | null }): Promise<Comment>;
  toggleCommentLike(commentId: string, ownerId: string): Promise<{ isLiked: boolean; likeCount: number }>;
  listPostCommentsThread(
    postId: string,
    limit: number,
    cursor?: string | null,
    currentOwnerUuid?: string
  ): Promise<{ items: CommentThread[]; nextCursor: string | null; hasMore: boolean }>;
  createOwner(input: {
    accountId: string;
    uuid: string;
    displayName: string;
    avatarUrl?: string | null;
  }): Promise<import("./models").Owner>;
  createAccount(input: {
    accountId: string;
    email: string;
    passwordHash: string;
    realName?: string | null;
    idNumber?: string | null;
    phoneNumber?: string | null;
  }): Promise<import("./models").Account>;
  getAccountById(accountId: string): Promise<import("./models").Account | null>;
  getAccountByEmail(email: string): Promise<import("./models").Account | null>;
  createMediaAsset(input: {
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
    status?: "uploaded" | "processing" | "ready" | "failed";
  }): Promise<import("./models").MediaAsset>;
  getMediaAssetsByIds(ids: string[]): Promise<import("./models").MediaAsset[]>;
  attachMediaToPost(postId: string, postType: "image_set" | "video", assetIds: string[]): Promise<void>;
  getAdminByAdminId(adminId: string): Promise<import("./models").AdminAccount & { passwordHash: string } | null>;
  updateAdminLastAt(adminId: string, ts: string): Promise<void>;
  updateAdminPassword(adminId: string, passwordHash: string): Promise<void>;
  updateOwnerLocation(ownerUuid: string, city: string, region: string): Promise<import("./models").Owner>;
  updateAccountVerificationUrls(
    accountId: string,
    urls: { frontUrl?: string | null; backUrl?: string | null; faceUrl?: string | null; setPending?: boolean }
  ): Promise<void>;
  updateAccountVerificationStatus(accountId: string, status: number): Promise<void>;
  countVerificationStatuses(): Promise<{ pending: number; verified: number; awaiting: number; failed: number }>;
  listVerifications(): Promise<
    Array<{
      accountId: string;
      realName: string | null;
      phoneNumber: string | null;
      idNumber: string | null;
      createdAt: string;
      isVerified: number;
    }>
  >;
  listAdminAccounts(): Promise<import("./models").AdminAccount[]>;
  createAdminAccount(input: { adminId: string; password: string; permission: string }): Promise<import("./models").AdminAccount>;
}
