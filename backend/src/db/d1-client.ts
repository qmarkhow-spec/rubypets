import { DBClient, CreatePostInput } from "./interface";
import { Owner, Post } from "./models";

type PostRow = {
  id: string;
  author_id: string;
  body: string;
  media_key: string | null;
  created_at: string;
  author_handle?: string | null;
  author_display_name?: string | null;
};

type OwnerRow = {
  id: number;
  uuid: string;
  email: string;
  password_hash: string | null;
  display_name: string;
  avatar_url: string | null;
  max_pets: number;
  created_at: string;
  updated_at: string;
  is_active: number;
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

  async getPostsByOwner(ownerUuid: string, limit = 20): Promise<Post[]> {
    const { results } = await this.db
      .prepare(
        `
          select
            p.id,
            p.author_id,
            p.body,
            p.media_key,
            p.created_at,
            o.display_name as author_display_name
          from posts p
          left join owners o on o.uuid = p.author_id
          where p.author_id = ?
          order by p.created_at desc
          limit ?
        `
      )
      .bind(ownerUuid, limit)
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
            o.display_name as author_display_name
          from posts p
          left join owners o on o.uuid = p.author_id
          order by p.created_at desc
          limit ?
        `
      )
      .bind(limit)
      .all<PostRow>();

    return (results ?? []).map(mapPostRow);
  }

  async getOwnerByEmail(email: string): Promise<Owner | null> {
    const row = await this.db
      .prepare(
        `
          select id, uuid, email, password_hash, display_name, avatar_url, max_pets, created_at, updated_at, is_active
          from owners
          where email = ?
        `
      )
      .bind(email)
      .first<OwnerRow>();

    return row ? mapOwnerRow(row) : null;
  }

  async getOwnerByUuid(uuid: string): Promise<Owner | null> {
    const row = await this.db
      .prepare(
        `
          select id, uuid, email, password_hash, display_name, avatar_url, max_pets, created_at, updated_at, is_active
          from owners
          where uuid = ?
        `
      )
      .bind(uuid)
      .first<OwnerRow>();

    return row ? mapOwnerRow(row) : null;
  }

  async createOwner(input: {
    uuid: string;
    displayName: string;
    email: string;
    passwordHash: string;
    avatarUrl?: string | null;
  }): Promise<Owner> {
    const createdAt = new Date().toISOString();
    await this.db
      .prepare(
        `
          insert into owners (uuid, email, password_hash, display_name, avatar_url, created_at, updated_at)
          values (?, ?, ?, ?, ?, ?, ?)
        `
      )
      .bind(input.uuid, input.email, input.passwordHash, input.displayName, input.avatarUrl ?? null, createdAt, createdAt)
      .run();

    const row = await this.getOwnerByUuid(input.uuid);
    if (!row) {
      throw new Error("Failed to create owner");
    }
    return row;
  }
}

function mapPostRow(row: PostRow): Post {
  return {
    id: row.id,
    authorId: row.author_id,
    body: row.body,
    mediaKey: row.media_key,
    createdAt: row.created_at,
    authorDisplayName: row.author_display_name ?? null
  };
}

function mapOwnerRow(row: OwnerRow): Owner {
  return {
    id: row.id,
    uuid: row.uuid,
    displayName: row.display_name,
    email: row.email,
    avatarUrl: row.avatar_url ?? null,
    passwordHash: row.password_hash,
    maxPets: row.max_pets,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isActive: row.is_active
  };
}
