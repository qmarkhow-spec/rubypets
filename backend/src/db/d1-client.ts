import { DBClient, CreatePostInput } from "./interface";
import { Post, User } from "./models";

type PostRow = {
  id: string;
  author_id: string;
  body: string;
  media_key: string | null;
  created_at: string;
  author_handle?: string | null;
  author_display_name?: string | null;
};

type UserRow = {
  id: string;
  handle: string;
  display_name: string;
  email: string | null;
  avatar_url: string | null;
  password_hash: string | null;
  created_at: string;
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

  async getUserByEmail(email: string): Promise<User | null> {
    const row = await this.db
      .prepare(
        `
          select id, handle, display_name, email, avatar_url, password_hash, created_at
          from users
          where email = ?
        `
      )
      .bind(email)
      .first<UserRow>();

    return row ? mapUserRow(row) : null;
  }

  async getUserByHandle(handle: string): Promise<User | null> {
    const row = await this.db
      .prepare(
        `
          select id, handle, display_name, email, avatar_url, password_hash, created_at
          from users
          where handle = ?
        `
      )
      .bind(handle)
      .first<UserRow>();

    return row ? mapUserRow(row) : null;
  }

  async getUserById(id: string): Promise<User | null> {
    const row = await this.db
      .prepare(
        `
          select id, handle, display_name, email, avatar_url, password_hash, created_at
          from users
          where id = ?
        `
      )
      .bind(id)
      .first<UserRow>();

    return row ? mapUserRow(row) : null;
  }

  async createUser(input: {
    handle: string;
    displayName: string;
    email?: string | null;
    passwordHash?: string | null;
  }): Promise<User> {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    await this.db
      .prepare(
        `
          insert into users (id, handle, display_name, email, password_hash, created_at)
          values (?, ?, ?, ?, ?, ?)
        `
      )
      .bind(id, input.handle, input.displayName, input.email ?? null, input.passwordHash ?? null, createdAt)
      .run();

    return {
      id,
      handle: input.handle,
      displayName: input.displayName,
      email: input.email ?? null,
      avatarUrl: null,
      passwordHash: input.passwordHash ?? null,
      createdAt
    };
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

function mapUserRow(row: UserRow): User {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    email: row.email,
    avatarUrl: row.avatar_url,
    passwordHash: row.password_hash,
    createdAt: row.created_at
  };
}
