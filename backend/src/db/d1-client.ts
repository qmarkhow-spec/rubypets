import { DBClient, CreatePostInput } from "./interface";
import { Owner, Post, Account, AdminAccount, MediaAsset } from "./models";

type PostRow = {
  id: string;
  owner_id: string;
  content_text: string | null;
  visibility: string;
  post_type: string;
  media_count: number;
  like_count?: number | null;
  comment_count?: number | null;
  media_key?: string | null;
  created_at: string;
  is_deleted?: number | null;
  author_handle?: string | null;
  author_display_name?: string | null;
};

type MediaAssetRow = {
  id: string;
  owner_id: string;
  kind: string;
  usage: string;
  storage_key: string;
  url: string | null;
  thumbnail_url: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_sec: number | null;
  status: string;
  created_at: string;
  updated_at: string;
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
  face_with_license_url: string | null;
};

type AccountRow = {
  account_id: string;
  email: string;
  password_hash: string;
  real_name: string | null;
  id_number: string | null;
  phone_number: string | null;
  is_verified: number;
  id_license_front_url: string | null;
  id_license_back_url: string | null;
  face_with_license_url: string | null;
  created_at: string;
  updated_at: string;
};

type VerificationRow = {
  account_id: string;
  real_name: string | null;
  id_number: string | null;
  phone_number: string | null;
  created_at: string;
  is_verified: number;
};

type AdminAccountRow = {
  id: number;
  admin_id: string;
  password: string;
  permission: string;
  created_at: string;
  last_at: string | null;
  updated_at: string;
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
    const visibility = input.visibility ?? "public";
    const postType = input.postType ?? "text";
    const mediaCount = input.mediaCount ?? 0;

    await this.db
      .prepare(
        `
          insert into posts (id, owner_id, content_text, visibility, post_type, media_count, created_at, updated_at)
          values (?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .bind(id, input.authorId, input.body ?? null, visibility, postType, mediaCount, createdAt, createdAt)
      .run();

    return {
      id,
      authorId: input.authorId,
      body: input.body ?? null,
      mediaKey: null,
      createdAt,
      visibility,
      postType,
      mediaCount
    };
  }

  async getPostsByOwner(ownerUuid: string, limit = 20): Promise<Post[]> {
    const { results } = await this.db
      .prepare(
        `
              select
                p.id,
                p.owner_id,
                p.content_text,
                p.visibility,
                p.post_type,
                p.media_count,
                p.like_count,
                p.comment_count,
                p.is_deleted,
                p.created_at,
                o.display_name as author_display_name
              from posts p
              left join owners o on o.uuid = p.owner_id
              where p.owner_id = ? and p.is_deleted = 0
              order by p.created_at desc
              limit ?
        `
      )
      .bind(ownerUuid, limit)
      .all<PostRow>();

    const posts = (results ?? []).map(mapPostRow);
    await this.populateMedia(posts);
    return posts;
  }

  async listRecentPosts(limit = 20): Promise<Post[]> {
    const { results } = await this.db
      .prepare(
        `
              select
                p.id,
                p.owner_id,
                p.content_text,
                p.visibility,
                p.post_type,
                p.media_count,
                p.like_count,
                p.comment_count,
                p.is_deleted,
                p.created_at,
                o.display_name as author_display_name
              from posts p
              left join owners o on o.uuid = p.owner_id
              where p.is_deleted = 0
              order by p.created_at desc
              limit ?
        `
      )
      .bind(limit)
      .all<PostRow>();

    const posts = (results ?? []).map(mapPostRow);
    await this.populateMedia(posts);
    return posts;
  }

  async getPostById(id: string): Promise<Post | null> {
    const row = await this.db
      .prepare(
        `
          select
            p.id,
            p.owner_id,
            p.content_text,
            p.visibility,
            p.post_type,
            p.media_count,
            p.like_count,
            p.comment_count,
            p.is_deleted,
            p.created_at,
            o.display_name as author_display_name
          from posts p
          left join owners o on o.uuid = p.owner_id
          where p.id = ?
        `
      )
      .bind(id)
      .first<PostRow>();
    if (!row) return null;
    const post = mapPostRow(row);
    await this.populateMedia([post]);
    return post;
  }

  async createMediaAsset(input: {
    ownerId: string;
    kind: "image" | "video";
    usage: "avatar" | "pet_avatar" | "post" | "kyc" | "other";
    storageKey: string;
    url?: string | null;
    thumbnailUrl?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
    width?: number | null;
    height?: number | null;
    durationSec?: number | null;
    status?: "uploaded" | "processing" | "ready" | "failed";
  }): Promise<MediaAsset> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `
          insert into media_assets (
            id, owner_id, kind, usage, storage_key, url, thumbnail_url, mime_type, size_bytes,
            width, height, duration_sec, status, created_at, updated_at
          )
          values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .bind(
        id,
        input.ownerId,
        input.kind,
        input.usage,
        input.storageKey,
        input.url ?? null,
        input.thumbnailUrl ?? null,
        input.mimeType ?? null,
        input.sizeBytes ?? null,
        input.width ?? null,
        input.height ?? null,
        input.durationSec ?? null,
        input.status ?? "uploaded",
        now,
        now
      )
      .run();

    const row = await this.db
      .prepare(
        `
          select id, owner_id, kind, usage, storage_key, url, thumbnail_url, mime_type, size_bytes,
                 width, height, duration_sec, status, created_at, updated_at
          from media_assets
          where id = ?
        `
      )
      .bind(id)
      .first<MediaAssetRow>();

    if (!row) throw new Error("Failed to create media asset");
    return mapMediaAssetRow(row);
  }

  async getMediaAssetsByIds(ids: string[]): Promise<MediaAsset[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(",");
    const { results } = await this.db
      .prepare(
        `
          select id, owner_id, kind, usage, storage_key, url, thumbnail_url, mime_type, size_bytes,
                 width, height, duration_sec, status, created_at, updated_at
          from media_assets
          where id in (${placeholders})
        `
      )
      .bind(...ids)
      .all<MediaAssetRow>();
    return (results ?? []).map(mapMediaAssetRow);
  }

  async attachMediaToPost(postId: string, postType: "image_set" | "video", assetIds: string[]): Promise<void> {
    const now = new Date().toISOString();
    const inserts = assetIds.map((assetId, idx) =>
      this.db
        .prepare(
          `
            insert into post_media (id, post_id, asset_id, order_index, created_at)
            values (?, ?, ?, ?, ?)
          `
        )
        .bind(crypto.randomUUID(), postId, assetId, idx, now)
        .run()
    );
    for (const p of inserts) {
      await p;
    }

    await this.db
      .prepare(
        `
          update posts
          set post_type = ?, media_count = ?, updated_at = ?
          where id = ?
        `
      )
      .bind(postType, assetIds.length, now, postId)
      .run();
  }

  async listAdminPosts(limit = 20, offset = 0): Promise<Post[]> {
    const { results } = await this.db
      .prepare(
        `
          select
            p.id,
            p.owner_id,
            p.content_text,
            p.visibility,
            p.post_type,
            p.media_count,
            p.is_deleted,
            p.created_at,
            o.display_name as author_display_name
          from posts p
          left join owners o on o.uuid = p.owner_id
          order by p.created_at desc
          limit ? offset ?
        `
      )
      .bind(limit, offset)
      .all<PostRow>();
    const posts = (results ?? []).map(mapPostRow);
    await this.populateMedia(posts);
    return posts;
  }

  async markPostDeleted(postId: string): Promise<void> {
    const ts = new Date().toISOString();
    await this.db.prepare(`update posts set is_deleted = 1, updated_at = ? where id = ?`).bind(ts, postId).run();
  }

  async getPostAssets(postId: string): Promise<{ assetId: string; kind: string; storageKey: string }[]> {
    const { results } = await this.db
      .prepare(
        `
          select ma.id as asset_id, ma.kind, ma.storage_key
          from post_media pm
          join media_assets ma on ma.id = pm.asset_id
          where pm.post_id = ?
          order by pm.order_index
        `
      )
      .bind(postId)
      .all<{ asset_id: string; kind: string; storage_key: string }>();
    return (results ?? []).map((r) => ({ assetId: r.asset_id, kind: r.kind, storageKey: r.storage_key }));
  }

  async deletePostMediaAndAssets(postId: string, assetIds: string[]): Promise<void> {
    if (assetIds.length === 0) return;
    const placeholders = assetIds.map(() => "?").join(",");
    await this.db.prepare(`delete from post_media_pet_tags where post_id = ?`).bind(postId).run();
    await this.db.prepare(`delete from post_media where post_id = ?`).bind(postId).run();
    await this.db.prepare(`delete from media_assets where id in (${placeholders})`).bind(...assetIds).run();
  }

  async deletePostCascade(postId: string, assetIds: string[]): Promise<void> {
    await this.deletePostMediaAndAssets(postId, assetIds);
    await this.db.prepare(`delete from post_likes where post_id = ?`).bind(postId).run();
    await this.db.prepare(`delete from post_comments where post_id = ?`).bind(postId).run();
    await this.db.prepare(`delete from post_shares where post_id = ?`).bind(postId).run();
    await this.db.prepare(`delete from posts where id = ?`).bind(postId).run();
  }

  async hasLiked(postId: string, ownerId: string): Promise<boolean> {
    // Handle legacy rows that may have stored the numeric owners.id instead of uuid
    const ownerRow = await this.db.prepare(`select id from owners where uuid = ?`).bind(ownerId).first<{ id: number }>();
    const numericOwnerId = ownerRow?.id ?? -1;
    const row = await this.db
      .prepare(`select id from post_likes where post_id = ? and owner_id = ? limit 1`)
      .bind(postId, ownerId, numericOwnerId)
      .first();
    return !!row;
  }

  async likePost(postId: string, ownerId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `
          insert into post_likes (id, post_id, owner_id, created_at)
          values (?, ?, ?, ?)
        `
      )
      .bind(crypto.randomUUID(), postId, ownerId, now)
      .run();
    await this.db
      .prepare(
        `
          update posts
          set like_count = (select count(*) from post_likes where post_id = ?)
          where id = ?
        `
      )
      .bind(postId, postId)
      .run();
  }

  async unlikePost(postId: string, ownerId: string): Promise<void> {
    const ownerRow = await this.db.prepare(`select id from owners where uuid = ?`).bind(ownerId).first<{ id: number }>();
    const numericOwnerId = ownerRow?.id ?? -1;
    await this.db
      .prepare(`delete from post_likes where post_id = ? and owner_id = ? `)
      .bind(postId, ownerId, numericOwnerId)
      .run();
    await this.db
      .prepare(
        `
          update posts
          set like_count = (select count(*) from post_likes where post_id = ?)
          where id = ?
        `
      )
      .bind(postId, postId)
      .run();
  }

  async createComment(postId: string, ownerId: string, content: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `
          insert into post_comments (post_id, owner_id, content_text, created_at, updated_at, is_deleted, like_count)
          values (?, ?, ?, ?, ?, 0, 0)
        `
      )
      .bind(postId, ownerId, content, now, now)
      .run();
    await this.db.prepare(`update posts set comment_count = comment_count + 1 where id = ?`).bind(postId).run();
  }

  async getLatestComment(postId: string): Promise<{ ownerId: string; content: string; createdAt: string } | null> {
    const row = await this.db
      .prepare(
        `
          select owner_id, content_text, created_at
          from post_comments
          where post_id = ? and is_deleted = 0
          order by created_at desc
          limit 1
        `
      )
      .bind(postId)
      .first<{ owner_id: string; content_text: string; created_at: string }>();
    if (!row) return null;
    return { ownerId: row.owner_id, content: row.content_text, createdAt: row.created_at };
  }

  private async populateMedia(posts: Post[]): Promise<void> {
    if (posts.length === 0) return;
    const ids = posts.map((p) => p.id);
    const placeholders = ids.map(() => "?").join(",");
    const { results } = await this.db
      .prepare(
        `
          select pm.post_id, ma.url
          from post_media pm
          join media_assets ma on ma.id = pm.asset_id
          where pm.post_id in (${placeholders})
          order by pm.post_id, pm.order_index
        `
      )
      .bind(...ids)
      .all<{ post_id: string; url: string | null }>();

    const grouped = new Map<string, string[]>();
    for (const row of results ?? []) {
      const arr = grouped.get(row.post_id) ?? [];
      if (row.url) arr.push(this.sanitizeStreamUrl(row.url));
      grouped.set(row.post_id, arr);
    }
    for (const p of posts) {
      p.mediaUrls = grouped.get(p.id) ?? [];
    }
  }

  // Fix legacy/badly formatted Cloudflare Stream URLs that might contain duplicated customer- or host segments.
  // Example bad: https://customer-customer-abc.cloudflarestream.com.cloudflarestream.com/uid/manifest/video.m3u8
  // Example good: https://customer-abc.cloudflarestream.com/uid/manifest/video.m3u8
  private sanitizeStreamUrl(url: string | null): string | null {
    if (!url) return url;
    let cleaned = url.replace(/customer-customer-/gi, "customer-");
    cleaned = cleaned.replace(/\.cloudflarestream\.com\.cloudflarestream\.com/gi, ".cloudflarestream.com");
    return cleaned;
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
            a.face_with_license_url
          from owners o
          join accounts a on a.id = o.account_id
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
            a.face_with_license_url
          from owners o
          join accounts a on a.id = o.account_id
          where o.uuid = ?
        `
      )
      .bind(uuid)
      .first<OwnerRow>();

    return row ? mapOwnerRow(row) : null;
  }

  async getOwnerByAccountId(accountId: string): Promise<Owner | null> {
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
            a.face_with_license_url
          from owners o
          join accounts a on a.id = o.account_id
          where o.account_id = ?
        `
      )
      .bind(accountId)
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
    idNumber?: string | null;
    phoneNumber?: string | null;
  }): Promise<Account> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `
          insert into accounts (id, email, password_hash, real_name, id_number, phone_number, is_verified, created_at, updated_at, face_with_license_url, id_license_front_url, id_license_back_url)
          values (?, ?, ?, ?, ?, ?, 0, ?, ?, NULL, NULL, NULL)
        `
      )
      .bind(
        input.accountId,
        input.email,
        input.passwordHash,
        input.realName ?? null,
        input.idNumber ?? null,
        input.phoneNumber ?? null,
        now,
        now
      )
      .run();

    const row = await this.db
      .prepare(
        `
          select id as account_id, email, password_hash, real_name, id_number, phone_number, is_verified, id_license_front_url, id_license_back_url, face_with_license_url, created_at, updated_at
          from accounts
          where id = ?
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

  async getAccountById(accountId: string): Promise<Account | null> {
    const row = await this.db
      .prepare(
        `
          select id as account_id, email, password_hash, real_name, id_number, phone_number, is_verified,
                 id_license_front_url, id_license_back_url, face_with_license_url, created_at, updated_at
          from accounts
          where id = ?
        `
      )
      .bind(accountId)
      .first<AccountRow>();
    return row ? mapAccountRow(row) : null;
  }

  async getAccountByEmail(email: string): Promise<Account | null> {
    const row = await this.db
      .prepare(
        `
          select id as account_id, email, password_hash, real_name, id_number, phone_number, is_verified,
                 id_license_front_url, id_license_back_url, face_with_license_url, created_at, updated_at
          from accounts
          where email = ?
        `
      )
      .bind(email)
      .first<AccountRow>();
    return row ? mapAccountRow(row) : null;
  }

  async updateAccountVerificationUrls(
    accountId: string,
    urls: { frontUrl?: string | null; backUrl?: string | null; faceUrl?: string | null; setPending?: boolean }
  ): Promise<void> {
    const updatedAt = new Date().toISOString();
    const setPendingClause = urls.setPending ? ", is_verified = case when is_verified = 0 then 2 else is_verified end" : "";
    await this.db
      .prepare(
        `
          update accounts
          set
            id_license_front_url = coalesce(?, id_license_front_url),
            id_license_back_url = coalesce(?, id_license_back_url),
            face_with_license_url = coalesce(?, face_with_license_url),
            updated_at = ?${setPendingClause}
          where id = ?
        `
      )
      .bind(urls.frontUrl ?? null, urls.backUrl ?? null, urls.faceUrl ?? null, updatedAt, accountId)
      .run();
  }

  async updateAccountVerificationStatus(accountId: string, status: number): Promise<void> {
    const updatedAt = new Date().toISOString();
    await this.db
      .prepare(
        `
          update accounts
          set is_verified = ?, updated_at = ?
          where account_id = ?
        `
      )
      .bind(status, updatedAt, accountId)
      .run();
  }

  async countVerificationStatuses(): Promise<{ pending: number; verified: number; awaiting: number; failed: number }> {
    const row = await this.db
      .prepare(
        `
          select
            sum(case when is_verified = 2 then 1 else 0 end) as pending,
            sum(case when is_verified = 1 then 1 else 0 end) as verified,
            sum(case when is_verified = 0 then 1 else 0 end) as awaiting,
            sum(case when is_verified = 3 then 1 else 0 end) as failed
          from accounts
        `
      )
      .first<{ pending: number; verified: number; awaiting: number; failed: number }>();
    return {
      pending: row?.pending ?? 0,
      verified: row?.verified ?? 0,
      awaiting: row?.awaiting ?? 0,
      failed: row?.failed ?? 0
    };
  }

  async listVerifications(): Promise<
    Array<{
      accountId: string;
      realName: string | null;
      phoneNumber: string | null;
      idNumber: string | null;
      createdAt: string;
      isVerified: number;
    }>
  > {
    const { results } = await this.db
      .prepare(
        `
          select account_id, real_name, id_number, phone_number, is_verified, created_at
          from accounts
          order by created_at desc
        `
      )
      .all<VerificationRow>();

    return (results ?? []).map((row) => ({
      accountId: row.account_id,
      realName: row.real_name ?? null,
      idNumber: row.id_number ?? null,
      phoneNumber: row.phone_number ?? null,
      createdAt: row.created_at,
      isVerified: row.is_verified
    }));
  }

  async listAdminAccounts(): Promise<AdminAccount[]> {
    const { results } = await this.db
      .prepare(
        `
          select id, admin_id, permission, created_at, last_at, updated_at
          from admin_accounts
          order by id desc
        `
      )
      .all<AdminAccountRow>();
    return (results ?? []).map(mapAdminAccountRow);
  }

  async createAdminAccount(input: { adminId: string; password: string; permission: string }): Promise<AdminAccount> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `
          insert into admin_accounts (admin_id, password, permission, created_at, updated_at)
          values (?, ?, ?, ?, ?)
        `
      )
      .bind(input.adminId, input.password, input.permission, now, now)
      .run();

    const row = await this.db
      .prepare(
        `
          select id, admin_id, permission, created_at, last_at, updated_at
          from admin_accounts
          where admin_id = ?
        `
      )
      .bind(input.adminId)
      .first<AdminAccountRow>();
    if (!row) throw new Error("Failed to create admin account");
    return mapAdminAccountRow(row);
  }

  async getAdminByAdminId(adminId: string): Promise<(AdminAccount & { passwordHash: string }) | null> {
    const row = await this.db
      .prepare(
        `
          select id, admin_id, password, permission, created_at, last_at, updated_at
          from admin_accounts
          where admin_id = ?
        `
      )
      .bind(adminId)
      .first<AdminAccountRow>();
    if (!row) return null;
    return { ...mapAdminAccountRow(row), passwordHash: row.password };
  }

  async updateAdminLastAt(adminId: string, ts: string): Promise<void> {
    await this.db.prepare(`update admin_accounts set last_at = ? where admin_id = ?`).bind(ts, adminId).run();
  }

  async updateAdminPassword(adminId: string, passwordHash: string): Promise<void> {
    const ts = new Date().toISOString();
    await this.db
      .prepare(`update admin_accounts set password = ?, updated_at = ? where admin_id = ?`)
      .bind(passwordHash, ts, adminId)
      .run();
  }
}

function mapPostRow(row: PostRow): Post {
  return {
    id: row.id,
    authorId: row.owner_id,
    body: row.content_text ?? null,
    mediaKey: row.media_key ?? null,
    createdAt: row.created_at,
    authorDisplayName: row.author_display_name ?? null,
    visibility: row.visibility,
    postType: row.post_type,
    mediaCount: row.media_count,
    likeCount: row.like_count ?? 0,
    commentCount: row.comment_count ?? 0,
    isDeleted: row.is_deleted ?? 0
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
    faceWithLicenseUrl: row.face_with_license_url ?? null
  };
}

function mapAccountRow(row: AccountRow): Account {
  return {
    accountId: row.account_id,
    email: row.email,
    passwordHash: row.password_hash,
    realName: row.real_name ?? null,
    idNumber: row.id_number ?? null,
    phoneNumber: row.phone_number ?? null,
    isVerified: row.is_verified,
    idLicenseFrontUrl: row.id_license_front_url ?? null,
    idLicenseBackUrl: row.id_license_back_url ?? null,
    faceWithLicenseUrl: row.face_with_license_url ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapAdminAccountRow(row: AdminAccountRow): AdminAccount {
  return {
    id: row.id,
    adminId: row.admin_id,
    permission: row.permission,
    createdAt: row.created_at,
    lastAt: row.last_at ?? null,
    updatedAt: row.updated_at
  };
}

function mapMediaAssetRow(row: MediaAssetRow): MediaAsset {
  return {
    id: row.id,
    ownerId: row.owner_id,
    kind: row.kind as MediaAsset["kind"],
    usage: row.usage as MediaAsset["usage"],
    storageKey: row.storage_key,
    url: row.url ?? null,
    thumbnailUrl: row.thumbnail_url ?? null,
    mimeType: row.mime_type ?? null,
    sizeBytes: row.size_bytes ?? null,
    width: row.width ?? null,
    height: row.height ?? null,
    durationSec: row.duration_sec ?? null,
    status: row.status as MediaAsset["status"],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
