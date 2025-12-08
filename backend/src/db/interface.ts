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
}
