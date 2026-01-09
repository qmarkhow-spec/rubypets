import { DBClient, CreatePostInput } from "./interface";
import {
  Owner,
  Post,
  Account,
  AdminAccount,
  MediaAsset,
  Comment,
  CommentThread,
  OwnerPublic,
  FriendshipRequestItem,
  Pet,
  ChatThread,
  ChatThreadParticipant,
  ChatThreadListItem,
  ChatMessage,
  ChatRequestState
} from "./models";

type PostRow = {
  id: string;
  owner_id: string;
  content_text: string | null;
  visibility: string;
  post_type: string;
  media_count: number;
  like_count?: number | null;
  comment_count?: number | null;
  repost_count?: number | null;
  origin_post_id?: string | null;
  media_key?: string | null;
  created_at: string;
  is_deleted?: number | null;
  author_handle?: string | null;
  author_display_name?: string | null;
  is_liked?: number | null;
};

type CommentRow = {
  id: string;
  post_id: string;
  owner_id: string;
  parent_comment_id: string | null;
  content_text: string;
  created_at: string;
  like_count?: number | null;
  owner_display_name?: string | null;
  is_liked?: number | null;
};

type MediaAssetRow = {
  id: string;
  owner_id: string;
  kind: string;
  usage: string;
  storage_provider: string;
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

type OwnerPublicRow = {
  uuid: string;
  display_name: string;
  avatar_url: string | null;
  city: string | null;
  region: string | null;
};

type PetRow = {
  id: string;
  owner_id: string;
  name: string;
  class: string | null;
  species: string | null;
  breed: string | null;
  gender: "male" | "female" | "unknown";
  birthday: string | null;
  avatar_asset_id: string | null;
  avatar_url: string | null;
  bio: string | null;
  followers_count: number;
  created_at: string;
  updated_at: string;
  is_active: number;
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
  ip_allowlist: string;
  created_at: string;
  last_at: string | null;
  updated_at: string;
};

type FriendshipRow = {
  status: string;
  requested_by: string;
};

type ChatThreadRow = {
  id: string;
  owner_a_id: string;
  owner_b_id: string;
  pair_key: string;
  request_state: string;
  request_sender_id: string | null;
  request_message_id: string | null;
  last_message_id: string | null;
  last_activity_at: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ChatThreadParticipantRow = {
  thread_id: string;
  owner_id: string;
  last_read_message_id: string | null;
  archived_at: string | null;
  deleted_at: string | null;
};

type ChatMessageRow = {
  id: string;
  thread_id: string;
  sender_id: string;
  body_text: string;
  created_at: string;
};

type ChatThreadListRow = {
  thread_id: string;
  request_state: string;
  request_sender_id: string | null;
  request_message_id: string | null;
  last_message_id: string | null;
  last_activity_at: string | null;
  sort_activity: string | null;
  last_read_message_id: string | null;
  archived_at: string | null;
  deleted_at: string | null;
  other_uuid: string;
  other_display_name: string;
  other_avatar_url: string | null;
  last_message_preview: string | null;
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
    const originPostId = input.originPostId ?? null;

    await this.db
      .prepare(
        `
          insert into posts (
            id, owner_id, content_text, visibility, post_type, media_count, origin_post_id, created_at, updated_at
          )
          values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .bind(id, input.authorId, input.body ?? null, visibility, postType, mediaCount, originPostId, createdAt, createdAt)
      .run();

    return {
      id,
      authorId: input.authorId,
      body: input.body ?? null,
      mediaKey: null,
      createdAt,
      visibility,
      postType,
      mediaCount,
      originPostId,
      repostCount: 0
    };
  }

  async getPostsByOwner(ownerUuid: string, limit = 20, currentOwnerUuid?: string): Promise<Post[]> {
    const joinLiked = !!currentOwnerUuid;
    const sql = `
      select
        p.id,
        p.owner_id,
        p.content_text,
        p.visibility,
        p.post_type,
        p.media_count,
        p.like_count,
        p.comment_count,
        p.repost_count,
        p.origin_post_id,
        p.is_deleted,
        p.created_at,
        o.display_name as author_display_name
        ${joinLiked ? ", case when pl.owner_id is not null then 1 else 0 end as is_liked" : ""}
      from posts p
      left join owners o on o.uuid = p.owner_id
      ${joinLiked ? "left join post_likes pl on pl.post_id = p.id and pl.owner_id = ?" : ""}
      where p.owner_id = ? and p.is_deleted = 0
      order by p.created_at desc
      limit ?
    `;
    const params = joinLiked ? [currentOwnerUuid, ownerUuid, limit] : [ownerUuid, limit];
    const { results } = await this.db.prepare(sql).bind(...params).all<PostRow>();

    const posts = (results ?? []).map(mapPostRow);
    await this.populateMedia(posts);
    await this.populateOriginPosts(posts);
    return posts;
  }

  async listRecentPosts(limit = 20, currentOwnerUuid?: string): Promise<Post[]> {
    const joinLiked = !!currentOwnerUuid;
    const sql = `
      select
        p.id,
        p.owner_id,
        p.content_text,
        p.visibility,
        p.post_type,
        p.media_count,
        p.like_count,
        p.comment_count,
        p.repost_count,
        p.origin_post_id,
        p.is_deleted,
        p.created_at,
        o.display_name as author_display_name
        ${joinLiked ? ", case when pl.owner_id is not null then 1 else 0 end as is_liked" : ""}
      from posts p
      left join owners o on o.uuid = p.owner_id
      ${joinLiked ? "left join post_likes pl on pl.post_id = p.id and pl.owner_id = ?" : ""}
      where p.is_deleted = 0
      order by p.created_at desc
      limit ?
    `;
    const params = joinLiked ? [currentOwnerUuid, limit] : [limit];
    const { results } = await this.db.prepare(sql).bind(...params).all<PostRow>();

    const posts = (results ?? []).map(mapPostRow);
    await this.populateMedia(posts);
    await this.populateOriginPosts(posts);
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
            p.repost_count,
            p.origin_post_id,
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
    storageProvider: "r2" | "cf_media";
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
            id, owner_id, kind, usage, storage_provider, storage_key, url, thumbnail_url, mime_type, size_bytes,
            width, height, duration_sec, status, created_at, updated_at
          )
          values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .bind(
        id,
        input.ownerId,
        input.kind,
        input.usage,
        input.storageProvider,
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
          select id, owner_id, kind, usage, storage_provider, storage_key, url, thumbnail_url, mime_type, size_bytes,
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
          select id, owner_id, kind, usage, storage_provider, storage_key, url, thumbnail_url, mime_type, size_bytes,
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
    const row = await this.db
      .prepare(`select origin_post_id from posts where id = ?`)
      .bind(postId)
      .first<{ origin_post_id: string | null }>();
    const ts = new Date().toISOString();
    await this.db.prepare(`update posts set is_deleted = 1, updated_at = ? where id = ?`).bind(ts, postId).run();
    if (row?.origin_post_id) {
      await this.updateRepostCount(row.origin_post_id);
    }
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
    await this.db
      .prepare(`delete from post_media_pet_tags where media_id in (select id from post_media where post_id = ?)`)
      .bind(postId)
      .run();
    await this.db.prepare(`delete from post_media where post_id = ?`).bind(postId).run();
    await this.db.prepare(`delete from media_assets where id in (${placeholders})`).bind(...assetIds).run();
  }

  async deletePostCascade(postId: string, assetIds: string[]): Promise<void> {
    const row = await this.db
      .prepare(`select origin_post_id from posts where id = ?`)
      .bind(postId)
      .first<{ origin_post_id: string | null }>();
    await this.deletePostMediaAndAssets(postId, assetIds);
    await this.db.prepare(`delete from post_likes where post_id = ?`).bind(postId).run();
    await this.db.prepare(`delete from post_comments where post_id = ?`).bind(postId).run();
    await this.db.prepare(`delete from post_shares where post_id = ?`).bind(postId).run();
    await this.db.prepare(`delete from posts where id = ?`).bind(postId).run();
    if (row?.origin_post_id) {
      await this.updateRepostCount(row.origin_post_id);
    }
  }

  async hasLiked(postId: string, ownerId: string): Promise<boolean> {
    const row = await this.db
      .prepare(`select 1 from post_likes where post_id = ? and owner_id = ? limit 1`)
      .bind(postId, ownerId)
      .first();
    return !!row;
  }

  async likePost(postId: string, ownerId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `
          insert into post_likes (post_id, owner_id, created_at)
          values (?, ?, ?)
        `
      )
      .bind(postId, ownerId, now)
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
    await this.db.prepare(`delete from post_likes where post_id = ? and owner_id = ?`).bind(postId, ownerId).run();
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

  async toggleLike(postId: string, ownerId: string): Promise<{ isLiked: boolean; likeCount: number }> {
    const now = new Date().toISOString();
    const insertResult = await this.db
      .prepare(
        `insert into post_likes (post_id, owner_id, created_at)
         values (?, ?, ?)
         on conflict(post_id, owner_id) do nothing`
      )
      .bind(postId, ownerId, now)
      .run();

    const inserted = (insertResult as any)?.meta?.changes ?? 0;

    if (inserted === 0) {
      // Already liked, toggle off
      await this.db.prepare(`delete from post_likes where post_id = ? and owner_id = ?`).bind(postId, ownerId).run();
    }

    const countRow = await this.db
      .prepare(`select count(*) as c from post_likes where post_id = ?`)
      .bind(postId)
      .first<{ c: number }>();
    const likeCount = countRow?.c ?? 0;
    await this.db
      .prepare(
        `
          update posts
          set like_count = ?
          where id = ?
        `
      )
      .bind(likeCount, postId)
      .run();

    return { isLiked: inserted > 0, likeCount };
  }

  async createComment(input: {
    postId: string;
    ownerId: string;
    content: string;
    parentCommentId?: string | null;
  }): Promise<Comment> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `
          insert into post_comments (
            id, post_id, owner_id, parent_comment_id, content_text, created_at, updated_at, is_deleted, like_count
          )
          values (?, ?, ?, ?, ?, ?, ?, 0, 0)
        `
      )
      .bind(id, input.postId, input.ownerId, input.parentCommentId ?? null, input.content, now, now)
      .run();

    await this.db.prepare(`update posts set comment_count = comment_count + 1 where id = ?`).bind(input.postId).run();

    const row = await this.db
      .prepare(
        `
          select
            c.id,
            c.post_id,
            c.owner_id,
            c.parent_comment_id,
            c.content_text,
            c.created_at,
            c.like_count,
            o.display_name as owner_display_name
          from post_comments c
          left join owners o on o.uuid = c.owner_id
          where c.id = ?
        `
      )
      .bind(id)
      .first<CommentRow>();

    if (!row) throw new Error("Failed to create comment");
    return mapCommentRow(row);
  }

  async getLatestComment(postId: string, currentOwnerUuid?: string): Promise<Comment | null> {
    const joinLiked = !!currentOwnerUuid;
    const row = await this.db
      .prepare(
        `
          select
            c.id,
            c.post_id,
            c.owner_id,
            c.parent_comment_id,
            c.content_text,
            c.created_at,
            c.like_count,
            o.display_name as owner_display_name
            ${joinLiked ? ", case when cl.owner_id is not null then 1 else 0 end as is_liked" : ""}
          from post_comments c
          left join owners o on o.uuid = c.owner_id
          ${joinLiked ? "left join comment_likes cl on cl.comment_id = c.id and cl.owner_id = ?" : ""}
          where c.post_id = ? and c.is_deleted = 0
          order by c.created_at desc, c.id desc
          limit 1
        `
      )
      .bind(...(joinLiked ? [currentOwnerUuid, postId] : [postId]))
      .first<CommentRow>();
    if (!row) return null;
    return mapCommentRow(row);
  }

  async getCommentById(commentId: string, currentOwnerUuid?: string): Promise<Comment | null> {
    const joinLiked = !!currentOwnerUuid;
    const row = await this.db
      .prepare(
        `
          select
            c.id,
            c.post_id,
            c.owner_id,
            c.parent_comment_id,
            c.content_text,
            c.created_at,
            c.like_count,
            o.display_name as owner_display_name
            ${joinLiked ? ", case when cl.owner_id is not null then 1 else 0 end as is_liked" : ""}
          from post_comments c
          left join owners o on o.uuid = c.owner_id
          ${joinLiked ? "left join comment_likes cl on cl.comment_id = c.id and cl.owner_id = ?" : ""}
          where c.id = ? and c.is_deleted = 0
        `
      )
      .bind(...(joinLiked ? [currentOwnerUuid, commentId] : [commentId]))
      .first<CommentRow>();
    if (!row) return null;
    return mapCommentRow(row);
  }

  async listPostCommentsThread(
    postId: string,
    limit: number,
    cursor?: string | null,
    currentOwnerUuid?: string
  ): Promise<{ items: CommentThread[]; nextCursor: string | null; hasMore: boolean }> {
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const parsed = parseCommentCursor(cursor);
    const joinLiked = !!currentOwnerUuid;
    const clauses: string[] = ["c.post_id = ?", "c.parent_comment_id is null", "c.is_deleted = 0"];
    const params: Array<string | number> = [];
    if (joinLiked && currentOwnerUuid) params.push(currentOwnerUuid);
    params.push(postId);

    if (parsed) {
      clauses.push("(c.created_at < ? or (c.created_at = ? and c.id < ?))");
      params.push(parsed.createdAt, parsed.createdAt, parsed.id);
    }

    const { results } = await this.db
      .prepare(
        `
          select
            c.id,
            c.post_id,
            c.owner_id,
            c.parent_comment_id,
            c.content_text,
            c.created_at,
            c.like_count,
            o.display_name as owner_display_name
            ${joinLiked ? ", case when cl.owner_id is not null then 1 else 0 end as is_liked" : ""}
          from post_comments c
          left join owners o on o.uuid = c.owner_id
          ${joinLiked ? "left join comment_likes cl on cl.comment_id = c.id and cl.owner_id = ?" : ""}
          where ${clauses.join(" and ")}
          order by c.created_at desc, c.id desc
          limit ?
        `
      )
      .bind(...params, safeLimit + 1)
      .all<CommentRow>();

    const rows = results ?? [];
    const hasMore = rows.length > safeLimit;
    const pageRows = hasMore ? rows.slice(0, safeLimit) : rows;
    const nextCursor = hasMore && pageRows.length > 0 ? toCommentCursor(pageRows[pageRows.length - 1]) : null;

    if (pageRows.length === 0) {
      return { items: [], nextCursor, hasMore };
    }

    const parentIds = pageRows.map((row) => row.id);
    const placeholders = parentIds.map(() => "?").join(",");
    const { results: replyRows } = await this.db
      .prepare(
        `
          select
            c.id,
            c.post_id,
            c.owner_id,
            c.parent_comment_id,
            c.content_text,
            c.created_at,
            c.like_count,
            o.display_name as owner_display_name
            ${joinLiked ? ", case when cl.owner_id is not null then 1 else 0 end as is_liked" : ""}
          from post_comments c
          left join owners o on o.uuid = c.owner_id
          ${joinLiked ? "left join comment_likes cl on cl.comment_id = c.id and cl.owner_id = ?" : ""}
          where c.post_id = ? and c.parent_comment_id in (${placeholders}) and c.is_deleted = 0
          order by c.created_at asc, c.id asc
        `
      )
      .bind(...(joinLiked && currentOwnerUuid ? [currentOwnerUuid, postId] : [postId]), ...parentIds)
      .all<CommentRow>();

    const repliesByParent = new Map<string, Comment[]>();
    for (const row of replyRows ?? []) {
      const mapped = mapCommentRow(row);
      const parentId = mapped.parentCommentId;
      if (!parentId) continue;
      const list = repliesByParent.get(parentId) ?? [];
      list.push(mapped);
      repliesByParent.set(parentId, list);
    }

    const items = pageRows.map((row) => {
      const mapped = mapCommentRow(row);
      return { ...mapped, replies: repliesByParent.get(mapped.id) ?? [] };
    });

    return { items, nextCursor, hasMore };
  }

  async toggleCommentLike(commentId: string, ownerId: string): Promise<{ isLiked: boolean; likeCount: number }> {
    const now = new Date().toISOString();
    const insertResult = await this.db
      .prepare(
        `insert into comment_likes (comment_id, owner_id, created_at)
         values (?, ?, ?)
         on conflict(comment_id, owner_id) do nothing`
      )
      .bind(commentId, ownerId, now)
      .run();

    const inserted = (insertResult as any)?.meta?.changes ?? 0;
    if (inserted === 0) {
      await this.db.prepare(`delete from comment_likes where comment_id = ? and owner_id = ?`).bind(commentId, ownerId).run();
    }

    const countRow = await this.db
      .prepare(`select count(*) as c from comment_likes where comment_id = ?`)
      .bind(commentId)
      .first<{ c: number }>();
    const likeCount = countRow?.c ?? 0;
    await this.db.prepare(`update post_comments set like_count = ? where id = ?`).bind(likeCount, commentId).run();

    return { isLiked: inserted > 0, likeCount };
  }

  async updateRepostCount(postId: string): Promise<number> {
    const countRow = await this.db
      .prepare(`select count(*) as c from posts where origin_post_id = ? and is_deleted = 0`)
      .bind(postId)
      .first<{ c: number }>();
    const repostCount = countRow?.c ?? 0;
    const now = new Date().toISOString();
    await this.db.prepare(`update posts set repost_count = ?, updated_at = ? where id = ?`).bind(repostCount, now, postId).run();
    return repostCount;
  }

  async isFriends(ownerId: string, friendId: string): Promise<boolean> {
    const row = await this.db
      .prepare(
        `
          select 1
          from owner_friendships
          where status = 'accepted'
            and ((owner_id = ? and friend_id = ?) or (owner_id = ? and friend_id = ?))
          limit 1
        `
      )
      .bind(ownerId, friendId, friendId, ownerId)
      .first();
    return !!row;
  }

  async getChatThreadById(threadId: string): Promise<ChatThread | null> {
    const row = await this.db
      .prepare(
        `
          select
            id,
            owner_a_id,
            owner_b_id,
            pair_key,
            request_state,
            request_sender_id,
            request_message_id,
            last_message_id,
            last_activity_at,
            created_at,
            updated_at
          from chat_threads
          where id = ?
        `
      )
      .bind(threadId)
      .first<ChatThreadRow>();
    return row ? mapChatThreadRow(row) : null;
  }

  async getChatThreadByPairKey(pairKey: string): Promise<ChatThread | null> {
    const row = await this.db
      .prepare(
        `
          select
            id,
            owner_a_id,
            owner_b_id,
            pair_key,
            request_state,
            request_sender_id,
            request_message_id,
            last_message_id,
            last_activity_at,
            created_at,
            updated_at
          from chat_threads
          where pair_key = ?
          limit 1
        `
      )
      .bind(pairKey)
      .first<ChatThreadRow>();
    return row ? mapChatThreadRow(row) : null;
  }

  async createChatThread(input: {
    threadId: string;
    ownerAId: string;
    ownerBId: string;
    pairKey: string;
    requestState: ChatRequestState;
    requestSenderId?: string | null;
    requestMessageId?: string | null;
    lastMessageId?: string | null;
    lastActivityAt?: string | null;
  }): Promise<ChatThread> {
    await this.db
      .prepare(
        `
          insert into chat_threads (
            id,
            owner_a_id,
            owner_b_id,
            pair_key,
            request_state,
            request_sender_id,
            request_message_id,
            last_message_id,
            last_activity_at,
            created_at,
            updated_at
          )
          values (?, ?, ?, ?, ?, ?, ?, ?, coalesce(?, datetime('now')), datetime('now'), datetime('now'))
        `
      )
      .bind(
        input.threadId,
        input.ownerAId,
        input.ownerBId,
        input.pairKey,
        input.requestState,
        input.requestSenderId ?? null,
        input.requestMessageId ?? null,
        input.lastMessageId ?? null,
        input.lastActivityAt ?? null
      )
      .run();

    const thread = await this.getChatThreadById(input.threadId);
    if (!thread) {
      throw new Error("chat thread insert failed");
    }
    return thread;
  }

  async upsertChatParticipants(threadId: string, ownerAId: string, ownerBId: string): Promise<void> {
    await this.db
      .prepare(
        `
          insert or ignore into chat_thread_participants (thread_id, owner_id)
          values (?, ?), (?, ?)
        `
      )
      .bind(threadId, ownerAId, threadId, ownerBId)
      .run();
  }

  async getChatParticipant(threadId: string, ownerId: string): Promise<ChatThreadParticipant | null> {
    const row = await this.db
      .prepare(
        `
          select
            thread_id,
            owner_id,
            last_read_message_id,
            archived_at,
            deleted_at
          from chat_thread_participants
          where thread_id = ? and owner_id = ?
          limit 1
        `
      )
      .bind(threadId, ownerId)
      .first<ChatThreadParticipantRow>();
    return row ? mapChatThreadParticipantRow(row) : null;
  }

  async setParticipantArchived(threadId: string, ownerId: string, archivedAt: string | null): Promise<void> {
    if (archivedAt === null) {
      await this.db
        .prepare(`update chat_thread_participants set archived_at = null where thread_id = ? and owner_id = ?`)
        .bind(threadId, ownerId)
        .run();
      return;
    }
    await this.db
      .prepare(`update chat_thread_participants set archived_at = ? where thread_id = ? and owner_id = ?`)
      .bind(archivedAt, threadId, ownerId)
      .run();
  }

  async setParticipantDeleted(threadId: string, ownerId: string, deletedAt: string | null): Promise<void> {
    if (deletedAt === null) {
      await this.db
        .prepare(`update chat_thread_participants set deleted_at = null where thread_id = ? and owner_id = ?`)
        .bind(threadId, ownerId)
        .run();
      return;
    }
    await this.db
      .prepare(`update chat_thread_participants set deleted_at = ? where thread_id = ? and owner_id = ?`)
      .bind(deletedAt, threadId, ownerId)
      .run();
  }

  async setParticipantLastRead(threadId: string, ownerId: string, messageId: string | null): Promise<void> {
    await this.db
      .prepare(`update chat_thread_participants set last_read_message_id = ? where thread_id = ? and owner_id = ?`)
      .bind(messageId, threadId, ownerId)
      .run();
  }

  async clearParticipantsArchiveDeleted(threadId: string): Promise<void> {
    await this.db
      .prepare(`update chat_thread_participants set archived_at = null, deleted_at = null where thread_id = ?`)
      .bind(threadId)
      .run();
  }

  async insertChatMessage(threadId: string, senderId: string, bodyText: string): Promise<ChatMessage> {
    const id = crypto.randomUUID();
    await this.db
      .prepare(`insert into chat_messages (id, thread_id, sender_id, body_text) values (?, ?, ?, ?)`)
      .bind(id, threadId, senderId, bodyText)
      .run();
    const row = await this.db
      .prepare(
        `
          select
            id,
            thread_id,
            sender_id,
            body_text,
            created_at
          from chat_messages
          where id = ?
        `
      )
      .bind(id)
      .first<ChatMessageRow>();
    if (row) return mapChatMessageRow(row);
    return { id, threadId, senderId, bodyText, createdAt: new Date().toISOString() };
  }

  async getChatMessageById(messageId: string): Promise<ChatMessage | null> {
    const row = await this.db
      .prepare(
        `
          select
            id,
            thread_id,
            sender_id,
            body_text,
            created_at
          from chat_messages
          where id = ?
          limit 1
        `
      )
      .bind(messageId)
      .first<ChatMessageRow>();
    return row ? mapChatMessageRow(row) : null;
  }

  async listChatThreadsForOwner(
    ownerId: string,
    limit: number,
    cursor?: string | null,
    includeArchived?: boolean
  ): Promise<{ items: ChatThreadListItem[]; nextCursor: string | null }> {
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    let parsed = parseChatThreadCursor(cursor);
    if (!parsed && cursor) {
      const anchor = await this.getChatThreadById(cursor);
      const activityAt = anchor?.lastActivityAt ?? anchor?.updatedAt ?? anchor?.createdAt;
      if (activityAt) {
        parsed = { activityAt, id: anchor.id };
      }
    }
    const clauses: string[] = ["p.owner_id = ?"];
    const params: Array<string> = [ownerId, ownerId];
    if (!includeArchived) {
      clauses.push("p.archived_at is null");
    }
    clauses.push("p.deleted_at is null");

    const sortExpr = "coalesce(t.last_activity_at, t.updated_at, t.created_at)";

    if (parsed) {
      if (parsed.id) {
        clauses.push(`(${sortExpr} < ? or (${sortExpr} = ? and t.id < ?))`);
        params.push(parsed.activityAt, parsed.activityAt, parsed.id);
      } else {
        clauses.push(`${sortExpr} < ?`);
        params.push(parsed.activityAt);
      }
    }

    const { results } = await this.db
      .prepare(
        `
          select
            t.id as thread_id,
            t.request_state,
            t.request_sender_id,
            t.request_message_id,
            t.last_message_id,
            t.last_activity_at,
            ${sortExpr} as sort_activity,
            p.last_read_message_id,
            p.archived_at,
            p.deleted_at,
            o.uuid as other_uuid,
            o.display_name as other_display_name,
            o.avatar_url as other_avatar_url,
            m.body_text as last_message_preview
          from chat_thread_participants p
          join chat_threads t on t.id = p.thread_id
          join owners o on o.uuid = case when t.owner_a_id = ? then t.owner_b_id else t.owner_a_id end
          left join chat_messages m on m.id = t.last_message_id
          where ${clauses.join(" and ")}
          order by sort_activity desc, t.id desc
          limit ?
        `
      )
      .bind(...params, safeLimit + 1)
      .all<ChatThreadListRow>();

    const rows = results ?? [];
    const hasMore = rows.length > safeLimit;
    const pageRows = hasMore ? rows.slice(0, safeLimit) : rows;
    const nextCursor = hasMore && pageRows.length > 0 ? toChatThreadCursor(pageRows[pageRows.length - 1]) : null;

    return { items: pageRows.map(mapChatThreadListRow), nextCursor };
  }

  async getChatThreadForOwner(threadId: string, ownerId: string): Promise<ChatThreadListItem | null> {
    const sortExpr = "coalesce(t.last_activity_at, t.updated_at, t.created_at)";
    const row = await this.db
      .prepare(
        `
          select
            t.id as thread_id,
            t.request_state,
            t.request_sender_id,
            t.request_message_id,
            t.last_message_id,
            t.last_activity_at,
            ${sortExpr} as sort_activity,
            p.last_read_message_id,
            p.archived_at,
            p.deleted_at,
            o.uuid as other_uuid,
            o.display_name as other_display_name,
            o.avatar_url as other_avatar_url,
            m.body_text as last_message_preview
          from chat_thread_participants p
          join chat_threads t on t.id = p.thread_id
          join owners o on o.uuid = case when t.owner_a_id = ? then t.owner_b_id else t.owner_a_id end
          left join chat_messages m on m.id = t.last_message_id
          where p.owner_id = ? and t.id = ?
          limit 1
        `
      )
      .bind(ownerId, ownerId, threadId)
      .first<ChatThreadListRow>();
    return row ? mapChatThreadListRow(row) : null;
  }

  async listChatMessages(
    threadId: string,
    limit: number,
    beforeCursor?: string | null
  ): Promise<{ items: ChatMessage[]; nextCursor: string | null }> {
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    let parsed = parseChatMessageCursor(beforeCursor);
    if (!parsed && beforeCursor) {
      if (looksLikeTimestamp(beforeCursor)) {
        parsed = { createdAt: beforeCursor };
      } else {
        const anchor = await this.db
          .prepare(`select created_at from chat_messages where id = ?`)
          .bind(beforeCursor)
          .first<{ created_at: string }>();
        if (anchor?.created_at) {
          parsed = { createdAt: anchor.created_at, id: beforeCursor };
        }
      }
    }
    const clauses: string[] = ["thread_id = ?"];
    const params: Array<string> = [threadId];

    if (parsed) {
      if (parsed.id) {
        clauses.push("(created_at < ? or (created_at = ? and id < ?))");
        params.push(parsed.createdAt, parsed.createdAt, parsed.id);
      } else {
        clauses.push("created_at < ?");
        params.push(parsed.createdAt);
      }
    }

    const { results } = await this.db
      .prepare(
        `
          select
            id,
            thread_id,
            sender_id,
            body_text,
            created_at
          from chat_messages
          where ${clauses.join(" and ")}
          order by created_at desc, id desc
          limit ?
        `
      )
      .bind(...params, safeLimit + 1)
      .all<ChatMessageRow>();

    const rows = results ?? [];
    const hasMore = rows.length > safeLimit;
    const pageRows = hasMore ? rows.slice(0, safeLimit) : rows;
    const nextCursor = hasMore && pageRows.length > 0 ? toChatMessageCursor(pageRows[pageRows.length - 1]) : null;
    const items = pageRows.slice().reverse().map(mapChatMessageRow);

    return { items, nextCursor };
  }

  async updateChatThreadOnNewMessage(
    threadId: string,
    lastMessageId: string,
    options?: { requestMessageId?: string | null; requestSenderId?: string | null }
  ): Promise<void> {
    const updates: string[] = ["last_message_id = ?", "last_activity_at = datetime('now')", "updated_at = datetime('now')"];
    const params: Array<string> = [lastMessageId];
    if (options?.requestMessageId) {
      updates.push("request_message_id = ?");
      params.push(options.requestMessageId);
    }
    if (options?.requestSenderId) {
      updates.push("request_sender_id = ?");
      params.push(options.requestSenderId);
    }
    await this.db
      .prepare(`update chat_threads set ${updates.join(", ")} where id = ?`)
      .bind(...params, threadId)
      .run();
  }

  async updateChatThreadRequestState(
    threadId: string,
    requestState: ChatRequestState,
    requestSenderId?: string | null,
    requestMessageId?: string | null
  ): Promise<void> {
    const updates: string[] = ["request_state = ?", "updated_at = datetime('now')"];
    const params: Array<string | null> = [requestState];
    if (requestSenderId !== undefined) {
      updates.push("request_sender_id = ?");
      params.push(requestSenderId ?? null);
    }
    if (requestMessageId !== undefined) {
      updates.push("request_message_id = ?");
      params.push(requestMessageId ?? null);
    }
    await this.db
      .prepare(`update chat_threads set ${updates.join(", ")} where id = ?`)
      .bind(...params, threadId)
      .run();
  }

  private async populateOriginPosts(posts: Post[]): Promise<void> {
    const originIds = Array.from(new Set(posts.map((post) => post.originPostId).filter((id): id is string => !!id)));
    if (originIds.length === 0) return;
    const placeholders = originIds.map(() => "?").join(",");
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
            p.repost_count,
            p.origin_post_id,
            p.is_deleted,
            p.created_at,
            o.display_name as author_display_name
          from posts p
          left join owners o on o.uuid = p.owner_id
          where p.id in (${placeholders})
        `
      )
      .bind(...originIds)
      .all<PostRow>();

    const originPosts = (results ?? []).map(mapPostRow);
    await this.populateMedia(originPosts);

    const byId = new Map(originPosts.map((post) => [post.id, post]));
    for (const post of posts) {
      const originId = post.originPostId ?? null;
      if (!originId) continue;
      const origin = byId.get(originId);
      if (origin) {
        post.originPost = origin;
      } else {
        post.originPost = {
          id: originId,
          authorId: "",
          body: null,
          mediaKey: null,
          createdAt: "",
          isDeleted: 1,
          repostCount: 0
        };
      }
    }
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

  async searchOwnersByDisplayName(
    keyword: string,
    limit: number,
    excludeOwnerUuid: string
  ): Promise<OwnerPublic[]> {
    const kw = keyword.trim().toLowerCase();
    const rows = await this.db
      .prepare(
        `
        select uuid, display_name, avatar_url, city, region
        from owners
        where uuid != ?
          and (
            display_name = ?
            or display_name like (? || '%')
          )
        order by
          case
            when display_name = ? then 0
            when display_name like (? || '%') then 1
            else 3
          end,
          length(display_name) asc,
          display_name asc
        limit ?
        `
      )
      .bind(excludeOwnerUuid, kw, kw, kw, kw, limit)
      .all<OwnerPublicRow>();

    return (rows.results ?? []).map(mapOwnerPublicRow);
  }

  async getFriendshipRowByPairKey(pairKey: string): Promise<{ status: string; requestedBy: string } | null> {
    const row = await this.db
      .prepare(`select status, requested_by from owner_friendships where pair_key = ?`)
      .bind(pairKey)
      .first<FriendshipRow>();

    return row ? { status: row.status, requestedBy: row.requested_by } : null;
  }

  async createFriendRequest(input: {
    ownerA: string;
    ownerB: string;
    requestedBy: string;
    pairKey: string;
  }): Promise<void> {
    await this.db
      .prepare(
        `
        insert into owner_friendships (owner_id, friend_id, status, requested_by, pair_key)
        values (?, ?, 'pending', ?, ?)
        `
      )
      .bind(input.ownerA, input.ownerB, input.requestedBy, input.pairKey)
      .run();
  }

  async deletePendingRequest(pairKey: string, requestedBy: string): Promise<number> {
    const res = await this.db
      .prepare(`delete from owner_friendships where pair_key = ? and status = 'pending' and requested_by = ?`)
      .bind(pairKey, requestedBy)
      .run();
    return res.meta.changes ?? 0;
  }

  async deletePendingIncoming(pairKey: string, me: string): Promise<number> {
    const res = await this.db
      .prepare(`delete from owner_friendships where pair_key = ? and status = 'pending' and requested_by != ?`)
      .bind(pairKey, me)
      .run();
    return res.meta.changes ?? 0;
  }

  async acceptPendingIncoming(pairKey: string, me: string): Promise<number> {
    const res = await this.db
      .prepare(
        `
        update owner_friendships
        set status = 'accepted', updated_at = datetime('now')
        where pair_key = ? and status = 'pending' and requested_by != ?
        `
      )
      .bind(pairKey, me)
      .run();
    return res.meta.changes ?? 0;
  }

  async deleteFriendship(pairKey: string): Promise<number> {
    const res = await this.db
      .prepare(`delete from owner_friendships where pair_key = ? and status = 'accepted'`)
      .bind(pairKey)
      .run();
    return res.meta.changes ?? 0;
  }

  async listIncomingRequests(
    me: string,
    limit: number
  ): Promise<FriendshipRequestItem[]> {
    const rows = await this.db
      .prepare(
        `
        select
          o.uuid, o.display_name, o.avatar_url, o.city, o.region,
          f.created_at
        from owner_friendships f
        join owners o
          on o.uuid = (case when f.owner_id = ? then f.friend_id else f.owner_id end)
        where f.status = 'pending'
          and (f.owner_id = ? or f.friend_id = ?)
          and f.requested_by != ?
        order by f.created_at desc
        limit ?
        `
      )
      .bind(me, me, me, me, limit)
      .all<{
        uuid: string;
        display_name: string;
        avatar_url: string | null;
        city: string | null;
        region: string | null;
        created_at: string;
      }>();

    return (rows.results ?? []).map((row) => ({
      otherOwner: mapOwnerPublicRow(row as OwnerPublicRow),
      createdAt: row.created_at
    }));
  }

  async listOutgoingRequests(
    me: string,
    limit: number
  ): Promise<FriendshipRequestItem[]> {
    const rows = await this.db
      .prepare(
        `
        select
          o.uuid, o.display_name, o.avatar_url, o.city, o.region,
          f.created_at
        from owner_friendships f
        join owners o
          on o.uuid = (case when f.owner_id = ? then f.friend_id else f.owner_id end)
        where f.status = 'pending'
          and f.requested_by = ?
        order by f.created_at desc
        limit ?
        `
      )
      .bind(me, me, limit)
      .all<{
        uuid: string;
        display_name: string;
        avatar_url: string | null;
        city: string | null;
        region: string | null;
        created_at: string;
      }>();

    return (rows.results ?? []).map((row) => ({
      otherOwner: mapOwnerPublicRow(row as OwnerPublicRow),
      createdAt: row.created_at
    }));
  }

  async countActivePetsByOwner(ownerId: string): Promise<number> {
    const row = await this.db
      .prepare(`select count(*) as c from pets where owner_id = ? and is_active = 1`)
      .bind(ownerId)
      .first<{ c: number }>();
    return row?.c ?? 0;
  }

  async listPetsByOwner(ownerId: string): Promise<Array<{ id: string; name: string; avatarUrl: string | null }>> {
    const rows = await this.db
      .prepare(
        `
          select id, name, avatar_url
          from pets
          where owner_id = ? and is_active = 1
          order by created_at desc
        `
      )
      .bind(ownerId)
      .all<{ id: string; name: string; avatar_url: string | null }>();

    return (rows.results ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      avatarUrl: row.avatar_url ?? null
    }));
  }

  async isPetOwnedByOwner(petId: string, ownerId: string): Promise<boolean> {
    const row = await this.db
      .prepare(`select 1 as ok from pets where id = ? and owner_id = ? limit 1`)
      .bind(petId, ownerId)
      .first<{ ok: number }>();
    return row?.ok === 1;
  }

  async isFollowingPet(followerOwnerId: string, petId: string): Promise<boolean> {
    const row = await this.db
      .prepare(`select 1 as ok from pet_follows where follower_owner_id = ? and pet_id = ? limit 1`)
      .bind(followerOwnerId, petId)
      .first<{ ok: number }>();
    return row?.ok === 1;
  }

  async followPetTx(followerOwnerId: string, petId: string): Promise<number> {
    const now = new Date().toISOString();
    const [_, __, countResult] = await this.db.batch([
      this.db
        .prepare(
          `
            insert into pet_follows (follower_owner_id, pet_id, created_at)
            values (?, ?, ?)
            on conflict(follower_owner_id, pet_id) do nothing
          `
        )
        .bind(followerOwnerId, petId, now),
      this.db
        .prepare(
          `
            update pets
            set followers_count = followers_count + (case when changes() > 0 then 1 else 0 end)
            where id = ?
          `
        )
        .bind(petId),
      this.db.prepare(`select followers_count from pets where id = ?`).bind(petId)
    ]);

    const count = (countResult?.results?.[0] as { followers_count?: number } | undefined)?.followers_count;
    return count ?? 0;
  }

  async unfollowPetTx(followerOwnerId: string, petId: string): Promise<number> {
    const [_, __, countResult] = await this.db.batch([
      this.db
        .prepare(`delete from pet_follows where follower_owner_id = ? and pet_id = ?`)
        .bind(followerOwnerId, petId),
      this.db
        .prepare(
          `
            update pets
            set followers_count = case
              when changes() > 0 and followers_count > 0 then followers_count - 1
              else followers_count
            end
            where id = ?
          `
        )
        .bind(petId),
      this.db.prepare(`select followers_count from pets where id = ?`).bind(petId)
    ]);

    const count = (countResult?.results?.[0] as { followers_count?: number } | undefined)?.followers_count;
    return count ?? 0;
  }

  async listFollowedPets(
    followerOwnerId: string,
    limit: number,
    cursor?: number | null
  ): Promise<{
    items: Array<{
      id: string;
      name: string;
      avatarUrl: string | null;
      species: string | null;
      breed: string | null;
      followersCount: number;
      isActive: number;
    }>;
    nextCursor: string | null;
  }> {
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const params: Array<string | number> = [followerOwnerId];
    const clauses: string[] = ["pf.follower_owner_id = ?"];
    if (cursor) {
      clauses.push("pf.id < ?");
      params.push(cursor);
    }

    const { results } = await this.db
      .prepare(
        `
          select
            pf.id as follow_id,
            p.id,
            p.name,
            p.avatar_url,
            p.species,
            p.breed,
            p.followers_count,
            p.is_active
          from pet_follows pf
          join pets p on p.id = pf.pet_id
          where ${clauses.join(" and ")}
          order by pf.id desc
          limit ?
        `
      )
      .bind(...params, safeLimit + 1)
      .all<{
        follow_id: number;
        id: string;
        name: string;
        avatar_url: string | null;
        species: string | null;
        breed: string | null;
        followers_count: number;
        is_active: number;
      }>();

    const rows = results ?? [];
    const hasMore = rows.length > safeLimit;
    const pageRows = hasMore ? rows.slice(0, safeLimit) : rows;
    const nextCursor = hasMore && pageRows.length > 0 ? String(pageRows[pageRows.length - 1].follow_id) : null;

    const items = pageRows.map((row) => ({
      id: row.id,
      name: row.name,
      avatarUrl: row.avatar_url ?? null,
      species: row.species ?? null,
      breed: row.breed ?? null,
      followersCount: row.followers_count ?? 0,
      isActive: row.is_active ?? 1
    }));

    return { items, nextCursor };
  }

  async listPetFollowers(
    petId: string,
    limit: number,
    cursor?: number | null
  ): Promise<{
    items: Array<{ uuid: string; displayName: string; avatarUrl: string | null }>;
    nextCursor: string | null;
  }> {
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const params: Array<string | number> = [petId];
    const clauses: string[] = ["pf.pet_id = ?"];
    if (cursor) {
      clauses.push("pf.id < ?");
      params.push(cursor);
    }

    const { results } = await this.db
      .prepare(
        `
          select
            pf.id as follow_id,
            o.uuid,
            o.display_name,
            o.avatar_url
          from pet_follows pf
          join owners o on o.uuid = pf.follower_owner_id
          where ${clauses.join(" and ")}
          order by pf.id desc
          limit ?
        `
      )
      .bind(...params, safeLimit + 1)
      .all<{ follow_id: number; uuid: string; display_name: string; avatar_url: string | null }>();

    const rows = results ?? [];
    const hasMore = rows.length > safeLimit;
    const pageRows = hasMore ? rows.slice(0, safeLimit) : rows;
    const nextCursor = hasMore && pageRows.length > 0 ? String(pageRows[pageRows.length - 1].follow_id) : null;

    const items = pageRows.map((row) => ({
      uuid: row.uuid,
      displayName: row.display_name,
      avatarUrl: row.avatar_url ?? null
    }));

    return { items, nextCursor };
  }

  async createPet(input: {
    id: string;
    ownerId: string;
    name: string;
    class?: string | null;
    species?: string | null;
    breed?: string | null;
    gender?: "male" | "female" | "unknown";
    birthday?: string | null;
    avatarAssetId?: string | null;
    avatarUrl?: string | null;
    bio?: string | null;
  }): Promise<Pet> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `
          insert into pets (
            id, owner_id, name, "class", species, breed, gender, birthday, avatar_asset_id,
            avatar_url, bio, created_at, updated_at, is_active
          )
          values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `
      )
      .bind(
        input.id,
        input.ownerId,
        input.name,
        input.class ?? null,
        input.species ?? null,
        input.breed ?? null,
        input.gender ?? "unknown",
        input.birthday ?? null,
        input.avatarAssetId ?? null,
        input.avatarUrl ?? null,
        input.bio ?? null,
        now,
        now
      )
      .run();

    const row = await this.getPetById(input.id);
    if (!row) throw new Error("Failed to create pet");
    return row;
  }

  async getPetById(id: string): Promise<Pet | null> {
    const row = await this.db
      .prepare(
        `
          select
            id, owner_id, name, "class" as class, species, breed, gender, birthday,
            avatar_asset_id, avatar_url, bio, followers_count, created_at, updated_at, is_active
          from pets
          where id = ?
        `
      )
      .bind(id)
      .first<PetRow>();
    return row ? mapPetRow(row) : null;
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
          where id = ?
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
          select id, admin_id, permission, ip_allowlist, created_at, last_at, updated_at
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
          select id, admin_id, permission, ip_allowlist, created_at, last_at, updated_at
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
          select id, admin_id, password, permission, ip_allowlist, created_at, last_at, updated_at
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

  async updateAdminIpAllowlist(adminId: string, ipAllowlist: string | null): Promise<boolean> {
    const ts = new Date().toISOString();
    const result = await this.db
      .prepare(`update admin_accounts set ip_allowlist = ?, updated_at = ? where admin_id = ?`)
      .bind(ipAllowlist, ts, adminId)
      .run();
    const changes = (result as { meta?: { changes?: number } })?.meta?.changes ?? 0;
    return changes > 0;
  }

  async listAdminIpAllowlist(): Promise<string[]> {
    const { results } = await this.db
      .prepare(
        `
          select ip_allowlist
          from admin_accounts
          where ip_allowlist is not null and trim(ip_allowlist) <> ''
        `
      )
      .all<{ ip_allowlist: string | null }>();
    return (results ?? []).map((row) => row.ip_allowlist ?? "").filter(Boolean);
  }
}

function mapPostRow(row: PostRow): Post {
  const repostCount = row.repost_count ?? 0;
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
    repostCount,
    originPostId: row.origin_post_id ?? null,
    isDeleted: row.is_deleted ?? 0,
    isLiked: row.is_liked === 1
  };
}

function mapCommentRow(row: CommentRow): Comment {
  return {
    id: row.id,
    postId: row.post_id,
    ownerId: row.owner_id,
    ownerDisplayName: row.owner_display_name ?? null,
    content: row.content_text,
    parentCommentId: row.parent_comment_id ?? null,
    createdAt: row.created_at,
    likeCount: row.like_count ?? 0,
    isLiked: row.is_liked === 1
  };
}

function parseCommentCursor(cursor?: string | null): { createdAt: string; id: string } | null {
  if (!cursor) return null;
  const [createdAt, id] = cursor.split("|");
  if (!createdAt || !id) return null;
  return { createdAt, id };
}

function toCommentCursor(row: CommentRow): string {
  return `${row.created_at}|${row.id}`;
}

function parseChatThreadCursor(cursor?: string | null): { activityAt: string; id?: string } | null {
  if (!cursor) return null;
  const [activityAt, id] = cursor.split("|");
  if (activityAt && id) return { activityAt, id };
  if (activityAt && looksLikeTimestamp(activityAt)) return { activityAt };
  return null;
}

function toChatThreadCursor(row: ChatThreadListRow): string | null {
  const activityAt = row.sort_activity ?? row.last_activity_at;
  if (!activityAt) return null;
  return `${activityAt}|${row.thread_id}`;
}

function parseChatMessageCursor(cursor?: string | null): { createdAt: string; id?: string } | null {
  if (!cursor) return null;
  const [createdAt, id] = cursor.split("|");
  if (!createdAt || !id) return null;
  return { createdAt, id };
}

function toChatMessageCursor(row: ChatMessageRow): string {
  return `${row.created_at}|${row.id}`;
}

function looksLikeTimestamp(value: string): boolean {
  return value.includes("-") && value.includes(":");
}

function mapOwnerPublicRow(row: OwnerPublicRow) {
  return {
    uuid: row.uuid,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    city: row.city,
    region: row.region
  };
}

function mapChatThreadRow(row: ChatThreadRow): ChatThread {
  return {
    id: row.id,
    ownerAId: row.owner_a_id,
    ownerBId: row.owner_b_id,
    pairKey: row.pair_key,
    requestState: row.request_state as ChatRequestState,
    requestSenderId: row.request_sender_id ?? null,
    requestMessageId: row.request_message_id ?? null,
    lastMessageId: row.last_message_id ?? null,
    lastActivityAt: row.last_activity_at ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null
  };
}

function mapChatThreadParticipantRow(row: ChatThreadParticipantRow): ChatThreadParticipant {
  return {
    threadId: row.thread_id,
    ownerId: row.owner_id,
    lastReadMessageId: row.last_read_message_id ?? null,
    archivedAt: row.archived_at ?? null,
    deletedAt: row.deleted_at ?? null
  };
}

function mapChatMessageRow(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    senderId: row.sender_id,
    bodyText: row.body_text,
    createdAt: row.created_at
  };
}

function mapChatThreadListRow(row: ChatThreadListRow): ChatThreadListItem {
  return {
    threadId: row.thread_id,
    requestState: row.request_state as ChatRequestState,
    requestSenderId: row.request_sender_id ?? null,
    requestMessageId: row.request_message_id ?? null,
    lastMessageId: row.last_message_id ?? null,
    lastActivityAt: row.last_activity_at ?? null,
    lastMessagePreview: row.last_message_preview ?? null,
    lastReadMessageId: row.last_read_message_id ?? null,
    archivedAt: row.archived_at ?? null,
    deletedAt: row.deleted_at ?? null,
    otherOwner: mapOwnerPublicRow({
      uuid: row.other_uuid,
      display_name: row.other_display_name,
      avatar_url: row.other_avatar_url,
      city: null,
      region: null
    })
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

function mapPetRow(row: PetRow): Pet {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    class: row.class ?? null,
    species: row.species ?? null,
    breed: row.breed ?? null,
    gender: row.gender ?? "unknown",
    birthday: row.birthday ?? null,
    avatarAssetId: row.avatar_asset_id ?? null,
    avatarUrl: row.avatar_url ?? null,
    bio: row.bio ?? null,
    followersCount: row.followers_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isActive: row.is_active ?? 1
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
    ipAllowlist: row.ip_allowlist ?? null,
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
    storageProvider: row.storage_provider as MediaAsset["storageProvider"],
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
