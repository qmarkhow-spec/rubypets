import { DBClient, CreatePostInput } from "./interface";
import { Owner, Post, Account } from "./models";

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
  account_id: string;
  uuid: string;
  email: string | null;
  password_hash: string | null;
  display_name: string;
  avatar_url: string | null;
  max_pets: number;
  city: string | null;
  region: string | null;
  created_at: string;
  updated_at: string;
  is_active: number;
  is_verified: number | null;
  id_license_front_url: string | null;
  id_license_back_url: string | null;
  face_with_license_urll: string | null;
};

type AccountRow = {
  account_id: string;
  email: string;
  password_hash: string;
  real_name: string | null;
  phone_number: string | null;
  is_verified: number;
  id_license_front_url: string | null;
  id_license_back_url: string | null;
  face_with_license_urll: string | null;
  created_at: string;
  updated_at: string;
};

type PendingVerificationRow = {
  account_id: string;
  real_name: string | null;
  phone_number: string | null;
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
          select
            o.account_id,
            o.uuid,
            a.email,
            a.password_hash,
            o.display_name,
            o.avatar_url,
            o.max_pets,
            o.city,
            o.region,
            o.created_at,
            o.updated_at,
            o.is_active,
            a.is_verified,
            a.id_license_front_url,
            a.id_license_back_url,
            a.face_with_license_urll
          from owners o
          join accounts a on a.account_id = o.account_id
          where a.email = ?
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
          select
            o.account_id,
            o.uuid,
            a.email,
            a.password_hash,
            o.display_name,
            o.avatar_url,
            o.max_pets,
            o.city,
            o.region,
            o.created_at,
            o.updated_at,
            o.is_active,
            a.is_verified,
            a.id_license_front_url,
            a.id_license_back_url,
            a.face_with_license_urll
          from owners o
          join accounts a on a.account_id = o.account_id
          where o.uuid = ?
        `
      )
      .bind(uuid)
      .first<OwnerRow>();

    return row ? mapOwnerRow(row) : null;
  }

  async createOwner(input: {
    accountId: string;
    uuid: string;
    displayName: string;
    avatarUrl?: string | null;
  }): Promise<Owner> {
    const createdAt = new Date().toISOString();
    await this.db
      .prepare(
        `
          insert into owners (account_id, uuid, display_name, avatar_url, city, region, created_at, updated_at)
          values (?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .bind(
        input.accountId,
        input.uuid,
        input.displayName,
        input.avatarUrl ?? null,
        null,
        null,
        createdAt,
        createdAt
      )
      .run();

    const row = await this.getOwnerByUuid(input.uuid);
    if (!row) {
      throw new Error("Failed to create owner");
    }
    return row;
  }

  async createAccount(input: {
    accountId: string;
    email: string;
    passwordHash: string;
    realName?: string | null;
    phoneNumber?: string | null;
  }): Promise<Account> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `
          insert into accounts (account_id, email, password_hash, real_name, phone_number, is_verified, created_at, updated_at)
          values (?, ?, ?, ?, ?, 0, ?, ?)
        `
      )
      .bind(input.accountId, input.email, input.passwordHash, input.realName ?? null, input.phoneNumber ?? null, now, now)
      .run();

    const row = await this.db
      .prepare(
        `
          select account_id, email, password_hash, real_name, phone_number, is_verified, id_license_front_url, id_license_back_url, face_with_license_urll, created_at, updated_at
          from accounts
          where account_id = ?
        `
      )
      .bind(input.accountId)
      .first<AccountRow>();

    if (!row) throw new Error("Failed to create account");
    return mapAccountRow(row);
  }

  async updateOwnerLocation(ownerUuid: string, city: string, region: string): Promise<Owner> {
    const updatedAt = new Date().toISOString();
    await this.db
      .prepare(
        `
          update owners
          set city = ?, region = ?, updated_at = ?
          where uuid = ?
        `
      )
      .bind(city, region, updatedAt, ownerUuid)
      .run();

    const row = await this.getOwnerByUuid(ownerUuid);
    if (!row) {
      throw new Error("Owner not found");
    }
    return row;
  }

  async updateAccountVerificationUrls(
    accountId: string,
    urls: { frontUrl?: string | null; backUrl?: string | null; faceUrl?: string | null }
  ): Promise<void> {
    const updatedAt = new Date().toISOString();
    await this.db
      .prepare(
        `
          update accounts
          set
            id_license_front_url = coalesce(?, id_license_front_url),
            id_license_back_url = coalesce(?, id_license_back_url),
            face_with_license_urll = coalesce(?, face_with_license_urll),
            updated_at = ?
          where account_id = ?
        `
      )
      .bind(urls.frontUrl ?? null, urls.backUrl ?? null, urls.faceUrl ?? null, updatedAt, accountId)
      .run();
  }

  async countPendingVerifications(): Promise<number> {
    const row = await this.db
      .prepare(
        `
          select count(*) as pending
          from accounts
          where is_verified = 0
        `
      )
      .first<{ pending: number }>();
    return row?.pending ?? 0;
  }

  async listPendingVerifications(): Promise<
    Array<{ accountId: string; realName: string | null; phoneNumber: string | null; createdAt: string }>
  > {
    const { results } = await this.db
      .prepare(
        `
          select account_id, real_name, phone_number, created_at
          from accounts
          where is_verified = 0
          order by created_at desc
        `
      )
      .all<PendingVerificationRow>();

    return (results ?? []).map((row) => ({
      accountId: row.account_id,
      realName: row.real_name ?? null,
      phoneNumber: row.phone_number ?? null,
      createdAt: row.created_at
    }));
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
    accountId: row.account_id,
    uuid: row.uuid,
    displayName: row.display_name,
    email: row.email ?? null,
    avatarUrl: row.avatar_url ?? null,
    passwordHash: row.password_hash ?? undefined,
    maxPets: row.max_pets,
    city: row.city ?? null,
    region: row.region ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isActive: row.is_active,
    isVerified: row.is_verified ?? 0,
    idLicenseFrontUrl: row.id_license_front_url ?? null,
    idLicenseBackUrl: row.id_license_back_url ?? null,
    faceWithLicenseUrl: row.face_with_license_urll ?? null
  };
}

function mapAccountRow(row: AccountRow): Account {
  return {
    accountId: row.account_id,
    email: row.email,
    passwordHash: row.password_hash,
    realName: row.real_name ?? null,
    phoneNumber: row.phone_number ?? null,
    isVerified: row.is_verified,
    idLicenseFrontUrl: row.id_license_front_url ?? null,
    idLicenseBackUrl: row.id_license_back_url ?? null,
    faceWithLicenseUrl: row.face_with_license_urll ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
