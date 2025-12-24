import { DBClient } from "../db";
import { Post } from "../db/models";

export interface CreatePostInput {
  authorId: string;
  content: string;
  visibility?: string;
  postType?: string;
}

export async function listRecentPosts(db: DBClient, limit = 20, currentOwnerUuid?: string): Promise<Post[]> {
  return db.listRecentPosts(limit, currentOwnerUuid);
}

export async function getPostsByOwner(db: DBClient, ownerUuid: string, limit = 20, currentOwnerUuid?: string): Promise<Post[]> {
  return db.getPostsByOwner(ownerUuid, limit, currentOwnerUuid);
}

export async function createPost(db: DBClient, input: CreatePostInput): Promise<Post> {
  return db.createPost({
    authorId: input.authorId,
    body: input.content,
    visibility: input.visibility ?? "public",
    postType: input.postType ?? "text",
    mediaCount: 0
  });
}
