import { DBClient } from "../db";
import { Post } from "../db/models";

export interface CreatePostInput {
  authorId: string;
  content: string;
  mediaKey?: string | null;
}

export async function listRecentPosts(db: DBClient, limit = 20): Promise<Post[]> {
  return db.listRecentPosts(limit);
}

export async function getPostsByUser(db: DBClient, userId: string, limit = 20): Promise<Post[]> {
  return db.getPostsByUser(userId, limit);
}

export async function createPost(db: DBClient, input: CreatePostInput): Promise<Post> {
  return db.createPost({
    authorId: input.authorId,
    body: input.content,
    mediaKey: input.mediaKey ?? null
  });
}
