import { Post } from "./models";

export interface CreatePostInput {
  authorId: string;
  body: string;
  mediaKey?: string | null;
}

export interface DBClient {
  ping(): Promise<boolean>;
  createPost(input: CreatePostInput): Promise<Post>;
  getPostsByUser(userId: string, limit?: number): Promise<Post[]>;
  listRecentPosts(limit?: number): Promise<Post[]>;
  getUserByEmail(email: string): Promise<import("./models").User | null>;
  getUserByHandle(handle: string): Promise<import("./models").User | null>;
  getUserById(id: string): Promise<import("./models").User | null>;
  createUser(input: {
    handle: string;
    displayName: string;
    email?: string | null;
    passwordHash?: string | null;
  }): Promise<import("./models").User>;
}
