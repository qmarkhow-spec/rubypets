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
    id: string;
    uuid: string;
    displayName: string;
    email: string;
    passwordHash: string;
    avatarUrl?: string | null;
  }): Promise<import("./models").Owner>;
}
