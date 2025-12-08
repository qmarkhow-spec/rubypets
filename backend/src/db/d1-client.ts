import { DBClient, CreatePostInput } from "./interface";
import { Post } from "./models";

type PostRow = {
  id: string;
  author_id: string;
  body: string;
  media_key: string | null;
  created_at: string;
  author_handle?: string | null;
  author_display_name?: string | null;
};

export class D1Client implements DBClient {
  private readonly db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async ping(): Promise<boolean> {
    const row = await this.db.prepare("select 1 as ok").first<{ ok: number }>();
    return row?.ok === 1;
  }

  async createPost(input: CreatePostInput): Promise<Post> {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const mediaKey = input.mediaKey ?? null;

    await this.db
      .prepare(
        `
          insert into posts (id, author_id, body, media_key, created_at)
          values (?, ?, ?, ?, ?)
        `
      )
      .bind(id, input.authorId, input.body, mediaKey, createdAt)
      .run();

    return {
      id,
      authorId: input.authorId,
      body: input.body,
      mediaKey,
      createdAt
    };
  }

  async getPostsByUser(userId: string, limit = 20): Promise<Post[]> {
    const { results } = await this.db
      .prepare(
        `
          select
            p.id,
            p.author_id,
            p.body,
            p.media_key,
            p.created_at,
            u.handle as author_handle,
            u.display_name as author_display_name
          from posts p
          left join users u on u.id = p.author_id
          where p.author_id = ?
          order by p.created_at desc
          limit ?
        `
      )
      .bind(userId, limit)
      .all<PostRow>();

    return (results ?? []).map(mapPostRow);
  }

  async listRecentPosts(limit = 20): Promise<Post[]> {
    const { results } = await this.db
      .prepare(
        `
          select
            p.id,
            p.author_id,
            p.body,
            p.media_key,
            p.created_at,
            u.handle as author_handle,
            u.display_name as author_display_name
          from posts p
          left join users u on u.id = p.author_id
          order by p.created_at desc
          limit ?
        `
      )
      .bind(limit)
      .all<PostRow>();

    return (results ?? []).map(mapPostRow);
  }
}

function mapPostRow(row: PostRow): Post {
  return {
    id: row.id,
    authorId: row.author_id,
    body: row.body,
    mediaKey: row.media_key,
    createdAt: row.created_at,
    authorHandle: row.author_handle ?? null,
    authorDisplayName: row.author_display_name ?? null
  };
}
