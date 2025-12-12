import { Post } from "./models";

export interface CreatePostInput {
  authorId: string; // owner uuid
  body: string;
  mediaKey?: string | null;
}

export interface DBClient {
  ping(): Promise<boolean>;
  createPost(input: CreatePostInput): Promise<Post>;
  getPostsByOwner(ownerUuid: string, limit?: number): Promise<Post[]>;
  listRecentPosts(limit?: number): Promise<Post[]>;
  getOwnerByEmail(email: string): Promise<import("./models").Owner | null>;
  getOwnerByUuid(uuid: string): Promise<import("./models").Owner | null>;
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
    phoneNumber?: string | null;
  }): Promise<import("./models").Account>;
  updateOwnerLocation(ownerUuid: string, city: string, region: string): Promise<import("./models").Owner>;
  updateAccountVerificationUrls(
    accountId: string,
    urls: { frontUrl?: string | null; backUrl?: string | null; faceUrl?: string | null }
  ): Promise<void>;
  countPendingVerifications(): Promise<number>;
  listPendingVerifications(): Promise<
    Array<{ accountId: string; realName: string | null; phoneNumber: string | null; createdAt: string }>
  >;
}
