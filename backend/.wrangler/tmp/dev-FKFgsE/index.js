var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/api/utils.ts
var DEFAULT_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400"
};
function withCors(response, extraHeaders = {}) {
  if (response.status === 101) {
    return response;
  }
  const headers = new Headers(response.headers);
  Object.entries({ ...DEFAULT_CORS, ...extraHeaders }).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
__name(withCors, "withCors");
function json(data, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}
__name(json, "json");
function errorJson(message2, status = 400, code, details) {
  const error = { message: message2 };
  if (code !== void 0) error.code = code;
  if (details !== void 0) error.details = details;
  return json({ ok: false, error }, { status });
}
__name(errorJson, "errorJson");
function okJson(data, status = 200) {
  return json({ ok: true, data }, { status });
}
__name(okJson, "okJson");
async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new Error("Invalid JSON payload");
  }
}
__name(readJson, "readJson");
function okResponse() {
  return new Response(null, { status: 204, headers: DEFAULT_CORS });
}
__name(okResponse, "okResponse");
function isOptions(request) {
  return request.method.toUpperCase() === "OPTIONS";
}
__name(isOptions, "isOptions");
function asNumber(value, fallback) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
__name(asNumber, "asNumber");

// src/db/d1-client.ts
var D1Client = class {
  static {
    __name(this, "D1Client");
  }
  constructor(db) {
    this.db = db;
  }
  async ping() {
    const row = await this.db.prepare("select 1 as ok").first();
    return row?.ok === 1;
  }
  async createPost(input) {
    const id = crypto.randomUUID();
    const createdAt = (/* @__PURE__ */ new Date()).toISOString();
    const visibility = input.visibility ?? "public";
    const postType = input.postType ?? "text";
    const mediaCount = input.mediaCount ?? 0;
    const originPostId = input.originPostId ?? null;
    await this.db.prepare(
      `
          insert into posts (
            id, owner_id, content_text, visibility, post_type, media_count, origin_post_id, created_at, updated_at
          )
          values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
    ).bind(id, input.authorId, input.body ?? null, visibility, postType, mediaCount, originPostId, createdAt, createdAt).run();
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
  async getPostsByOwner(ownerUuid, limit = 20, currentOwnerUuid) {
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
    const { results } = await this.db.prepare(sql).bind(...params).all();
    const posts = (results ?? []).map(mapPostRow);
    await this.populateMedia(posts);
    await this.populateOriginPosts(posts);
    return posts;
  }
  async listRecentPosts(limit = 20, currentOwnerUuid) {
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
    const { results } = await this.db.prepare(sql).bind(...params).all();
    const posts = (results ?? []).map(mapPostRow);
    await this.populateMedia(posts);
    await this.populateOriginPosts(posts);
    return posts;
  }
  async getPostById(id) {
    const row = await this.db.prepare(
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
    ).bind(id).first();
    if (!row) return null;
    const post = mapPostRow(row);
    await this.populateMedia([post]);
    return post;
  }
  async createMediaAsset(input) {
    const id = crypto.randomUUID();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    await this.db.prepare(
      `
          insert into media_assets (
            id, owner_id, kind, usage, storage_provider, storage_key, url, thumbnail_url, mime_type, size_bytes,
            width, height, duration_sec, status, created_at, updated_at
          )
          values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
    ).bind(
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
    ).run();
    const row = await this.db.prepare(
      `
          select id, owner_id, kind, usage, storage_provider, storage_key, url, thumbnail_url, mime_type, size_bytes,
                 width, height, duration_sec, status, created_at, updated_at
          from media_assets
          where id = ?
        `
    ).bind(id).first();
    if (!row) throw new Error("Failed to create media asset");
    return mapMediaAssetRow(row);
  }
  async getMediaAssetsByIds(ids) {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(",");
    const { results } = await this.db.prepare(
      `
          select id, owner_id, kind, usage, storage_provider, storage_key, url, thumbnail_url, mime_type, size_bytes,
                 width, height, duration_sec, status, created_at, updated_at
          from media_assets
          where id in (${placeholders})
        `
    ).bind(...ids).all();
    return (results ?? []).map(mapMediaAssetRow);
  }
  async attachMediaToPost(postId, postType, assetIds) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const inserts = assetIds.map(
      (assetId, idx) => this.db.prepare(
        `
            insert into post_media (id, post_id, asset_id, order_index, created_at)
            values (?, ?, ?, ?, ?)
          `
      ).bind(crypto.randomUUID(), postId, assetId, idx, now).run()
    );
    for (const p of inserts) {
      await p;
    }
    await this.db.prepare(
      `
          update posts
          set post_type = ?, media_count = ?, updated_at = ?
          where id = ?
        `
    ).bind(postType, assetIds.length, now, postId).run();
  }
  async listAdminPosts(limit = 20, offset = 0) {
    const { results } = await this.db.prepare(
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
    ).bind(limit, offset).all();
    const posts = (results ?? []).map(mapPostRow);
    await this.populateMedia(posts);
    return posts;
  }
  async markPostDeleted(postId) {
    const row = await this.db.prepare(`select origin_post_id from posts where id = ?`).bind(postId).first();
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    await this.db.prepare(`update posts set is_deleted = 1, updated_at = ? where id = ?`).bind(ts, postId).run();
    if (row?.origin_post_id) {
      await this.updateRepostCount(row.origin_post_id);
    }
  }
  async getPostAssets(postId) {
    const { results } = await this.db.prepare(
      `
          select ma.id as asset_id, ma.kind, ma.storage_key
          from post_media pm
          join media_assets ma on ma.id = pm.asset_id
          where pm.post_id = ?
          order by pm.order_index
        `
    ).bind(postId).all();
    return (results ?? []).map((r) => ({ assetId: r.asset_id, kind: r.kind, storageKey: r.storage_key }));
  }
  async deletePostMediaAndAssets(postId, assetIds) {
    if (assetIds.length === 0) return;
    const placeholders = assetIds.map(() => "?").join(",");
    await this.db.prepare(`delete from post_media_pet_tags where media_id in (select id from post_media where post_id = ?)`).bind(postId).run();
    await this.db.prepare(`delete from post_media where post_id = ?`).bind(postId).run();
    await this.db.prepare(`delete from media_assets where id in (${placeholders})`).bind(...assetIds).run();
  }
  async deletePostCascade(postId, assetIds) {
    const row = await this.db.prepare(`select origin_post_id from posts where id = ?`).bind(postId).first();
    await this.deletePostMediaAndAssets(postId, assetIds);
    await this.db.prepare(`delete from post_likes where post_id = ?`).bind(postId).run();
    await this.db.prepare(`delete from post_comments where post_id = ?`).bind(postId).run();
    await this.db.prepare(`delete from post_shares where post_id = ?`).bind(postId).run();
    await this.db.prepare(`delete from posts where id = ?`).bind(postId).run();
    if (row?.origin_post_id) {
      await this.updateRepostCount(row.origin_post_id);
    }
  }
  async hasLiked(postId, ownerId) {
    const row = await this.db.prepare(`select 1 from post_likes where post_id = ? and owner_id = ? limit 1`).bind(postId, ownerId).first();
    return !!row;
  }
  async likePost(postId, ownerId) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    await this.db.prepare(
      `
          insert into post_likes (post_id, owner_id, created_at)
          values (?, ?, ?)
        `
    ).bind(postId, ownerId, now).run();
    await this.db.prepare(
      `
          update posts
          set like_count = (select count(*) from post_likes where post_id = ?)
          where id = ?
        `
    ).bind(postId, postId).run();
  }
  async unlikePost(postId, ownerId) {
    await this.db.prepare(`delete from post_likes where post_id = ? and owner_id = ?`).bind(postId, ownerId).run();
    await this.db.prepare(
      `
          update posts
          set like_count = (select count(*) from post_likes where post_id = ?)
          where id = ?
        `
    ).bind(postId, postId).run();
  }
  async toggleLike(postId, ownerId) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const insertResult = await this.db.prepare(
      `insert into post_likes (post_id, owner_id, created_at)
         values (?, ?, ?)
         on conflict(post_id, owner_id) do nothing`
    ).bind(postId, ownerId, now).run();
    const inserted = insertResult?.meta?.changes ?? 0;
    if (inserted === 0) {
      await this.db.prepare(`delete from post_likes where post_id = ? and owner_id = ?`).bind(postId, ownerId).run();
    }
    const countRow = await this.db.prepare(`select count(*) as c from post_likes where post_id = ?`).bind(postId).first();
    const likeCount = countRow?.c ?? 0;
    await this.db.prepare(
      `
          update posts
          set like_count = ?
          where id = ?
        `
    ).bind(likeCount, postId).run();
    return { isLiked: inserted > 0, likeCount };
  }
  async createComment(input) {
    const id = crypto.randomUUID();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    await this.db.prepare(
      `
          insert into post_comments (
            id, post_id, owner_id, parent_comment_id, content_text, created_at, updated_at, is_deleted, like_count
          )
          values (?, ?, ?, ?, ?, ?, ?, 0, 0)
        `
    ).bind(id, input.postId, input.ownerId, input.parentCommentId ?? null, input.content, now, now).run();
    await this.db.prepare(`update posts set comment_count = comment_count + 1 where id = ?`).bind(input.postId).run();
    const row = await this.db.prepare(
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
    ).bind(id).first();
    if (!row) throw new Error("Failed to create comment");
    return mapCommentRow(row);
  }
  async getLatestComment(postId, currentOwnerUuid) {
    const joinLiked = !!currentOwnerUuid;
    const row = await this.db.prepare(
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
    ).bind(...joinLiked ? [currentOwnerUuid, postId] : [postId]).first();
    if (!row) return null;
    return mapCommentRow(row);
  }
  async getCommentById(commentId, currentOwnerUuid) {
    const joinLiked = !!currentOwnerUuid;
    const row = await this.db.prepare(
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
    ).bind(...joinLiked ? [currentOwnerUuid, commentId] : [commentId]).first();
    if (!row) return null;
    return mapCommentRow(row);
  }
  async listPostCommentsThread(postId, limit, cursor, currentOwnerUuid) {
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const parsed = parseCommentCursor(cursor);
    const joinLiked = !!currentOwnerUuid;
    const clauses = ["c.post_id = ?", "c.parent_comment_id is null", "c.is_deleted = 0"];
    const params = [];
    if (joinLiked && currentOwnerUuid) params.push(currentOwnerUuid);
    params.push(postId);
    if (parsed) {
      clauses.push("(c.created_at < ? or (c.created_at = ? and c.id < ?))");
      params.push(parsed.createdAt, parsed.createdAt, parsed.id);
    }
    const { results } = await this.db.prepare(
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
    ).bind(...params, safeLimit + 1).all();
    const rows = results ?? [];
    const hasMore = rows.length > safeLimit;
    const pageRows = hasMore ? rows.slice(0, safeLimit) : rows;
    const nextCursor = hasMore && pageRows.length > 0 ? toCommentCursor(pageRows[pageRows.length - 1]) : null;
    if (pageRows.length === 0) {
      return { items: [], nextCursor, hasMore };
    }
    const parentIds = pageRows.map((row) => row.id);
    const placeholders = parentIds.map(() => "?").join(",");
    const { results: replyRows } = await this.db.prepare(
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
    ).bind(...joinLiked && currentOwnerUuid ? [currentOwnerUuid, postId] : [postId], ...parentIds).all();
    const repliesByParent = /* @__PURE__ */ new Map();
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
  async toggleCommentLike(commentId, ownerId) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const insertResult = await this.db.prepare(
      `insert into comment_likes (comment_id, owner_id, created_at)
         values (?, ?, ?)
         on conflict(comment_id, owner_id) do nothing`
    ).bind(commentId, ownerId, now).run();
    const inserted = insertResult?.meta?.changes ?? 0;
    if (inserted === 0) {
      await this.db.prepare(`delete from comment_likes where comment_id = ? and owner_id = ?`).bind(commentId, ownerId).run();
    }
    const countRow = await this.db.prepare(`select count(*) as c from comment_likes where comment_id = ?`).bind(commentId).first();
    const likeCount = countRow?.c ?? 0;
    await this.db.prepare(`update post_comments set like_count = ? where id = ?`).bind(likeCount, commentId).run();
    return { isLiked: inserted > 0, likeCount };
  }
  async updateRepostCount(postId) {
    const countRow = await this.db.prepare(`select count(*) as c from posts where origin_post_id = ? and is_deleted = 0`).bind(postId).first();
    const repostCount = countRow?.c ?? 0;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    await this.db.prepare(`update posts set repost_count = ?, updated_at = ? where id = ?`).bind(repostCount, now, postId).run();
    return repostCount;
  }
  async isFriends(ownerId, friendId) {
    const row = await this.db.prepare(
      `
          select 1
          from owner_friendships
          where status = 'accepted'
            and ((owner_id = ? and friend_id = ?) or (owner_id = ? and friend_id = ?))
          limit 1
        `
    ).bind(ownerId, friendId, friendId, ownerId).first();
    return !!row;
  }
  async getChatThreadById(threadId) {
    const row = await this.db.prepare(
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
    ).bind(threadId).first();
    return row ? mapChatThreadRow(row) : null;
  }
  async getChatThreadByPairKey(pairKey) {
    const row = await this.db.prepare(
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
    ).bind(pairKey).first();
    return row ? mapChatThreadRow(row) : null;
  }
  async createChatThread(input) {
    await this.db.prepare(
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
    ).bind(
      input.threadId,
      input.ownerAId,
      input.ownerBId,
      input.pairKey,
      input.requestState,
      input.requestSenderId ?? null,
      input.requestMessageId ?? null,
      input.lastMessageId ?? null,
      input.lastActivityAt ?? null
    ).run();
    const thread = await this.getChatThreadById(input.threadId);
    if (!thread) {
      throw new Error("chat thread insert failed");
    }
    return thread;
  }
  async upsertChatParticipants(threadId, ownerAId, ownerBId) {
    await this.db.prepare(
      `
          insert or ignore into chat_thread_participants (thread_id, owner_id)
          values (?, ?), (?, ?)
        `
    ).bind(threadId, ownerAId, threadId, ownerBId).run();
  }
  async getChatParticipant(threadId, ownerId) {
    const row = await this.db.prepare(
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
    ).bind(threadId, ownerId).first();
    return row ? mapChatThreadParticipantRow(row) : null;
  }
  async setParticipantArchived(threadId, ownerId, archivedAt) {
    if (archivedAt === null) {
      await this.db.prepare(`update chat_thread_participants set archived_at = null where thread_id = ? and owner_id = ?`).bind(threadId, ownerId).run();
      return;
    }
    await this.db.prepare(`update chat_thread_participants set archived_at = ? where thread_id = ? and owner_id = ?`).bind(archivedAt, threadId, ownerId).run();
  }
  async setParticipantDeleted(threadId, ownerId, deletedAt) {
    if (deletedAt === null) {
      await this.db.prepare(`update chat_thread_participants set deleted_at = null where thread_id = ? and owner_id = ?`).bind(threadId, ownerId).run();
      return;
    }
    await this.db.prepare(`update chat_thread_participants set deleted_at = ? where thread_id = ? and owner_id = ?`).bind(deletedAt, threadId, ownerId).run();
  }
  async setParticipantLastRead(threadId, ownerId, messageId) {
    await this.db.prepare(`update chat_thread_participants set last_read_message_id = ? where thread_id = ? and owner_id = ?`).bind(messageId, threadId, ownerId).run();
  }
  async clearParticipantsArchiveDeleted(threadId) {
    await this.db.prepare(`update chat_thread_participants set archived_at = null, deleted_at = null where thread_id = ?`).bind(threadId).run();
  }
  async insertChatMessage(threadId, senderId, bodyText) {
    const id = crypto.randomUUID();
    await this.db.prepare(`insert into chat_messages (id, thread_id, sender_id, body_text) values (?, ?, ?, ?)`).bind(id, threadId, senderId, bodyText).run();
    const row = await this.db.prepare(
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
    ).bind(id).first();
    if (row) return mapChatMessageRow(row);
    return { id, threadId, senderId, bodyText, createdAt: (/* @__PURE__ */ new Date()).toISOString() };
  }
  async getChatMessageById(messageId) {
    const row = await this.db.prepare(
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
    ).bind(messageId).first();
    return row ? mapChatMessageRow(row) : null;
  }
  async listChatThreadsForOwner(ownerId, limit, cursor, includeArchived) {
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    let parsed = parseChatThreadCursor(cursor);
    if (!parsed && cursor) {
      const anchor = await this.getChatThreadById(cursor);
      const activityAt = anchor?.lastActivityAt ?? anchor?.updatedAt ?? anchor?.createdAt;
      if (activityAt) {
        parsed = { activityAt, id: anchor.id };
      }
    }
    const clauses = ["p.owner_id = ?"];
    const params = [ownerId, ownerId];
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
    const { results } = await this.db.prepare(
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
            (
              select count(*)
              from chat_messages cm
              where cm.thread_id = t.id
                and cm.sender_id <> p.owner_id
                and (
                  lr.created_at is null
                  or cm.created_at > lr.created_at
                  or (cm.created_at = lr.created_at and cm.id > lr.id)
                )
            ) as unread_count,
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
          left join chat_messages lr on lr.id = p.last_read_message_id
          where ${clauses.join(" and ")}
          order by sort_activity desc, t.id desc
          limit ?
        `
    ).bind(...params, safeLimit + 1).all();
    const rows = results ?? [];
    const hasMore = rows.length > safeLimit;
    const pageRows = hasMore ? rows.slice(0, safeLimit) : rows;
    const nextCursor = hasMore && pageRows.length > 0 ? toChatThreadCursor(pageRows[pageRows.length - 1]) : null;
    return { items: pageRows.map(mapChatThreadListRow), nextCursor };
  }
  async getChatThreadForOwner(threadId, ownerId) {
    const sortExpr = "coalesce(t.last_activity_at, t.updated_at, t.created_at)";
    const row = await this.db.prepare(
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
            (
              select count(*)
              from chat_messages cm
              where cm.thread_id = t.id
                and cm.sender_id <> p.owner_id
                and (
                  lr.created_at is null
                  or cm.created_at > lr.created_at
                  or (cm.created_at = lr.created_at and cm.id > lr.id)
                )
            ) as unread_count,
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
          left join chat_messages lr on lr.id = p.last_read_message_id
          where p.owner_id = ? and t.id = ?
          limit 1
        `
    ).bind(ownerId, ownerId, threadId).first();
    return row ? mapChatThreadListRow(row) : null;
  }
  async listChatMessages(threadId, limit, beforeCursor) {
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    let parsed = parseChatMessageCursor(beforeCursor);
    if (!parsed && beforeCursor) {
      if (looksLikeTimestamp(beforeCursor)) {
        parsed = { createdAt: beforeCursor };
      } else {
        const anchor = await this.db.prepare(`select created_at from chat_messages where id = ?`).bind(beforeCursor).first();
        if (anchor?.created_at) {
          parsed = { createdAt: anchor.created_at, id: beforeCursor };
        }
      }
    }
    const clauses = ["thread_id = ?"];
    const params = [threadId];
    if (parsed) {
      if (parsed.id) {
        clauses.push("(created_at < ? or (created_at = ? and id < ?))");
        params.push(parsed.createdAt, parsed.createdAt, parsed.id);
      } else {
        clauses.push("created_at < ?");
        params.push(parsed.createdAt);
      }
    }
    const { results } = await this.db.prepare(
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
    ).bind(...params, safeLimit + 1).all();
    const rows = results ?? [];
    const hasMore = rows.length > safeLimit;
    const pageRows = hasMore ? rows.slice(0, safeLimit) : rows;
    const nextCursor = hasMore && pageRows.length > 0 ? toChatMessageCursor(pageRows[pageRows.length - 1]) : null;
    const items = pageRows.slice().reverse().map(mapChatMessageRow);
    return { items, nextCursor };
  }
  async updateChatThreadOnNewMessage(threadId, lastMessageId, options) {
    const updates = ["last_message_id = ?", "last_activity_at = datetime('now')", "updated_at = datetime('now')"];
    const params = [lastMessageId];
    if (options?.requestMessageId) {
      updates.push("request_message_id = ?");
      params.push(options.requestMessageId);
    }
    if (options?.requestSenderId) {
      updates.push("request_sender_id = ?");
      params.push(options.requestSenderId);
    }
    await this.db.prepare(`update chat_threads set ${updates.join(", ")} where id = ?`).bind(...params, threadId).run();
  }
  async updateChatThreadRequestState(threadId, requestState, requestSenderId, requestMessageId) {
    const updates = ["request_state = ?", "updated_at = datetime('now')"];
    const params = [requestState];
    if (requestSenderId !== void 0) {
      updates.push("request_sender_id = ?");
      params.push(requestSenderId ?? null);
    }
    if (requestMessageId !== void 0) {
      updates.push("request_message_id = ?");
      params.push(requestMessageId ?? null);
    }
    await this.db.prepare(`update chat_threads set ${updates.join(", ")} where id = ?`).bind(...params, threadId).run();
  }
  async populateOriginPosts(posts) {
    const originIds = Array.from(new Set(posts.map((post) => post.originPostId).filter((id) => !!id)));
    if (originIds.length === 0) return;
    const placeholders = originIds.map(() => "?").join(",");
    const { results } = await this.db.prepare(
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
    ).bind(...originIds).all();
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
  async populateMedia(posts) {
    if (posts.length === 0) return;
    const ids = posts.map((p) => p.id);
    const placeholders = ids.map(() => "?").join(",");
    const { results } = await this.db.prepare(
      `
          select pm.post_id, ma.url
          from post_media pm
          join media_assets ma on ma.id = pm.asset_id
          where pm.post_id in (${placeholders})
          order by pm.post_id, pm.order_index
        `
    ).bind(...ids).all();
    const grouped = /* @__PURE__ */ new Map();
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
  sanitizeStreamUrl(url) {
    if (!url) return url;
    let cleaned = url.replace(/customer-customer-/gi, "customer-");
    cleaned = cleaned.replace(/\.cloudflarestream\.com\.cloudflarestream\.com/gi, ".cloudflarestream.com");
    return cleaned;
  }
  async getOwnerByEmail(email) {
    const row = await this.db.prepare(
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
    ).bind(email).first();
    return row ? mapOwnerRow(row) : null;
  }
  async getOwnerByUuid(uuid) {
    const row = await this.db.prepare(
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
    ).bind(uuid).first();
    return row ? mapOwnerRow(row) : null;
  }
  async getOwnerByAccountId(accountId) {
    const row = await this.db.prepare(
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
    ).bind(accountId).first();
    return row ? mapOwnerRow(row) : null;
  }
  async searchOwnersByDisplayName(keyword, limit, excludeOwnerUuid) {
    const kw = keyword.trim().toLowerCase();
    const rows = await this.db.prepare(
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
    ).bind(excludeOwnerUuid, kw, kw, kw, kw, limit).all();
    return (rows.results ?? []).map(mapOwnerPublicRow);
  }
  async getFriendshipRowByPairKey(pairKey) {
    const row = await this.db.prepare(`select status, requested_by from owner_friendships where pair_key = ?`).bind(pairKey).first();
    return row ? { status: row.status, requestedBy: row.requested_by } : null;
  }
  async createFriendRequest(input) {
    const res = await this.db.prepare(
      `
        insert into owner_friendships (owner_id, friend_id, status, requested_by, pair_key)
        values (?, ?, 'pending', ?, ?)
        `
    ).bind(input.ownerA, input.ownerB, input.requestedBy, input.pairKey).run();
    return res?.meta?.last_row_id ?? 0;
  }
  async deletePendingRequest(pairKey, requestedBy) {
    const res = await this.db.prepare(`delete from owner_friendships where pair_key = ? and status = 'pending' and requested_by = ?`).bind(pairKey, requestedBy).run();
    return res.meta.changes ?? 0;
  }
  async deletePendingIncoming(pairKey, me) {
    const res = await this.db.prepare(`delete from owner_friendships where pair_key = ? and status = 'pending' and requested_by != ?`).bind(pairKey, me).run();
    return res.meta.changes ?? 0;
  }
  async acceptPendingIncoming(pairKey, me) {
    const res = await this.db.prepare(
      `
        update owner_friendships
        set status = 'accepted', updated_at = datetime('now')
        where pair_key = ? and status = 'pending' and requested_by != ?
        `
    ).bind(pairKey, me).run();
    return res.meta.changes ?? 0;
  }
  async deleteFriendship(pairKey) {
    const res = await this.db.prepare(`delete from owner_friendships where pair_key = ? and status = 'accepted'`).bind(pairKey).run();
    return res.meta.changes ?? 0;
  }
  async listIncomingRequests(me, limit) {
    const rows = await this.db.prepare(
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
    ).bind(me, me, me, me, limit).all();
    return (rows.results ?? []).map((row) => ({
      otherOwner: mapOwnerPublicRow(row),
      createdAt: row.created_at
    }));
  }
  async listOutgoingRequests(me, limit) {
    const rows = await this.db.prepare(
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
    ).bind(me, me, limit).all();
    return (rows.results ?? []).map((row) => ({
      otherOwner: mapOwnerPublicRow(row),
      createdAt: row.created_at
    }));
  }
  async listFriends(me, limit) {
    const rows = await this.db.prepare(
      `
        select
          o.uuid, o.display_name, o.avatar_url, o.city, o.region
        from owner_friendships f
        join owners o
          on o.uuid = (case when f.owner_id = ? then f.friend_id else f.owner_id end)
        where f.status = 'accepted'
          and (f.owner_id = ? or f.friend_id = ?)
        order by f.updated_at desc
        limit ?
        `
    ).bind(me, me, me, limit).all();
    return (rows.results ?? []).map(mapOwnerPublicRow);
  }
  async countActivePetsByOwner(ownerId) {
    const row = await this.db.prepare(`select count(*) as c from pets where owner_id = ? and is_active = 1`).bind(ownerId).first();
    return row?.c ?? 0;
  }
  async listPetsByOwner(ownerId) {
    const rows = await this.db.prepare(
      `
          select id, name, avatar_url
          from pets
          where owner_id = ? and is_active = 1
          order by created_at desc
        `
    ).bind(ownerId).all();
    return (rows.results ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      avatarUrl: row.avatar_url ?? null
    }));
  }
  async isPetOwnedByOwner(petId, ownerId) {
    const row = await this.db.prepare(`select 1 as ok from pets where id = ? and owner_id = ? limit 1`).bind(petId, ownerId).first();
    return row?.ok === 1;
  }
  async isFollowingPet(followerOwnerId, petId) {
    const row = await this.db.prepare(`select 1 as ok from pet_follows where follower_owner_id = ? and pet_id = ? limit 1`).bind(followerOwnerId, petId).first();
    return row?.ok === 1;
  }
  async followPetTx(followerOwnerId, petId) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const [_, __, countResult] = await this.db.batch([
      this.db.prepare(
        `
            insert into pet_follows (follower_owner_id, pet_id, created_at)
            values (?, ?, ?)
            on conflict(follower_owner_id, pet_id) do nothing
          `
      ).bind(followerOwnerId, petId, now),
      this.db.prepare(
        `
            update pets
            set followers_count = followers_count + (case when changes() > 0 then 1 else 0 end)
            where id = ?
          `
      ).bind(petId),
      this.db.prepare(`select followers_count from pets where id = ?`).bind(petId)
    ]);
    const count = countResult?.results?.[0]?.followers_count;
    return count ?? 0;
  }
  async unfollowPetTx(followerOwnerId, petId) {
    const [_, __, countResult] = await this.db.batch([
      this.db.prepare(`delete from pet_follows where follower_owner_id = ? and pet_id = ?`).bind(followerOwnerId, petId),
      this.db.prepare(
        `
            update pets
            set followers_count = case
              when changes() > 0 and followers_count > 0 then followers_count - 1
              else followers_count
            end
            where id = ?
          `
      ).bind(petId),
      this.db.prepare(`select followers_count from pets where id = ?`).bind(petId)
    ]);
    const count = countResult?.results?.[0]?.followers_count;
    return count ?? 0;
  }
  async listFollowedPets(followerOwnerId, limit, cursor) {
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const params = [followerOwnerId];
    const clauses = ["pf.follower_owner_id = ?"];
    if (cursor) {
      clauses.push("pf.id < ?");
      params.push(cursor);
    }
    const { results } = await this.db.prepare(
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
    ).bind(...params, safeLimit + 1).all();
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
  async listPetFollowers(petId, limit, cursor) {
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const params = [petId];
    const clauses = ["pf.pet_id = ?"];
    if (cursor) {
      clauses.push("pf.id < ?");
      params.push(cursor);
    }
    const { results } = await this.db.prepare(
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
    ).bind(...params, safeLimit + 1).all();
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
  async createPet(input) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    await this.db.prepare(
      `
          insert into pets (
            id, owner_id, name, "class", species, breed, gender, birthday, avatar_asset_id,
            avatar_url, bio, created_at, updated_at, is_active
          )
          values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `
    ).bind(
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
    ).run();
    const row = await this.getPetById(input.id);
    if (!row) throw new Error("Failed to create pet");
    return row;
  }
  async getPetById(id) {
    const row = await this.db.prepare(
      `
          select
            id, owner_id, name, "class" as class, species, breed, gender, birthday,
            avatar_asset_id, avatar_url, bio, followers_count, created_at, updated_at, is_active
          from pets
          where id = ?
        `
    ).bind(id).first();
    return row ? mapPetRow(row) : null;
  }
  async createOwner(input) {
    const createdAt = (/* @__PURE__ */ new Date()).toISOString();
    await this.db.prepare(
      `
          insert into owners (account_id, uuid, display_name, avatar_url, city, region, created_at, updated_at)
          values (?, ?, ?, ?, ?, ?, ?, ?)
        `
    ).bind(
      input.accountId,
      input.uuid,
      input.displayName,
      input.avatarUrl ?? null,
      null,
      null,
      createdAt,
      createdAt
    ).run();
    const row = await this.getOwnerByUuid(input.uuid);
    if (!row) {
      throw new Error("Failed to create owner");
    }
    return row;
  }
  async createAccount(input) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    await this.db.prepare(
      `
          insert into accounts (id, email, password_hash, real_name, id_number, phone_number, is_verified, created_at, updated_at, face_with_license_url, id_license_front_url, id_license_back_url)
          values (?, ?, ?, ?, ?, ?, 0, ?, ?, NULL, NULL, NULL)
        `
    ).bind(
      input.accountId,
      input.email,
      input.passwordHash,
      input.realName ?? null,
      input.idNumber ?? null,
      input.phoneNumber ?? null,
      now,
      now
    ).run();
    const row = await this.db.prepare(
      `
          select id as account_id, email, password_hash, real_name, id_number, phone_number, is_verified, id_license_front_url, id_license_back_url, face_with_license_url, created_at, updated_at
          from accounts
          where id = ?
        `
    ).bind(input.accountId).first();
    if (!row) throw new Error("Failed to create account");
    return mapAccountRow(row);
  }
  async updateOwnerLocation(ownerUuid, city, region) {
    const updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    await this.db.prepare(
      `
          update owners
          set city = ?, region = ?, updated_at = ?
          where uuid = ?
        `
    ).bind(city, region, updatedAt, ownerUuid).run();
    const row = await this.getOwnerByUuid(ownerUuid);
    if (!row) {
      throw new Error("Owner not found");
    }
    return row;
  }
  async getAccountById(accountId) {
    const row = await this.db.prepare(
      `
          select id as account_id, email, password_hash, real_name, id_number, phone_number, is_verified,
                 id_license_front_url, id_license_back_url, face_with_license_url, created_at, updated_at
          from accounts
          where id = ?
        `
    ).bind(accountId).first();
    return row ? mapAccountRow(row) : null;
  }
  async getAccountByEmail(email) {
    const row = await this.db.prepare(
      `
          select id as account_id, email, password_hash, real_name, id_number, phone_number, is_verified,
                 id_license_front_url, id_license_back_url, face_with_license_url, created_at, updated_at
          from accounts
          where email = ?
        `
    ).bind(email).first();
    return row ? mapAccountRow(row) : null;
  }
  async updateAccountVerificationUrls(accountId, urls) {
    const updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    const setPendingClause = urls.setPending ? ", is_verified = case when is_verified = 0 then 2 else is_verified end" : "";
    await this.db.prepare(
      `
          update accounts
          set
            id_license_front_url = coalesce(?, id_license_front_url),
            id_license_back_url = coalesce(?, id_license_back_url),
            face_with_license_url = coalesce(?, face_with_license_url),
            updated_at = ?${setPendingClause}
          where id = ?
        `
    ).bind(urls.frontUrl ?? null, urls.backUrl ?? null, urls.faceUrl ?? null, updatedAt, accountId).run();
  }
  async updateAccountVerificationStatus(accountId, status) {
    const updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    await this.db.prepare(
      `
          update accounts
          set is_verified = ?, updated_at = ?
          where id = ?
        `
    ).bind(status, updatedAt, accountId).run();
  }
  async countVerificationStatuses() {
    const row = await this.db.prepare(
      `
          select
            sum(case when is_verified = 2 then 1 else 0 end) as pending,
            sum(case when is_verified = 1 then 1 else 0 end) as verified,
            sum(case when is_verified = 0 then 1 else 0 end) as awaiting,
            sum(case when is_verified = 3 then 1 else 0 end) as failed
          from accounts
        `
    ).first();
    return {
      pending: row?.pending ?? 0,
      verified: row?.verified ?? 0,
      awaiting: row?.awaiting ?? 0,
      failed: row?.failed ?? 0
    };
  }
  async listVerifications() {
    const { results } = await this.db.prepare(
      `
          select account_id, real_name, id_number, phone_number, is_verified, created_at
          from accounts
          order by created_at desc
        `
    ).all();
    return (results ?? []).map((row) => ({
      accountId: row.account_id,
      realName: row.real_name ?? null,
      idNumber: row.id_number ?? null,
      phoneNumber: row.phone_number ?? null,
      createdAt: row.created_at,
      isVerified: row.is_verified
    }));
  }
  async listAdminAccounts() {
    const { results } = await this.db.prepare(
      `
          select id, admin_id, permission, ip_allowlist, created_at, last_at, updated_at
          from admin_accounts
          order by id desc
        `
    ).all();
    return (results ?? []).map(mapAdminAccountRow);
  }
  async createAdminAccount(input) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    await this.db.prepare(
      `
          insert into admin_accounts (admin_id, password, permission, created_at, updated_at)
          values (?, ?, ?, ?, ?)
        `
    ).bind(input.adminId, input.password, input.permission, now, now).run();
    const row = await this.db.prepare(
      `
          select id, admin_id, permission, ip_allowlist, created_at, last_at, updated_at
          from admin_accounts
          where admin_id = ?
        `
    ).bind(input.adminId).first();
    if (!row) throw new Error("Failed to create admin account");
    return mapAdminAccountRow(row);
  }
  async getAdminByAdminId(adminId) {
    const row = await this.db.prepare(
      `
          select id, admin_id, password, permission, ip_allowlist, created_at, last_at, updated_at
          from admin_accounts
          where admin_id = ?
        `
    ).bind(adminId).first();
    if (!row) return null;
    return { ...mapAdminAccountRow(row), passwordHash: row.password };
  }
  async updateAdminLastAt(adminId, ts) {
    await this.db.prepare(`update admin_accounts set last_at = ? where admin_id = ?`).bind(ts, adminId).run();
  }
  async updateAdminPassword(adminId, passwordHash) {
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    await this.db.prepare(`update admin_accounts set password = ?, updated_at = ? where admin_id = ?`).bind(passwordHash, ts, adminId).run();
  }
  async updateAdminIpAllowlist(adminId, ipAllowlist) {
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    const result = await this.db.prepare(`update admin_accounts set ip_allowlist = ?, updated_at = ? where admin_id = ?`).bind(ipAllowlist, ts, adminId).run();
    const changes = result?.meta?.changes ?? 0;
    return changes > 0;
  }
  async listAdminIpAllowlist() {
    const { results } = await this.db.prepare(
      `
          select ip_allowlist
          from admin_accounts
          where ip_allowlist is not null and trim(ip_allowlist) <> ''
        `
    ).all();
    return (results ?? []).map((row) => row.ip_allowlist ?? "").filter(Boolean);
  }
};
function mapPostRow(row) {
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
__name(mapPostRow, "mapPostRow");
function mapCommentRow(row) {
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
__name(mapCommentRow, "mapCommentRow");
function parseCommentCursor(cursor) {
  if (!cursor) return null;
  const [createdAt, id] = cursor.split("|");
  if (!createdAt || !id) return null;
  return { createdAt, id };
}
__name(parseCommentCursor, "parseCommentCursor");
function toCommentCursor(row) {
  return `${row.created_at}|${row.id}`;
}
__name(toCommentCursor, "toCommentCursor");
function parseChatThreadCursor(cursor) {
  if (!cursor) return null;
  const [activityAt, id] = cursor.split("|");
  if (activityAt && id) return { activityAt, id };
  if (activityAt && looksLikeTimestamp(activityAt)) return { activityAt };
  return null;
}
__name(parseChatThreadCursor, "parseChatThreadCursor");
function toChatThreadCursor(row) {
  const activityAt = row.sort_activity ?? row.last_activity_at;
  if (!activityAt) return null;
  return `${activityAt}|${row.thread_id}`;
}
__name(toChatThreadCursor, "toChatThreadCursor");
function parseChatMessageCursor(cursor) {
  if (!cursor) return null;
  const [createdAt, id] = cursor.split("|");
  if (!createdAt || !id) return null;
  return { createdAt, id };
}
__name(parseChatMessageCursor, "parseChatMessageCursor");
function toChatMessageCursor(row) {
  return `${row.created_at}|${row.id}`;
}
__name(toChatMessageCursor, "toChatMessageCursor");
function looksLikeTimestamp(value) {
  return value.includes("-") && value.includes(":");
}
__name(looksLikeTimestamp, "looksLikeTimestamp");
function mapOwnerPublicRow(row) {
  return {
    uuid: row.uuid,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    city: row.city,
    region: row.region
  };
}
__name(mapOwnerPublicRow, "mapOwnerPublicRow");
function mapChatThreadRow(row) {
  return {
    id: row.id,
    ownerAId: row.owner_a_id,
    ownerBId: row.owner_b_id,
    pairKey: row.pair_key,
    requestState: row.request_state,
    requestSenderId: row.request_sender_id ?? null,
    requestMessageId: row.request_message_id ?? null,
    lastMessageId: row.last_message_id ?? null,
    lastActivityAt: row.last_activity_at ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null
  };
}
__name(mapChatThreadRow, "mapChatThreadRow");
function mapChatThreadParticipantRow(row) {
  return {
    threadId: row.thread_id,
    ownerId: row.owner_id,
    lastReadMessageId: row.last_read_message_id ?? null,
    archivedAt: row.archived_at ?? null,
    deletedAt: row.deleted_at ?? null
  };
}
__name(mapChatThreadParticipantRow, "mapChatThreadParticipantRow");
function mapChatMessageRow(row) {
  return {
    id: row.id,
    threadId: row.thread_id,
    senderId: row.sender_id,
    bodyText: row.body_text,
    createdAt: row.created_at
  };
}
__name(mapChatMessageRow, "mapChatMessageRow");
function mapChatThreadListRow(row) {
  return {
    threadId: row.thread_id,
    requestState: row.request_state,
    requestSenderId: row.request_sender_id ?? null,
    requestMessageId: row.request_message_id ?? null,
    lastMessageId: row.last_message_id ?? null,
    lastActivityAt: row.last_activity_at ?? null,
    lastMessagePreview: row.last_message_preview ?? null,
    lastReadMessageId: row.last_read_message_id ?? null,
    unreadCount: row.unread_count ?? 0,
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
__name(mapChatThreadListRow, "mapChatThreadListRow");
function mapOwnerRow(row) {
  return {
    accountId: row.account_id,
    uuid: row.uuid,
    displayName: row.display_name,
    email: row.email ?? null,
    avatarUrl: row.avatar_url ?? null,
    passwordHash: row.password_hash ?? void 0,
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
__name(mapOwnerRow, "mapOwnerRow");
function mapPetRow(row) {
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
__name(mapPetRow, "mapPetRow");
function mapAccountRow(row) {
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
__name(mapAccountRow, "mapAccountRow");
function mapAdminAccountRow(row) {
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
__name(mapAdminAccountRow, "mapAdminAccountRow");
function mapMediaAssetRow(row) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    kind: row.kind,
    usage: row.usage,
    storageProvider: row.storage_provider,
    storageKey: row.storage_key,
    url: row.url ?? null,
    thumbnailUrl: row.thumbnail_url ?? null,
    mimeType: row.mime_type ?? null,
    sizeBytes: row.size_bytes ?? null,
    width: row.width ?? null,
    height: row.height ?? null,
    durationSec: row.duration_sec ?? null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
__name(mapMediaAssetRow, "mapMediaAssetRow");

// src/db/index.ts
function createDB(env) {
  return new D1Client(env.DB);
}
__name(createDB, "createDB");

// src/services/health.ts
async function checkHealth(env, db) {
  const d1Ok = await db.ping();
  let r2Ok = true;
  try {
    await env.R2_MEDIA.head("healthcheck.txt");
  } catch (err) {
    console.warn("R2 health check failed", err);
    r2Ok = false;
  }
  const cfAccountId = env.CF_ACCOUNT_ID;
  const cfToken = env.CF_API_TOKEN;
  let cfMediaOk = !!(cfAccountId && cfToken);
  if (cfMediaOk) {
    try {
      const imgResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/images/v1?per_page=1`, {
        headers: { Authorization: `Bearer ${cfToken}` }
      });
      const streamResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/stream?per_page=1`, {
        headers: { Authorization: `Bearer ${cfToken}` }
      });
      cfMediaOk = imgResp.ok && streamResp.ok;
    } catch (err) {
      console.warn("Cloudflare media health check failed", err);
      cfMediaOk = false;
    }
  }
  const ok = d1Ok && r2Ok && cfMediaOk;
  return {
    ok,
    environment: env.ENVIRONMENT ?? "development",
    d1: d1Ok,
    r2: r2Ok,
    cfMedia: cfMediaOk,
    ts: (/* @__PURE__ */ new Date()).toISOString()
  };
}
__name(checkHealth, "checkHealth");

// src/api/routes/system.ts
async function healthRoute(ctx) {
  const status = await checkHealth(ctx.env, ctx.db);
  return okJson(status, 200);
}
__name(healthRoute, "healthRoute");
async function rootRoute() {
  return okJson(
    {
      message: "Rubypets API",
      endpoints: [
        "/api/health",
        "/api/posts",
        "/api/posts?userId=...",
        "/api/posts/:id/media/attach",
        "/api/auth/register",
        "/api/auth/login",
        "/api/media/images/init",
        "/api/media/videos/init",
        "/api/me",
        "/api/owners/:uuid"
      ]
    },
    200
  );
}
__name(rootRoute, "rootRoute");
var routes = [
  { method: "GET", path: "/health", handler: healthRoute },
  { method: "GET", path: "/", handler: rootRoute }
];

// src/services/auth.ts
async function parseRegisterPayload(request) {
  return readJson(request);
}
__name(parseRegisterPayload, "parseRegisterPayload");
async function parseRegisterAccountOnlyPayload(request) {
  return readJson(request);
}
__name(parseRegisterAccountOnlyPayload, "parseRegisterAccountOnlyPayload");
async function parseRegisterOwnerPayload(request) {
  return readJson(request);
}
__name(parseRegisterOwnerPayload, "parseRegisterOwnerPayload");
async function parseLoginPayload(request) {
  return readJson(request);
}
__name(parseLoginPayload, "parseLoginPayload");
async function registerUser(db, payload) {
  const email = (payload.email ?? "").trim().toLowerCase();
  const password = payload.password ?? "";
  const displayName = (payload.displayName ?? email.split("@")[0] ?? "user").trim();
  const phoneNumber = (payload.phoneNumber ?? "").trim() || null;
  const realName = (payload.realName ?? displayName).trim();
  if (!email || !password) {
    throw new Error("email and password are required");
  }
  const existingEmail = await db.getOwnerByEmail(email);
  if (existingEmail) {
    throw new Error("email already registered");
  }
  const passwordHash = await hashPassword(password);
  const accountId = generateAccountId();
  const uuid = generateOwnerUuid();
  await db.createAccount({
    accountId,
    email,
    passwordHash,
    realName,
    phoneNumber: phoneNumber ?? void 0
  });
  const owner = await db.createOwner({
    accountId,
    uuid,
    displayName
  });
  const tokens = issueTokens(owner.uuid);
  return { owner: toPublicOwner(owner), tokens };
}
__name(registerUser, "registerUser");
async function registerAccountOnly(db, payload) {
  const email = (payload.email ?? "").trim().toLowerCase();
  const password = payload.password ?? "";
  if (!email || !password) throw new Error("email and password are required");
  const existingAccount = await db.getAccountByEmail(email);
  if (existingAccount) {
    throw new Error("email already registered");
  }
  const passwordHash = await hashPassword(password);
  const accountId = generateAccountId();
  const account = await db.createAccount({
    accountId,
    email,
    passwordHash,
    realName: null,
    phoneNumber: null
  });
  return { accountId: account.accountId, email: account.email };
}
__name(registerAccountOnly, "registerAccountOnly");
async function registerOwnerForAccount(db, payload) {
  const accountId = (payload.accountId ?? "").trim();
  const displayName = (payload.displayName ?? "").trim();
  if (!accountId || !displayName) throw new Error("accountId and displayName are required");
  const account = await db.getAccountById(accountId);
  if (!account) throw new Error("account not found");
  const existingOwner = await db.getOwnerByAccountId(accountId);
  if (existingOwner) throw new Error("owner already exists for this account");
  const uuid = generateOwnerUuid();
  const owner = await db.createOwner({
    accountId,
    uuid,
    displayName
  });
  const tokens = issueTokens(owner.uuid);
  return { owner: toPublicOwner(owner), tokens };
}
__name(registerOwnerForAccount, "registerOwnerForAccount");
async function loginUser(db, payload) {
  const email = (payload.email ?? "").trim().toLowerCase();
  const password = payload.password ?? "";
  if (!email || !password) {
    throw new Error("email and password are required");
  }
  const owner = await db.getOwnerByEmail(email);
  if (!owner || !owner.passwordHash) {
    throw new Error("invalid credentials");
  }
  const ok = await verifyPassword(password, owner.passwordHash);
  if (!ok) throw new Error("invalid credentials");
  const tokens = issueTokens(owner.uuid);
  return { owner: toPublicOwner(owner), tokens };
}
__name(loginUser, "loginUser");
async function getUserFromAuthHeader(db, request) {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice("bearer ".length).trim();
  const ownerUuid = parseUserIdFromToken(token);
  if (!ownerUuid) return null;
  return db.getOwnerByUuid(ownerUuid);
}
__name(getUserFromAuthHeader, "getUserFromAuthHeader");
function toPublicOwner(owner) {
  const email = owner.email ?? "";
  return {
    id: owner.uuid,
    handle: owner.displayName || email.split("@")[0] || owner.uuid,
    displayName: owner.displayName,
    email: owner.email ?? null,
    avatarUrl: owner.avatarUrl ?? null,
    maxPets: owner.maxPets,
    createdAt: owner.createdAt,
    updatedAt: owner.updatedAt,
    isActive: owner.isActive
  };
}
__name(toPublicOwner, "toPublicOwner");
function issueTokens(ownerUuid) {
  return {
    accessToken: `owner:${ownerUuid}`,
    expiresIn: 60 * 60 * 24 * 30
  };
}
__name(issueTokens, "issueTokens");
function parseUserIdFromToken(token) {
  if (!token.startsWith("owner:")) return null;
  return token.slice("owner:".length);
}
__name(parseUserIdFromToken, "parseUserIdFromToken");
async function hashPassword(password) {
  const salt = crypto.randomUUID();
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hashHex = bufferToHex(digest);
  return `${salt}:${hashHex}`;
}
__name(hashPassword, "hashPassword");
async function verifyPassword(password, stored) {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bufferToHex(digest) === hashHex;
}
__name(verifyPassword, "verifyPassword");
function bufferToHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(bufferToHex, "bufferToHex");
function randomLowerId(len = 8) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  for (let i = 0; i < len; i++) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}
__name(randomLowerId, "randomLowerId");
function generateAccountId() {
  return `acct_${randomLowerId(12)}`;
}
__name(generateAccountId, "generateAccountId");
function generateOwnerUuid() {
  return `owner_${randomLowerId(8)}`;
}
__name(generateOwnerUuid, "generateOwnerUuid");

// src/api/routes/auth.ts
async function registerRoute(ctx) {
  try {
    const payload = await parseRegisterPayload(ctx.request);
    const { owner, tokens } = await registerUser(ctx.db, payload);
    return okJson({ user: owner, ...tokens }, 201);
  } catch (err) {
    return errorJson(err.message, 400);
  }
}
__name(registerRoute, "registerRoute");
async function registerAccountRoute(ctx) {
  try {
    const payload = await parseRegisterAccountOnlyPayload(ctx.request);
    const account = await registerAccountOnly(ctx.db, payload);
    return okJson({ account }, 201);
  } catch (err) {
    return errorJson(err.message, 400);
  }
}
__name(registerAccountRoute, "registerAccountRoute");
async function registerOwnerRoute(ctx) {
  try {
    const payload = await parseRegisterOwnerPayload(ctx.request);
    const { owner, tokens } = await registerOwnerForAccount(ctx.db, payload);
    return okJson({ user: owner, ...tokens }, 201);
  } catch (err) {
    return errorJson(err.message, 400);
  }
}
__name(registerOwnerRoute, "registerOwnerRoute");
async function loginRoute(ctx) {
  try {
    const payload = await parseLoginPayload(ctx.request);
    const { owner, tokens } = await loginUser(ctx.db, payload);
    return okJson({ user: owner, ...tokens }, 200);
  } catch (err) {
    const message2 = err.message;
    const status = message2 === "invalid credentials" ? 401 : 400;
    return errorJson(message2, status);
  }
}
__name(loginRoute, "loginRoute");
async function meRoute(ctx) {
  const user = await getUserFromAuthHeader(ctx.db, ctx.request);
  if (!user) return errorJson("Unauthorized", 401);
  return okJson(toPublicOwner(user), 200);
}
__name(meRoute, "meRoute");
var routes2 = [
  { method: "POST", path: "/auth/register", handler: registerRoute },
  { method: "POST", path: "/auth/register/account", handler: registerAccountRoute },
  { method: "POST", path: "/auth/register/owner", handler: registerOwnerRoute },
  { method: "POST", path: "/auth/login", handler: loginRoute },
  { method: "GET", path: "/me", handler: meRoute }
];

// src/services/posts.ts
async function listRecentPosts(db, limit = 20, currentOwnerUuid) {
  return db.listRecentPosts(limit, currentOwnerUuid);
}
__name(listRecentPosts, "listRecentPosts");
async function getPostsByOwner(db, ownerUuid, limit = 20, currentOwnerUuid) {
  return db.getPostsByOwner(ownerUuid, limit, currentOwnerUuid);
}
__name(getPostsByOwner, "getPostsByOwner");
async function createPost(db, input) {
  return db.createPost({
    authorId: input.authorId,
    body: input.content,
    visibility: input.visibility ?? "public",
    postType: input.postType ?? "text",
    mediaCount: 0,
    originPostId: input.originPostId ?? null
  });
}
__name(createPost, "createPost");

// ../node_modules/jose/dist/webapi/lib/buffer_utils.js
var encoder = new TextEncoder();
var decoder = new TextDecoder();
var MAX_INT32 = 2 ** 32;
function concat(...buffers) {
  const size = buffers.reduce((acc, { length }) => acc + length, 0);
  const buf = new Uint8Array(size);
  let i = 0;
  for (const buffer of buffers) {
    buf.set(buffer, i);
    i += buffer.length;
  }
  return buf;
}
__name(concat, "concat");
function encode(string) {
  const bytes = new Uint8Array(string.length);
  for (let i = 0; i < string.length; i++) {
    const code = string.charCodeAt(i);
    if (code > 127) {
      throw new TypeError("non-ASCII string encountered in encode()");
    }
    bytes[i] = code;
  }
  return bytes;
}
__name(encode, "encode");

// ../node_modules/jose/dist/webapi/lib/base64.js
function encodeBase64(input) {
  if (Uint8Array.prototype.toBase64) {
    return input.toBase64();
  }
  const CHUNK_SIZE = 32768;
  const arr = [];
  for (let i = 0; i < input.length; i += CHUNK_SIZE) {
    arr.push(String.fromCharCode.apply(null, input.subarray(i, i + CHUNK_SIZE)));
  }
  return btoa(arr.join(""));
}
__name(encodeBase64, "encodeBase64");
function decodeBase64(encoded) {
  if (Uint8Array.fromBase64) {
    return Uint8Array.fromBase64(encoded);
  }
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
__name(decodeBase64, "decodeBase64");

// ../node_modules/jose/dist/webapi/util/base64url.js
function decode(input) {
  if (Uint8Array.fromBase64) {
    return Uint8Array.fromBase64(typeof input === "string" ? input : decoder.decode(input), {
      alphabet: "base64url"
    });
  }
  let encoded = input;
  if (encoded instanceof Uint8Array) {
    encoded = decoder.decode(encoded);
  }
  encoded = encoded.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return decodeBase64(encoded);
  } catch {
    throw new TypeError("The input to be decoded is not correctly encoded.");
  }
}
__name(decode, "decode");
function encode2(input) {
  let unencoded = input;
  if (typeof unencoded === "string") {
    unencoded = encoder.encode(unencoded);
  }
  if (Uint8Array.prototype.toBase64) {
    return unencoded.toBase64({ alphabet: "base64url", omitPadding: true });
  }
  return encodeBase64(unencoded).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
__name(encode2, "encode");

// ../node_modules/jose/dist/webapi/util/errors.js
var JOSEError = class extends Error {
  static {
    __name(this, "JOSEError");
  }
  static code = "ERR_JOSE_GENERIC";
  code = "ERR_JOSE_GENERIC";
  constructor(message2, options) {
    super(message2, options);
    this.name = this.constructor.name;
    Error.captureStackTrace?.(this, this.constructor);
  }
};
var JOSENotSupported = class extends JOSEError {
  static {
    __name(this, "JOSENotSupported");
  }
  static code = "ERR_JOSE_NOT_SUPPORTED";
  code = "ERR_JOSE_NOT_SUPPORTED";
};
var JWSInvalid = class extends JOSEError {
  static {
    __name(this, "JWSInvalid");
  }
  static code = "ERR_JWS_INVALID";
  code = "ERR_JWS_INVALID";
};
var JWTInvalid = class extends JOSEError {
  static {
    __name(this, "JWTInvalid");
  }
  static code = "ERR_JWT_INVALID";
  code = "ERR_JWT_INVALID";
};

// ../node_modules/jose/dist/webapi/lib/crypto_key.js
var unusable = /* @__PURE__ */ __name((name, prop = "algorithm.name") => new TypeError(`CryptoKey does not support this operation, its ${prop} must be ${name}`), "unusable");
var isAlgorithm = /* @__PURE__ */ __name((algorithm, name) => algorithm.name === name, "isAlgorithm");
function getHashLength(hash) {
  return parseInt(hash.name.slice(4), 10);
}
__name(getHashLength, "getHashLength");
function getNamedCurve(alg) {
  switch (alg) {
    case "ES256":
      return "P-256";
    case "ES384":
      return "P-384";
    case "ES512":
      return "P-521";
    default:
      throw new Error("unreachable");
  }
}
__name(getNamedCurve, "getNamedCurve");
function checkUsage(key, usage) {
  if (usage && !key.usages.includes(usage)) {
    throw new TypeError(`CryptoKey does not support this operation, its usages must include ${usage}.`);
  }
}
__name(checkUsage, "checkUsage");
function checkSigCryptoKey(key, alg, usage) {
  switch (alg) {
    case "HS256":
    case "HS384":
    case "HS512": {
      if (!isAlgorithm(key.algorithm, "HMAC"))
        throw unusable("HMAC");
      const expected = parseInt(alg.slice(2), 10);
      const actual = getHashLength(key.algorithm.hash);
      if (actual !== expected)
        throw unusable(`SHA-${expected}`, "algorithm.hash");
      break;
    }
    case "RS256":
    case "RS384":
    case "RS512": {
      if (!isAlgorithm(key.algorithm, "RSASSA-PKCS1-v1_5"))
        throw unusable("RSASSA-PKCS1-v1_5");
      const expected = parseInt(alg.slice(2), 10);
      const actual = getHashLength(key.algorithm.hash);
      if (actual !== expected)
        throw unusable(`SHA-${expected}`, "algorithm.hash");
      break;
    }
    case "PS256":
    case "PS384":
    case "PS512": {
      if (!isAlgorithm(key.algorithm, "RSA-PSS"))
        throw unusable("RSA-PSS");
      const expected = parseInt(alg.slice(2), 10);
      const actual = getHashLength(key.algorithm.hash);
      if (actual !== expected)
        throw unusable(`SHA-${expected}`, "algorithm.hash");
      break;
    }
    case "Ed25519":
    case "EdDSA": {
      if (!isAlgorithm(key.algorithm, "Ed25519"))
        throw unusable("Ed25519");
      break;
    }
    case "ML-DSA-44":
    case "ML-DSA-65":
    case "ML-DSA-87": {
      if (!isAlgorithm(key.algorithm, alg))
        throw unusable(alg);
      break;
    }
    case "ES256":
    case "ES384":
    case "ES512": {
      if (!isAlgorithm(key.algorithm, "ECDSA"))
        throw unusable("ECDSA");
      const expected = getNamedCurve(alg);
      const actual = key.algorithm.namedCurve;
      if (actual !== expected)
        throw unusable(expected, "algorithm.namedCurve");
      break;
    }
    default:
      throw new TypeError("CryptoKey does not support this operation");
  }
  checkUsage(key, usage);
}
__name(checkSigCryptoKey, "checkSigCryptoKey");

// ../node_modules/jose/dist/webapi/lib/invalid_key_input.js
function message(msg, actual, ...types) {
  types = types.filter(Boolean);
  if (types.length > 2) {
    const last = types.pop();
    msg += `one of type ${types.join(", ")}, or ${last}.`;
  } else if (types.length === 2) {
    msg += `one of type ${types[0]} or ${types[1]}.`;
  } else {
    msg += `of type ${types[0]}.`;
  }
  if (actual == null) {
    msg += ` Received ${actual}`;
  } else if (typeof actual === "function" && actual.name) {
    msg += ` Received function ${actual.name}`;
  } else if (typeof actual === "object" && actual != null) {
    if (actual.constructor?.name) {
      msg += ` Received an instance of ${actual.constructor.name}`;
    }
  }
  return msg;
}
__name(message, "message");
var invalidKeyInput = /* @__PURE__ */ __name((actual, ...types) => message("Key must be ", actual, ...types), "invalidKeyInput");
var withAlg = /* @__PURE__ */ __name((alg, actual, ...types) => message(`Key for the ${alg} algorithm must be `, actual, ...types), "withAlg");

// ../node_modules/jose/dist/webapi/lib/is_key_like.js
var isCryptoKey = /* @__PURE__ */ __name((key) => {
  if (key?.[Symbol.toStringTag] === "CryptoKey")
    return true;
  try {
    return key instanceof CryptoKey;
  } catch {
    return false;
  }
}, "isCryptoKey");
var isKeyObject = /* @__PURE__ */ __name((key) => key?.[Symbol.toStringTag] === "KeyObject", "isKeyObject");
var isKeyLike = /* @__PURE__ */ __name((key) => isCryptoKey(key) || isKeyObject(key), "isKeyLike");

// ../node_modules/jose/dist/webapi/lib/is_disjoint.js
function isDisjoint(...headers) {
  const sources = headers.filter(Boolean);
  if (sources.length === 0 || sources.length === 1) {
    return true;
  }
  let acc;
  for (const header of sources) {
    const parameters = Object.keys(header);
    if (!acc || acc.size === 0) {
      acc = new Set(parameters);
      continue;
    }
    for (const parameter of parameters) {
      if (acc.has(parameter)) {
        return false;
      }
      acc.add(parameter);
    }
  }
  return true;
}
__name(isDisjoint, "isDisjoint");

// ../node_modules/jose/dist/webapi/lib/is_object.js
var isObjectLike = /* @__PURE__ */ __name((value) => typeof value === "object" && value !== null, "isObjectLike");
function isObject(input) {
  if (!isObjectLike(input) || Object.prototype.toString.call(input) !== "[object Object]") {
    return false;
  }
  if (Object.getPrototypeOf(input) === null) {
    return true;
  }
  let proto = input;
  while (Object.getPrototypeOf(proto) !== null) {
    proto = Object.getPrototypeOf(proto);
  }
  return Object.getPrototypeOf(input) === proto;
}
__name(isObject, "isObject");

// ../node_modules/jose/dist/webapi/lib/check_key_length.js
function checkKeyLength(alg, key) {
  if (alg.startsWith("RS") || alg.startsWith("PS")) {
    const { modulusLength } = key.algorithm;
    if (typeof modulusLength !== "number" || modulusLength < 2048) {
      throw new TypeError(`${alg} requires key modulusLength to be 2048 bits or larger`);
    }
  }
}
__name(checkKeyLength, "checkKeyLength");

// ../node_modules/jose/dist/webapi/lib/asn1.js
var bytesEqual = /* @__PURE__ */ __name((a, b) => {
  if (a.byteLength !== b.length)
    return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i])
      return false;
  }
  return true;
}, "bytesEqual");
var createASN1State = /* @__PURE__ */ __name((data) => ({ data, pos: 0 }), "createASN1State");
var parseLength = /* @__PURE__ */ __name((state) => {
  const first = state.data[state.pos++];
  if (first & 128) {
    const lengthOfLen = first & 127;
    let length = 0;
    for (let i = 0; i < lengthOfLen; i++) {
      length = length << 8 | state.data[state.pos++];
    }
    return length;
  }
  return first;
}, "parseLength");
var expectTag = /* @__PURE__ */ __name((state, expectedTag, errorMessage) => {
  if (state.data[state.pos++] !== expectedTag) {
    throw new Error(errorMessage);
  }
}, "expectTag");
var getSubarray = /* @__PURE__ */ __name((state, length) => {
  const result = state.data.subarray(state.pos, state.pos + length);
  state.pos += length;
  return result;
}, "getSubarray");
var parseAlgorithmOID = /* @__PURE__ */ __name((state) => {
  expectTag(state, 6, "Expected algorithm OID");
  const oidLen = parseLength(state);
  return getSubarray(state, oidLen);
}, "parseAlgorithmOID");
function parsePKCS8Header(state) {
  expectTag(state, 48, "Invalid PKCS#8 structure");
  parseLength(state);
  expectTag(state, 2, "Expected version field");
  const verLen = parseLength(state);
  state.pos += verLen;
  expectTag(state, 48, "Expected algorithm identifier");
  const algIdLen = parseLength(state);
  const algIdStart = state.pos;
  return { algIdStart, algIdLength: algIdLen };
}
__name(parsePKCS8Header, "parsePKCS8Header");
var parseECAlgorithmIdentifier = /* @__PURE__ */ __name((state) => {
  const algOid = parseAlgorithmOID(state);
  if (bytesEqual(algOid, [43, 101, 110])) {
    return "X25519";
  }
  if (!bytesEqual(algOid, [42, 134, 72, 206, 61, 2, 1])) {
    throw new Error("Unsupported key algorithm");
  }
  expectTag(state, 6, "Expected curve OID");
  const curveOidLen = parseLength(state);
  const curveOid = getSubarray(state, curveOidLen);
  for (const { name, oid } of [
    { name: "P-256", oid: [42, 134, 72, 206, 61, 3, 1, 7] },
    { name: "P-384", oid: [43, 129, 4, 0, 34] },
    { name: "P-521", oid: [43, 129, 4, 0, 35] }
  ]) {
    if (bytesEqual(curveOid, oid)) {
      return name;
    }
  }
  throw new Error("Unsupported named curve");
}, "parseECAlgorithmIdentifier");
var genericImport = /* @__PURE__ */ __name(async (keyFormat, keyData, alg, options) => {
  let algorithm;
  let keyUsages;
  const isPublic = keyFormat === "spki";
  const getSigUsages = /* @__PURE__ */ __name(() => isPublic ? ["verify"] : ["sign"], "getSigUsages");
  const getEncUsages = /* @__PURE__ */ __name(() => isPublic ? ["encrypt", "wrapKey"] : ["decrypt", "unwrapKey"], "getEncUsages");
  switch (alg) {
    case "PS256":
    case "PS384":
    case "PS512":
      algorithm = { name: "RSA-PSS", hash: `SHA-${alg.slice(-3)}` };
      keyUsages = getSigUsages();
      break;
    case "RS256":
    case "RS384":
    case "RS512":
      algorithm = { name: "RSASSA-PKCS1-v1_5", hash: `SHA-${alg.slice(-3)}` };
      keyUsages = getSigUsages();
      break;
    case "RSA-OAEP":
    case "RSA-OAEP-256":
    case "RSA-OAEP-384":
    case "RSA-OAEP-512":
      algorithm = {
        name: "RSA-OAEP",
        hash: `SHA-${parseInt(alg.slice(-3), 10) || 1}`
      };
      keyUsages = getEncUsages();
      break;
    case "ES256":
    case "ES384":
    case "ES512": {
      const curveMap = { ES256: "P-256", ES384: "P-384", ES512: "P-521" };
      algorithm = { name: "ECDSA", namedCurve: curveMap[alg] };
      keyUsages = getSigUsages();
      break;
    }
    case "ECDH-ES":
    case "ECDH-ES+A128KW":
    case "ECDH-ES+A192KW":
    case "ECDH-ES+A256KW": {
      try {
        const namedCurve = options.getNamedCurve(keyData);
        algorithm = namedCurve === "X25519" ? { name: "X25519" } : { name: "ECDH", namedCurve };
      } catch (cause) {
        throw new JOSENotSupported("Invalid or unsupported key format");
      }
      keyUsages = isPublic ? [] : ["deriveBits"];
      break;
    }
    case "Ed25519":
    case "EdDSA":
      algorithm = { name: "Ed25519" };
      keyUsages = getSigUsages();
      break;
    case "ML-DSA-44":
    case "ML-DSA-65":
    case "ML-DSA-87":
      algorithm = { name: alg };
      keyUsages = getSigUsages();
      break;
    default:
      throw new JOSENotSupported('Invalid or unsupported "alg" (Algorithm) value');
  }
  return crypto.subtle.importKey(keyFormat, keyData, algorithm, options?.extractable ?? (isPublic ? true : false), keyUsages);
}, "genericImport");
var processPEMData = /* @__PURE__ */ __name((pem, pattern) => {
  return decodeBase64(pem.replace(pattern, ""));
}, "processPEMData");
var fromPKCS8 = /* @__PURE__ */ __name((pem, alg, options) => {
  const keyData = processPEMData(pem, /(?:-----(?:BEGIN|END) PRIVATE KEY-----|\s)/g);
  let opts = options;
  if (alg?.startsWith?.("ECDH-ES")) {
    opts ||= {};
    opts.getNamedCurve = (keyData2) => {
      const state = createASN1State(keyData2);
      parsePKCS8Header(state);
      return parseECAlgorithmIdentifier(state);
    };
  }
  return genericImport("pkcs8", keyData, alg, opts);
}, "fromPKCS8");

// ../node_modules/jose/dist/webapi/lib/jwk_to_key.js
function subtleMapping(jwk) {
  let algorithm;
  let keyUsages;
  switch (jwk.kty) {
    case "AKP": {
      switch (jwk.alg) {
        case "ML-DSA-44":
        case "ML-DSA-65":
        case "ML-DSA-87":
          algorithm = { name: jwk.alg };
          keyUsages = jwk.priv ? ["sign"] : ["verify"];
          break;
        default:
          throw new JOSENotSupported('Invalid or unsupported JWK "alg" (Algorithm) Parameter value');
      }
      break;
    }
    case "RSA": {
      switch (jwk.alg) {
        case "PS256":
        case "PS384":
        case "PS512":
          algorithm = { name: "RSA-PSS", hash: `SHA-${jwk.alg.slice(-3)}` };
          keyUsages = jwk.d ? ["sign"] : ["verify"];
          break;
        case "RS256":
        case "RS384":
        case "RS512":
          algorithm = { name: "RSASSA-PKCS1-v1_5", hash: `SHA-${jwk.alg.slice(-3)}` };
          keyUsages = jwk.d ? ["sign"] : ["verify"];
          break;
        case "RSA-OAEP":
        case "RSA-OAEP-256":
        case "RSA-OAEP-384":
        case "RSA-OAEP-512":
          algorithm = {
            name: "RSA-OAEP",
            hash: `SHA-${parseInt(jwk.alg.slice(-3), 10) || 1}`
          };
          keyUsages = jwk.d ? ["decrypt", "unwrapKey"] : ["encrypt", "wrapKey"];
          break;
        default:
          throw new JOSENotSupported('Invalid or unsupported JWK "alg" (Algorithm) Parameter value');
      }
      break;
    }
    case "EC": {
      switch (jwk.alg) {
        case "ES256":
          algorithm = { name: "ECDSA", namedCurve: "P-256" };
          keyUsages = jwk.d ? ["sign"] : ["verify"];
          break;
        case "ES384":
          algorithm = { name: "ECDSA", namedCurve: "P-384" };
          keyUsages = jwk.d ? ["sign"] : ["verify"];
          break;
        case "ES512":
          algorithm = { name: "ECDSA", namedCurve: "P-521" };
          keyUsages = jwk.d ? ["sign"] : ["verify"];
          break;
        case "ECDH-ES":
        case "ECDH-ES+A128KW":
        case "ECDH-ES+A192KW":
        case "ECDH-ES+A256KW":
          algorithm = { name: "ECDH", namedCurve: jwk.crv };
          keyUsages = jwk.d ? ["deriveBits"] : [];
          break;
        default:
          throw new JOSENotSupported('Invalid or unsupported JWK "alg" (Algorithm) Parameter value');
      }
      break;
    }
    case "OKP": {
      switch (jwk.alg) {
        case "Ed25519":
        case "EdDSA":
          algorithm = { name: "Ed25519" };
          keyUsages = jwk.d ? ["sign"] : ["verify"];
          break;
        case "ECDH-ES":
        case "ECDH-ES+A128KW":
        case "ECDH-ES+A192KW":
        case "ECDH-ES+A256KW":
          algorithm = { name: jwk.crv };
          keyUsages = jwk.d ? ["deriveBits"] : [];
          break;
        default:
          throw new JOSENotSupported('Invalid or unsupported JWK "alg" (Algorithm) Parameter value');
      }
      break;
    }
    default:
      throw new JOSENotSupported('Invalid or unsupported JWK "kty" (Key Type) Parameter value');
  }
  return { algorithm, keyUsages };
}
__name(subtleMapping, "subtleMapping");
async function jwkToKey(jwk) {
  if (!jwk.alg) {
    throw new TypeError('"alg" argument is required when "jwk.alg" is not present');
  }
  const { algorithm, keyUsages } = subtleMapping(jwk);
  const keyData = { ...jwk };
  if (keyData.kty !== "AKP") {
    delete keyData.alg;
  }
  delete keyData.use;
  return crypto.subtle.importKey("jwk", keyData, algorithm, jwk.ext ?? (jwk.d || jwk.priv ? false : true), jwk.key_ops ?? keyUsages);
}
__name(jwkToKey, "jwkToKey");

// ../node_modules/jose/dist/webapi/key/import.js
async function importPKCS8(pkcs8, alg, options) {
  if (typeof pkcs8 !== "string" || pkcs8.indexOf("-----BEGIN PRIVATE KEY-----") !== 0) {
    throw new TypeError('"pkcs8" must be PKCS#8 formatted string');
  }
  return fromPKCS8(pkcs8, alg, options);
}
__name(importPKCS8, "importPKCS8");

// ../node_modules/jose/dist/webapi/lib/validate_crit.js
function validateCrit(Err, recognizedDefault, recognizedOption, protectedHeader, joseHeader) {
  if (joseHeader.crit !== void 0 && protectedHeader?.crit === void 0) {
    throw new Err('"crit" (Critical) Header Parameter MUST be integrity protected');
  }
  if (!protectedHeader || protectedHeader.crit === void 0) {
    return /* @__PURE__ */ new Set();
  }
  if (!Array.isArray(protectedHeader.crit) || protectedHeader.crit.length === 0 || protectedHeader.crit.some((input) => typeof input !== "string" || input.length === 0)) {
    throw new Err('"crit" (Critical) Header Parameter MUST be an array of non-empty strings when present');
  }
  let recognized;
  if (recognizedOption !== void 0) {
    recognized = new Map([...Object.entries(recognizedOption), ...recognizedDefault.entries()]);
  } else {
    recognized = recognizedDefault;
  }
  for (const parameter of protectedHeader.crit) {
    if (!recognized.has(parameter)) {
      throw new JOSENotSupported(`Extension Header Parameter "${parameter}" is not recognized`);
    }
    if (joseHeader[parameter] === void 0) {
      throw new Err(`Extension Header Parameter "${parameter}" is missing`);
    }
    if (recognized.get(parameter) && protectedHeader[parameter] === void 0) {
      throw new Err(`Extension Header Parameter "${parameter}" MUST be integrity protected`);
    }
  }
  return new Set(protectedHeader.crit);
}
__name(validateCrit, "validateCrit");

// ../node_modules/jose/dist/webapi/lib/is_jwk.js
var isJWK = /* @__PURE__ */ __name((key) => isObject(key) && typeof key.kty === "string", "isJWK");
var isPrivateJWK = /* @__PURE__ */ __name((key) => key.kty !== "oct" && (key.kty === "AKP" && typeof key.priv === "string" || typeof key.d === "string"), "isPrivateJWK");
var isPublicJWK = /* @__PURE__ */ __name((key) => key.kty !== "oct" && key.d === void 0 && key.priv === void 0, "isPublicJWK");
var isSecretJWK = /* @__PURE__ */ __name((key) => key.kty === "oct" && typeof key.k === "string", "isSecretJWK");

// ../node_modules/jose/dist/webapi/lib/normalize_key.js
var cache;
var handleJWK = /* @__PURE__ */ __name(async (key, jwk, alg, freeze = false) => {
  cache ||= /* @__PURE__ */ new WeakMap();
  let cached2 = cache.get(key);
  if (cached2?.[alg]) {
    return cached2[alg];
  }
  const cryptoKey = await jwkToKey({ ...jwk, alg });
  if (freeze)
    Object.freeze(key);
  if (!cached2) {
    cache.set(key, { [alg]: cryptoKey });
  } else {
    cached2[alg] = cryptoKey;
  }
  return cryptoKey;
}, "handleJWK");
var handleKeyObject = /* @__PURE__ */ __name((keyObject, alg) => {
  cache ||= /* @__PURE__ */ new WeakMap();
  let cached2 = cache.get(keyObject);
  if (cached2?.[alg]) {
    return cached2[alg];
  }
  const isPublic = keyObject.type === "public";
  const extractable = isPublic ? true : false;
  let cryptoKey;
  if (keyObject.asymmetricKeyType === "x25519") {
    switch (alg) {
      case "ECDH-ES":
      case "ECDH-ES+A128KW":
      case "ECDH-ES+A192KW":
      case "ECDH-ES+A256KW":
        break;
      default:
        throw new TypeError("given KeyObject instance cannot be used for this algorithm");
    }
    cryptoKey = keyObject.toCryptoKey(keyObject.asymmetricKeyType, extractable, isPublic ? [] : ["deriveBits"]);
  }
  if (keyObject.asymmetricKeyType === "ed25519") {
    if (alg !== "EdDSA" && alg !== "Ed25519") {
      throw new TypeError("given KeyObject instance cannot be used for this algorithm");
    }
    cryptoKey = keyObject.toCryptoKey(keyObject.asymmetricKeyType, extractable, [
      isPublic ? "verify" : "sign"
    ]);
  }
  switch (keyObject.asymmetricKeyType) {
    case "ml-dsa-44":
    case "ml-dsa-65":
    case "ml-dsa-87": {
      if (alg !== keyObject.asymmetricKeyType.toUpperCase()) {
        throw new TypeError("given KeyObject instance cannot be used for this algorithm");
      }
      cryptoKey = keyObject.toCryptoKey(keyObject.asymmetricKeyType, extractable, [
        isPublic ? "verify" : "sign"
      ]);
    }
  }
  if (keyObject.asymmetricKeyType === "rsa") {
    let hash;
    switch (alg) {
      case "RSA-OAEP":
        hash = "SHA-1";
        break;
      case "RS256":
      case "PS256":
      case "RSA-OAEP-256":
        hash = "SHA-256";
        break;
      case "RS384":
      case "PS384":
      case "RSA-OAEP-384":
        hash = "SHA-384";
        break;
      case "RS512":
      case "PS512":
      case "RSA-OAEP-512":
        hash = "SHA-512";
        break;
      default:
        throw new TypeError("given KeyObject instance cannot be used for this algorithm");
    }
    if (alg.startsWith("RSA-OAEP")) {
      return keyObject.toCryptoKey({
        name: "RSA-OAEP",
        hash
      }, extractable, isPublic ? ["encrypt"] : ["decrypt"]);
    }
    cryptoKey = keyObject.toCryptoKey({
      name: alg.startsWith("PS") ? "RSA-PSS" : "RSASSA-PKCS1-v1_5",
      hash
    }, extractable, [isPublic ? "verify" : "sign"]);
  }
  if (keyObject.asymmetricKeyType === "ec") {
    const nist = /* @__PURE__ */ new Map([
      ["prime256v1", "P-256"],
      ["secp384r1", "P-384"],
      ["secp521r1", "P-521"]
    ]);
    const namedCurve = nist.get(keyObject.asymmetricKeyDetails?.namedCurve);
    if (!namedCurve) {
      throw new TypeError("given KeyObject instance cannot be used for this algorithm");
    }
    if (alg === "ES256" && namedCurve === "P-256") {
      cryptoKey = keyObject.toCryptoKey({
        name: "ECDSA",
        namedCurve
      }, extractable, [isPublic ? "verify" : "sign"]);
    }
    if (alg === "ES384" && namedCurve === "P-384") {
      cryptoKey = keyObject.toCryptoKey({
        name: "ECDSA",
        namedCurve
      }, extractable, [isPublic ? "verify" : "sign"]);
    }
    if (alg === "ES512" && namedCurve === "P-521") {
      cryptoKey = keyObject.toCryptoKey({
        name: "ECDSA",
        namedCurve
      }, extractable, [isPublic ? "verify" : "sign"]);
    }
    if (alg.startsWith("ECDH-ES")) {
      cryptoKey = keyObject.toCryptoKey({
        name: "ECDH",
        namedCurve
      }, extractable, isPublic ? [] : ["deriveBits"]);
    }
  }
  if (!cryptoKey) {
    throw new TypeError("given KeyObject instance cannot be used for this algorithm");
  }
  if (!cached2) {
    cache.set(keyObject, { [alg]: cryptoKey });
  } else {
    cached2[alg] = cryptoKey;
  }
  return cryptoKey;
}, "handleKeyObject");
async function normalizeKey(key, alg) {
  if (key instanceof Uint8Array) {
    return key;
  }
  if (isCryptoKey(key)) {
    return key;
  }
  if (isKeyObject(key)) {
    if (key.type === "secret") {
      return key.export();
    }
    if ("toCryptoKey" in key && typeof key.toCryptoKey === "function") {
      try {
        return handleKeyObject(key, alg);
      } catch (err) {
        if (err instanceof TypeError) {
          throw err;
        }
      }
    }
    let jwk = key.export({ format: "jwk" });
    return handleJWK(key, jwk, alg);
  }
  if (isJWK(key)) {
    if (key.k) {
      return decode(key.k);
    }
    return handleJWK(key, key, alg, true);
  }
  throw new Error("unreachable");
}
__name(normalizeKey, "normalizeKey");

// ../node_modules/jose/dist/webapi/lib/check_key_type.js
var tag = /* @__PURE__ */ __name((key) => key?.[Symbol.toStringTag], "tag");
var jwkMatchesOp = /* @__PURE__ */ __name((alg, key, usage) => {
  if (key.use !== void 0) {
    let expected;
    switch (usage) {
      case "sign":
      case "verify":
        expected = "sig";
        break;
      case "encrypt":
      case "decrypt":
        expected = "enc";
        break;
    }
    if (key.use !== expected) {
      throw new TypeError(`Invalid key for this operation, its "use" must be "${expected}" when present`);
    }
  }
  if (key.alg !== void 0 && key.alg !== alg) {
    throw new TypeError(`Invalid key for this operation, its "alg" must be "${alg}" when present`);
  }
  if (Array.isArray(key.key_ops)) {
    let expectedKeyOp;
    switch (true) {
      case (usage === "sign" || usage === "verify"):
      case alg === "dir":
      case alg.includes("CBC-HS"):
        expectedKeyOp = usage;
        break;
      case alg.startsWith("PBES2"):
        expectedKeyOp = "deriveBits";
        break;
      case /^A\d{3}(?:GCM)?(?:KW)?$/.test(alg):
        if (!alg.includes("GCM") && alg.endsWith("KW")) {
          expectedKeyOp = usage === "encrypt" ? "wrapKey" : "unwrapKey";
        } else {
          expectedKeyOp = usage;
        }
        break;
      case (usage === "encrypt" && alg.startsWith("RSA")):
        expectedKeyOp = "wrapKey";
        break;
      case usage === "decrypt":
        expectedKeyOp = alg.startsWith("RSA") ? "unwrapKey" : "deriveBits";
        break;
    }
    if (expectedKeyOp && key.key_ops?.includes?.(expectedKeyOp) === false) {
      throw new TypeError(`Invalid key for this operation, its "key_ops" must include "${expectedKeyOp}" when present`);
    }
  }
  return true;
}, "jwkMatchesOp");
var symmetricTypeCheck = /* @__PURE__ */ __name((alg, key, usage) => {
  if (key instanceof Uint8Array)
    return;
  if (isJWK(key)) {
    if (isSecretJWK(key) && jwkMatchesOp(alg, key, usage))
      return;
    throw new TypeError(`JSON Web Key for symmetric algorithms must have JWK "kty" (Key Type) equal to "oct" and the JWK "k" (Key Value) present`);
  }
  if (!isKeyLike(key)) {
    throw new TypeError(withAlg(alg, key, "CryptoKey", "KeyObject", "JSON Web Key", "Uint8Array"));
  }
  if (key.type !== "secret") {
    throw new TypeError(`${tag(key)} instances for symmetric algorithms must be of type "secret"`);
  }
}, "symmetricTypeCheck");
var asymmetricTypeCheck = /* @__PURE__ */ __name((alg, key, usage) => {
  if (isJWK(key)) {
    switch (usage) {
      case "decrypt":
      case "sign":
        if (isPrivateJWK(key) && jwkMatchesOp(alg, key, usage))
          return;
        throw new TypeError(`JSON Web Key for this operation must be a private JWK`);
      case "encrypt":
      case "verify":
        if (isPublicJWK(key) && jwkMatchesOp(alg, key, usage))
          return;
        throw new TypeError(`JSON Web Key for this operation must be a public JWK`);
    }
  }
  if (!isKeyLike(key)) {
    throw new TypeError(withAlg(alg, key, "CryptoKey", "KeyObject", "JSON Web Key"));
  }
  if (key.type === "secret") {
    throw new TypeError(`${tag(key)} instances for asymmetric algorithms must not be of type "secret"`);
  }
  if (key.type === "public") {
    switch (usage) {
      case "sign":
        throw new TypeError(`${tag(key)} instances for asymmetric algorithm signing must be of type "private"`);
      case "decrypt":
        throw new TypeError(`${tag(key)} instances for asymmetric algorithm decryption must be of type "private"`);
    }
  }
  if (key.type === "private") {
    switch (usage) {
      case "verify":
        throw new TypeError(`${tag(key)} instances for asymmetric algorithm verifying must be of type "public"`);
      case "encrypt":
        throw new TypeError(`${tag(key)} instances for asymmetric algorithm encryption must be of type "public"`);
    }
  }
}, "asymmetricTypeCheck");
function checkKeyType(alg, key, usage) {
  switch (alg.substring(0, 2)) {
    case "A1":
    case "A2":
    case "di":
    case "HS":
    case "PB":
      symmetricTypeCheck(alg, key, usage);
      break;
    default:
      asymmetricTypeCheck(alg, key, usage);
  }
}
__name(checkKeyType, "checkKeyType");

// ../node_modules/jose/dist/webapi/lib/subtle_dsa.js
function subtleAlgorithm(alg, algorithm) {
  const hash = `SHA-${alg.slice(-3)}`;
  switch (alg) {
    case "HS256":
    case "HS384":
    case "HS512":
      return { hash, name: "HMAC" };
    case "PS256":
    case "PS384":
    case "PS512":
      return { hash, name: "RSA-PSS", saltLength: parseInt(alg.slice(-3), 10) >> 3 };
    case "RS256":
    case "RS384":
    case "RS512":
      return { hash, name: "RSASSA-PKCS1-v1_5" };
    case "ES256":
    case "ES384":
    case "ES512":
      return { hash, name: "ECDSA", namedCurve: algorithm.namedCurve };
    case "Ed25519":
    case "EdDSA":
      return { name: "Ed25519" };
    case "ML-DSA-44":
    case "ML-DSA-65":
    case "ML-DSA-87":
      return { name: alg };
    default:
      throw new JOSENotSupported(`alg ${alg} is not supported either by JOSE or your javascript runtime`);
  }
}
__name(subtleAlgorithm, "subtleAlgorithm");

// ../node_modules/jose/dist/webapi/lib/get_sign_verify_key.js
async function getSigKey(alg, key, usage) {
  if (key instanceof Uint8Array) {
    if (!alg.startsWith("HS")) {
      throw new TypeError(invalidKeyInput(key, "CryptoKey", "KeyObject", "JSON Web Key"));
    }
    return crypto.subtle.importKey("raw", key, { hash: `SHA-${alg.slice(-3)}`, name: "HMAC" }, false, [usage]);
  }
  checkSigCryptoKey(key, alg, usage);
  return key;
}
__name(getSigKey, "getSigKey");

// ../node_modules/jose/dist/webapi/lib/jwt_claims_set.js
var epoch = /* @__PURE__ */ __name((date) => Math.floor(date.getTime() / 1e3), "epoch");
var minute = 60;
var hour = minute * 60;
var day = hour * 24;
var week = day * 7;
var year = day * 365.25;
var REGEX = /^(\+|\-)? ?(\d+|\d+\.\d+) ?(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)(?: (ago|from now))?$/i;
function secs(str) {
  const matched = REGEX.exec(str);
  if (!matched || matched[4] && matched[1]) {
    throw new TypeError("Invalid time period format");
  }
  const value = parseFloat(matched[2]);
  const unit = matched[3].toLowerCase();
  let numericDate;
  switch (unit) {
    case "sec":
    case "secs":
    case "second":
    case "seconds":
    case "s":
      numericDate = Math.round(value);
      break;
    case "minute":
    case "minutes":
    case "min":
    case "mins":
    case "m":
      numericDate = Math.round(value * minute);
      break;
    case "hour":
    case "hours":
    case "hr":
    case "hrs":
    case "h":
      numericDate = Math.round(value * hour);
      break;
    case "day":
    case "days":
    case "d":
      numericDate = Math.round(value * day);
      break;
    case "week":
    case "weeks":
    case "w":
      numericDate = Math.round(value * week);
      break;
    default:
      numericDate = Math.round(value * year);
      break;
  }
  if (matched[1] === "-" || matched[4] === "ago") {
    return -numericDate;
  }
  return numericDate;
}
__name(secs, "secs");
function validateInput(label, input) {
  if (!Number.isFinite(input)) {
    throw new TypeError(`Invalid ${label} input`);
  }
  return input;
}
__name(validateInput, "validateInput");
var JWTClaimsBuilder = class {
  static {
    __name(this, "JWTClaimsBuilder");
  }
  #payload;
  constructor(payload) {
    if (!isObject(payload)) {
      throw new TypeError("JWT Claims Set MUST be an object");
    }
    this.#payload = structuredClone(payload);
  }
  data() {
    return encoder.encode(JSON.stringify(this.#payload));
  }
  get iss() {
    return this.#payload.iss;
  }
  set iss(value) {
    this.#payload.iss = value;
  }
  get sub() {
    return this.#payload.sub;
  }
  set sub(value) {
    this.#payload.sub = value;
  }
  get aud() {
    return this.#payload.aud;
  }
  set aud(value) {
    this.#payload.aud = value;
  }
  set jti(value) {
    this.#payload.jti = value;
  }
  set nbf(value) {
    if (typeof value === "number") {
      this.#payload.nbf = validateInput("setNotBefore", value);
    } else if (value instanceof Date) {
      this.#payload.nbf = validateInput("setNotBefore", epoch(value));
    } else {
      this.#payload.nbf = epoch(/* @__PURE__ */ new Date()) + secs(value);
    }
  }
  set exp(value) {
    if (typeof value === "number") {
      this.#payload.exp = validateInput("setExpirationTime", value);
    } else if (value instanceof Date) {
      this.#payload.exp = validateInput("setExpirationTime", epoch(value));
    } else {
      this.#payload.exp = epoch(/* @__PURE__ */ new Date()) + secs(value);
    }
  }
  set iat(value) {
    if (value === void 0) {
      this.#payload.iat = epoch(/* @__PURE__ */ new Date());
    } else if (value instanceof Date) {
      this.#payload.iat = validateInput("setIssuedAt", epoch(value));
    } else if (typeof value === "string") {
      this.#payload.iat = validateInput("setIssuedAt", epoch(/* @__PURE__ */ new Date()) + secs(value));
    } else {
      this.#payload.iat = validateInput("setIssuedAt", value);
    }
  }
};

// ../node_modules/jose/dist/webapi/lib/sign.js
async function sign(alg, key, data) {
  const cryptoKey = await getSigKey(alg, key, "sign");
  checkKeyLength(alg, cryptoKey);
  const signature = await crypto.subtle.sign(subtleAlgorithm(alg, cryptoKey.algorithm), cryptoKey, data);
  return new Uint8Array(signature);
}
__name(sign, "sign");

// ../node_modules/jose/dist/webapi/jws/flattened/sign.js
var FlattenedSign = class {
  static {
    __name(this, "FlattenedSign");
  }
  #payload;
  #protectedHeader;
  #unprotectedHeader;
  constructor(payload) {
    if (!(payload instanceof Uint8Array)) {
      throw new TypeError("payload must be an instance of Uint8Array");
    }
    this.#payload = payload;
  }
  setProtectedHeader(protectedHeader) {
    if (this.#protectedHeader) {
      throw new TypeError("setProtectedHeader can only be called once");
    }
    this.#protectedHeader = protectedHeader;
    return this;
  }
  setUnprotectedHeader(unprotectedHeader) {
    if (this.#unprotectedHeader) {
      throw new TypeError("setUnprotectedHeader can only be called once");
    }
    this.#unprotectedHeader = unprotectedHeader;
    return this;
  }
  async sign(key, options) {
    if (!this.#protectedHeader && !this.#unprotectedHeader) {
      throw new JWSInvalid("either setProtectedHeader or setUnprotectedHeader must be called before #sign()");
    }
    if (!isDisjoint(this.#protectedHeader, this.#unprotectedHeader)) {
      throw new JWSInvalid("JWS Protected and JWS Unprotected Header Parameter names must be disjoint");
    }
    const joseHeader = {
      ...this.#protectedHeader,
      ...this.#unprotectedHeader
    };
    const extensions = validateCrit(JWSInvalid, /* @__PURE__ */ new Map([["b64", true]]), options?.crit, this.#protectedHeader, joseHeader);
    let b64 = true;
    if (extensions.has("b64")) {
      b64 = this.#protectedHeader.b64;
      if (typeof b64 !== "boolean") {
        throw new JWSInvalid('The "b64" (base64url-encode payload) Header Parameter must be a boolean');
      }
    }
    const { alg } = joseHeader;
    if (typeof alg !== "string" || !alg) {
      throw new JWSInvalid('JWS "alg" (Algorithm) Header Parameter missing or invalid');
    }
    checkKeyType(alg, key, "sign");
    let payloadS;
    let payloadB;
    if (b64) {
      payloadS = encode2(this.#payload);
      payloadB = encode(payloadS);
    } else {
      payloadB = this.#payload;
      payloadS = "";
    }
    let protectedHeaderString;
    let protectedHeaderBytes;
    if (this.#protectedHeader) {
      protectedHeaderString = encode2(JSON.stringify(this.#protectedHeader));
      protectedHeaderBytes = encode(protectedHeaderString);
    } else {
      protectedHeaderString = "";
      protectedHeaderBytes = new Uint8Array();
    }
    const data = concat(protectedHeaderBytes, encode("."), payloadB);
    const k = await normalizeKey(key, alg);
    const signature = await sign(alg, k, data);
    const jws = {
      signature: encode2(signature),
      payload: payloadS
    };
    if (this.#unprotectedHeader) {
      jws.header = this.#unprotectedHeader;
    }
    if (this.#protectedHeader) {
      jws.protected = protectedHeaderString;
    }
    return jws;
  }
};

// ../node_modules/jose/dist/webapi/jws/compact/sign.js
var CompactSign = class {
  static {
    __name(this, "CompactSign");
  }
  #flattened;
  constructor(payload) {
    this.#flattened = new FlattenedSign(payload);
  }
  setProtectedHeader(protectedHeader) {
    this.#flattened.setProtectedHeader(protectedHeader);
    return this;
  }
  async sign(key, options) {
    const jws = await this.#flattened.sign(key, options);
    if (jws.payload === void 0) {
      throw new TypeError("use the flattened module for creating JWS with b64: false");
    }
    return `${jws.protected}.${jws.payload}.${jws.signature}`;
  }
};

// ../node_modules/jose/dist/webapi/jwt/sign.js
var SignJWT = class {
  static {
    __name(this, "SignJWT");
  }
  #protectedHeader;
  #jwt;
  constructor(payload = {}) {
    this.#jwt = new JWTClaimsBuilder(payload);
  }
  setIssuer(issuer) {
    this.#jwt.iss = issuer;
    return this;
  }
  setSubject(subject) {
    this.#jwt.sub = subject;
    return this;
  }
  setAudience(audience) {
    this.#jwt.aud = audience;
    return this;
  }
  setJti(jwtId) {
    this.#jwt.jti = jwtId;
    return this;
  }
  setNotBefore(input) {
    this.#jwt.nbf = input;
    return this;
  }
  setExpirationTime(input) {
    this.#jwt.exp = input;
    return this;
  }
  setIssuedAt(input) {
    this.#jwt.iat = input;
    return this;
  }
  setProtectedHeader(protectedHeader) {
    this.#protectedHeader = protectedHeader;
    return this;
  }
  async sign(key, options) {
    const sig = new CompactSign(this.#jwt.data());
    sig.setProtectedHeader(this.#protectedHeader);
    if (Array.isArray(this.#protectedHeader?.crit) && this.#protectedHeader.crit.includes("b64") && this.#protectedHeader.b64 === false) {
      throw new JWTInvalid("JWTs MUST NOT use unencoded payload");
    }
    return sig.sign(key, options);
  }
};

// src/lib/fcm.ts
var cached = null;
var nowSec = /* @__PURE__ */ __name(() => Math.floor(Date.now() / 1e3), "nowSec");
async function getFcmAccessToken(env) {
  if (cached && Date.now() < cached.expMs - 6e4) return cached.token;
  const sa = JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON);
  const clientEmail = sa.client_email;
  const privateKeyPem = sa.private_key;
  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
  const iat = nowSec();
  const exp = iat + 3600;
  const pk = await importPKCS8(privateKeyPem, "RS256");
  const jwt = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" }).setProtectedHeader({ alg: "RS256", typ: "JWT" }).setIssuer(clientEmail).setSubject(clientEmail).setAudience(tokenUri).setIssuedAt(iat).setExpirationTime(exp).sign(pk);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt
  });
  const resp = await fetch(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  if (!resp.ok) throw new Error(`FCM token exchange failed: ${resp.status} ${await resp.text()}`);
  const json2 = await resp.json();
  cached = { token: json2.access_token, expMs: Date.now() + json2.expires_in * 1e3 };
  return json2.access_token;
}
__name(getFcmAccessToken, "getFcmAccessToken");
async function fcmSend(env, message2) {
  const accessToken = await getFcmAccessToken(env);
  const url = `https://fcm.googleapis.com/v1/projects/${env.FCM_PROJECT_ID}/messages:send`;
  return fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ message: message2 })
  });
}
__name(fcmSend, "fcmSend");

// src/services/notifications.ts
var nowIso = /* @__PURE__ */ __name(() => (/* @__PURE__ */ new Date()).toISOString(), "nowIso");
async function registerPushToken(db, ownerId, platform, fcmToken) {
  const ts = nowIso();
  await db.prepare(
    `
      insert into push_tokens (owner_id, platform, fcm_token, is_active, last_seen_at, created_at, updated_at)
      values (?, ?, ?, 1, ?, ?, ?)
      on conflict(fcm_token) do update set
        owner_id = excluded.owner_id,
        platform = excluded.platform,
        is_active = 1,
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at
      `
  ).bind(ownerId, platform, fcmToken, ts, ts, ts).run();
}
__name(registerPushToken, "registerPushToken");
async function unregisterPushToken(db, fcmToken) {
  const ts = nowIso();
  await db.prepare(
    `
      update push_tokens set is_active = 0, updated_at = ?
      where fcm_token = ?
      `
  ).bind(ts, fcmToken).run();
}
__name(unregisterPushToken, "unregisterPushToken");
async function listActivePushTokens(db, ownerId) {
  const { results } = await db.prepare(
    `
      select fcm_token, platform
      from push_tokens
      where owner_id = ? and is_active = 1
      `
  ).bind(ownerId).all();
  return results ?? [];
}
__name(listActivePushTokens, "listActivePushTokens");
async function notifyPostLike(args) {
  await notifyAggregated({
    ...args,
    type: "post_like",
    groupKey: `post_like:${args.recipientId}:${args.postId}`,
    postId: args.postId
  });
}
__name(notifyPostLike, "notifyPostLike");
async function notifyCommentLike(args) {
  await notifyAggregated({
    ...args,
    type: "comment_like",
    groupKey: `comment_like:${args.recipientId}:${args.commentId}`,
    postId: args.postId,
    commentId: args.commentId
  });
}
__name(notifyCommentLike, "notifyCommentLike");
async function notifyPostComment(args) {
  await notifySingle({
    ...args,
    type: "post_comment",
    postId: args.postId
  });
}
__name(notifyPostComment, "notifyPostComment");
async function notifyCommentReply(args) {
  await notifySingle({
    ...args,
    type: "comment_reply",
    postId: args.postId,
    commentId: args.commentId
  });
}
__name(notifyCommentReply, "notifyCommentReply");
async function notifyFriendRequest(args) {
  await notifySingle({
    ...args,
    type: "friend_request",
    friendshipId: args.friendshipId
  });
}
__name(notifyFriendRequest, "notifyFriendRequest");
async function notifyAggregated(args) {
  const { db } = args;
  const ts = nowIso();
  const id = crypto.randomUUID();
  await db.prepare(
    `
      insert into notifications (
        id, type, recipient_owner_id, actor_count,
        latest_actor_owner_id, latest_action_at,
        post_id, comment_id, friendship_id,
        group_key, is_read, read_at, is_hidden, hidden_at,
        created_at, updated_at
      )
      values (?, ?, ?, 0, ?, ?, ?, ?, null, ?, 0, null, 0, null, ?, ?)
      on conflict(group_key) do update set
        latest_actor_owner_id = excluded.latest_actor_owner_id,
        latest_action_at = excluded.latest_action_at,
        is_read = 0,
        read_at = null,
        is_hidden = 0,
        hidden_at = null,
        updated_at = excluded.updated_at
      `
  ).bind(
    id,
    args.type,
    args.recipientId,
    args.actorId,
    ts,
    args.postId ?? null,
    args.commentId ?? null,
    args.groupKey,
    ts,
    ts
  ).run();
  const notifRow = await db.prepare(`select id from notifications where group_key = ?`).bind(args.groupKey).first();
  const notificationId = notifRow?.id ?? id;
  await db.prepare(
    `
      insert into notification_actors (notification_id, actor_owner_id, first_action_at, last_action_at)
      values (?, ?, ?, ?)
      on conflict(notification_id, actor_owner_id) do update set
        last_action_at = excluded.last_action_at
      `
  ).bind(notificationId, args.actorId, ts, ts).run();
  await db.prepare(
    `
      update notifications
      set actor_count = (select count(*) from notification_actors where notification_id = ?)
      where id = ?
      `
  ).bind(notificationId, notificationId).run();
  const row = await db.prepare(
    `
      select id, type, recipient_owner_id, actor_count, latest_actor_owner_id, latest_action_at, post_id, comment_id, friendship_id, created_at
      from notifications where id = ?
      `
  ).bind(notificationId).first();
  if (!row) return;
  await pushNotification(args.env, db, row);
}
__name(notifyAggregated, "notifyAggregated");
async function notifySingle(args) {
  const { db } = args;
  const ts = nowIso();
  const id = crypto.randomUUID();
  await db.prepare(
    `
      insert into notifications (
        id, type, recipient_owner_id, actor_count,
        latest_actor_owner_id, latest_action_at,
        post_id, comment_id, friendship_id,
        group_key, is_read, read_at, is_hidden, hidden_at,
        created_at, updated_at
      )
      values (?, ?, ?, 1, ?, ?, ?, ?, ?, null, 0, null, 0, null, ?, ?)
      `
  ).bind(
    id,
    args.type,
    args.recipientId,
    args.actorId,
    ts,
    args.postId ?? null,
    args.commentId ?? null,
    args.friendshipId ?? null,
    ts,
    ts
  ).run();
  await db.prepare(
    `
      insert into notification_actors (notification_id, actor_owner_id, first_action_at, last_action_at)
      values (?, ?, ?, ?)
      `
  ).bind(id, args.actorId, ts, ts).run();
  const row = {
    id,
    type: args.type,
    recipient_owner_id: args.recipientId,
    actor_count: 1,
    latest_actor_owner_id: args.actorId,
    latest_action_at: ts,
    post_id: args.postId ?? null,
    comment_id: args.commentId ?? null,
    friendship_id: args.friendshipId ?? null,
    created_at: ts
  };
  await pushNotification(args.env, db, row);
}
__name(notifySingle, "notifySingle");
async function pushNotification(env, db, notif) {
  try {
    const fcmEnv = requireFcmEnv(env);
    const tokens = await listActivePushTokens(db, notif.recipient_owner_id);
    if (tokens.length === 0) return;
    const actors = await listTopActors(db, notif.id, 3);
    const body = buildNotificationBody(notif.type, actors, notif.actor_count);
    const data = {
      notif_id: notif.id,
      type: notif.type,
      post_id: notif.post_id ?? "",
      comment_id: notif.comment_id ?? "",
      friendship_id: notif.friendship_id ? String(notif.friendship_id) : ""
    };
    for (const tokenRow of tokens) {
      const message2 = {
        token: tokenRow.fcm_token,
        notification: {
          title: "Rubypets",
          body
        },
        data
      };
      let resp = null;
      let text = "";
      try {
        resp = await fcmSend(fcmEnv, message2);
        text = await resp.text();
      } catch (err) {
        console.error("FCM send failed", err);
        continue;
      }
      if (!resp.ok) {
        const shouldDisable = resp.status === 404 || text.includes("UNREGISTERED");
        if (shouldDisable) {
          await unregisterPushToken(db, tokenRow.fcm_token);
        }
        console.warn("FCM response not ok", resp.status, text);
      }
    }
  } catch (err) {
    console.error("pushNotification failed", err);
  }
}
__name(pushNotification, "pushNotification");
function requireFcmEnv(env) {
  if (!env.FCM_SERVICE_ACCOUNT_JSON || !env.FCM_PROJECT_ID) {
    throw new Error("FCM not configured");
  }
  return {
    FCM_SERVICE_ACCOUNT_JSON: env.FCM_SERVICE_ACCOUNT_JSON,
    FCM_PROJECT_ID: env.FCM_PROJECT_ID
  };
}
__name(requireFcmEnv, "requireFcmEnv");
async function listTopActors(db, notificationId, limit) {
  const { results } = await db.prepare(
    `
      select na.actor_owner_id, o.display_name
      from notification_actors na
      join owners o on o.uuid = na.actor_owner_id
      where na.notification_id = ?
      order by na.last_action_at desc
      limit ?
      `
  ).bind(notificationId, limit).all();
  return (results ?? []).map((row) => row.display_name || row.actor_owner_id);
}
__name(listTopActors, "listTopActors");
function buildNotificationBody(type, actors, actorCount) {
  const nameA = actors[0] || "Someone";
  const nameB = actors[1] || "Someone";
  switch (type) {
    case "post_like":
      return buildAggregatedBody(nameA, nameB, actorCount, "liked your post");
    case "comment_like":
      return buildAggregatedBody(nameA, nameB, actorCount, "liked your comment");
    case "post_comment":
      return `${nameA} commented on your post`;
    case "comment_reply":
      return `${nameA} replied to your comment`;
    case "friend_request":
      return `${nameA} sent you a friend request`;
    default:
      return "You have a new notification";
  }
}
__name(buildNotificationBody, "buildNotificationBody");
function buildAggregatedBody(nameA, nameB, count, action) {
  if (count <= 1) return `${nameA} ${action}`;
  if (count === 2) return `${nameA} and ${nameB} ${action}`;
  const others = Math.max(0, count - 2);
  return `${nameA}, ${nameB}, and ${others} others ${action}`;
}
__name(buildAggregatedBody, "buildAggregatedBody");

// src/api/routes/shared.ts
async function requireAuthOwner(ctx) {
  const me = await getUserFromAuthHeader(ctx.db, ctx.request);
  if (!me) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  return me;
}
__name(requireAuthOwner, "requireAuthOwner");

// src/api/routes/posts.ts
async function postsListRoute(ctx) {
  const url = new URL(ctx.request.url);
  const limit = asNumber(url.searchParams.get("limit"), 20);
  const userId = url.searchParams.get("userId");
  const currentUser = await getUserFromAuthHeader(ctx.db, ctx.request).catch(() => null);
  const posts = userId ? await getPostsByOwner(ctx.db, userId, limit, currentUser?.uuid) : await listRecentPosts(ctx.db, limit, currentUser?.uuid);
  return okJson(posts, 200);
}
__name(postsListRoute, "postsListRoute");
async function createPostRoute(ctx) {
  const payload = await ctx.request.json();
  const content = (payload.content ?? "").trim();
  if (!content) {
    return errorJson("content is required", 400);
  }
  const postType = (payload.post_type ?? "text").trim();
  if (!["text", "image_set", "video"].includes(postType)) {
    return errorJson("invalid post_type", 400);
  }
  const visibility = (payload.visibility ?? "public").trim();
  if (!["public", "friends", "private"].includes(visibility)) {
    return errorJson("invalid visibility", 400);
  }
  const user = await requireAuthOwner(ctx);
  const authorId = user.uuid;
  const post = await createPost(ctx.db, {
    authorId,
    content,
    visibility,
    postType
  });
  return okJson(post, 201);
}
__name(createPostRoute, "createPostRoute");
async function repostRoute(ctx, params) {
  const user = await requireAuthOwner(ctx);
  const origin = await ctx.db.getPostById(params.id);
  if (!origin) return errorJson("post not found", 404);
  if (origin.isDeleted === 1) return errorJson("origin post deleted", 409);
  if ((origin.visibility ?? "public") !== "public") return errorJson("forbidden", 403);
  const payload = await ctx.request.json().catch(() => ({}));
  const visibility = (payload.visibility ?? "public").trim();
  if (!["public", "friends", "private"].includes(visibility)) {
    return errorJson("invalid visibility", 400);
  }
  const rawContent = typeof payload.content === "string" ? payload.content : "";
  const trimmed = rawContent.trim();
  const content = trimmed ? trimmed : null;
  const repost = await ctx.db.createPost({
    authorId: user.uuid,
    body: content,
    visibility,
    postType: "text",
    mediaCount: 0,
    originPostId: origin.id
  });
  const repostCount = await ctx.db.updateRepostCount(origin.id);
  const repostWithAuthor = await ctx.db.getPostById(repost.id) ?? repost;
  return okJson(
    {
      post: { ...repostWithAuthor, originPost: origin },
      origin: { id: origin.id, repost_count: repostCount }
    },
    201
  );
}
__name(repostRoute, "repostRoute");
async function attachMediaRoute(ctx, params) {
  try {
    const postId = params.id;
    const user = await requireAuthOwner(ctx);
    const body = await ctx.request.json().catch(() => ({}));
    const postType = body.post_type;
    const assetIds = body.asset_ids ?? [];
    if (!postType || !["image_set", "video"].includes(postType)) return errorJson("invalid post_type", 400);
    if (assetIds.length === 0) return errorJson("asset_ids required", 400);
    const post = await ctx.db.getPostById(postId);
    if (!post) return errorJson("post not found", 404);
    if (post.authorId !== user.uuid) return errorJson("forbidden", 403);
    const assets = await ctx.db.getMediaAssetsByIds(assetIds);
    if (assets.length !== assetIds.length) return errorJson("asset not found", 404);
    for (const a of assets) {
      if (a.ownerId !== user.uuid) return errorJson("forbidden asset", 403);
      if (a.usage !== "post") return errorJson("asset usage must be post", 400);
      if (postType === "image_set" && a.kind !== "image") return errorJson("only images allowed", 400);
      if (postType === "video" && a.kind !== "video") return errorJson("only video allowed", 400);
    }
    if (postType === "image_set" && (assetIds.length < 1 || assetIds.length > 5)) {
      return errorJson("image_set must have 1-5 images", 400);
    }
    if (postType === "video" && assetIds.length !== 1) {
      return errorJson("video must have exactly 1 asset", 400);
    }
    await ctx.db.attachMediaToPost(postId, postType, assetIds);
    return okJson(null, 200);
  } catch (err) {
    console.error("attachMedia error", err);
    return errorJson(err.message, 500);
  }
}
__name(attachMediaRoute, "attachMediaRoute");
async function likeRoute(ctx, params) {
  const user = await requireAuthOwner(ctx);
  const postId = params.id;
  const post = await ctx.db.getPostById(postId);
  if (!post) return errorJson("post not found", 404);
  const result = await ctx.db.toggleLike(postId, user.uuid);
  if (result.isLiked && post.authorId !== user.uuid) {
    ctx.ctx.waitUntil(
      notifyPostLike({
        env: ctx.env,
        db: ctx.env.DB,
        recipientId: post.authorId,
        actorId: user.uuid,
        postId
      })
    );
  }
  return okJson({ isLiked: result.isLiked, like_count: result.likeCount }, 200);
}
__name(likeRoute, "likeRoute");
async function unlikeRoute(ctx, params) {
  const user = await requireAuthOwner(ctx);
  const postId = params.id;
  const post = await ctx.db.getPostById(postId);
  if (!post) return errorJson("post not found", 404);
  await ctx.db.unlikePost(postId, user.uuid);
  const updated = await ctx.db.getPostById(postId);
  return okJson({ like_count: updated?.likeCount ?? 0 }, 200);
}
__name(unlikeRoute, "unlikeRoute");
async function ensureCommentAccess(ctx, postId, user) {
  const post = await ctx.db.getPostById(postId);
  if (!post || post.isDeleted === 1) return errorJson("post not found", 404);
  const visibility = post.visibility ?? "public";
  if (visibility === "private" && post.authorId !== user.uuid) {
    return errorJson("forbidden", 403);
  }
  if (visibility === "friends" && post.authorId !== user.uuid) {
    const ok = await ctx.db.isFriends(post.authorId, user.uuid);
    if (!ok) return errorJson("forbidden", 403);
  }
  return { post };
}
__name(ensureCommentAccess, "ensureCommentAccess");
async function listLatestCommentRoute(ctx, params) {
  const user = await requireAuthOwner(ctx);
  const access = await ensureCommentAccess(ctx, params.id, user);
  if (access instanceof Response) return access;
  const latest = await ctx.db.getLatestComment(params.id, user.uuid);
  return okJson({ comment: latest, comment_count: access.post.commentCount ?? 0 }, 200);
}
__name(listLatestCommentRoute, "listLatestCommentRoute");
async function createCommentRoute(ctx, params) {
  const user = await requireAuthOwner(ctx);
  const postId = params.id;
  const body = await ctx.request.json().catch(() => ({}));
  const content = (body.content ?? "").trim();
  if (!content) return errorJson("content required", 400);
  const access = await ensureCommentAccess(ctx, postId, user);
  if (access instanceof Response) return access;
  const replyToId = (body.reply_to_comment_id ?? "").trim() || null;
  const parentId = (body.parent_comment_id ?? "").trim() || null;
  let finalParentId = null;
  let finalContent = content;
  let replyTargetOwnerId = null;
  let replyTargetCommentId = null;
  if (replyToId) {
    const target = await ctx.db.getCommentById(replyToId);
    if (!target) return errorJson("comment not found", 404);
    if (target.postId !== postId) return errorJson("comment not in post", 400);
    finalParentId = target.parentCommentId ?? target.id;
    replyTargetOwnerId = target.ownerId;
    replyTargetCommentId = target.id;
  } else if (parentId) {
    const parent = await ctx.db.getCommentById(parentId);
    if (!parent) return errorJson("comment not found", 404);
    if (parent.postId !== postId) return errorJson("comment not in post", 400);
    if (parent.parentCommentId) return errorJson("invalid parent_comment_id", 400);
    finalParentId = parent.id;
    replyTargetOwnerId = parent.ownerId;
    replyTargetCommentId = parent.id;
  }
  const created = await ctx.db.createComment({
    postId,
    ownerId: user.uuid,
    content: finalContent,
    parentCommentId: finalParentId
  });
  const check = await ctx.db.getCommentById(created.id);
  if (!check) {
    console.error("COMMENT_WRITE_VERIFY_FAILED", { createdId: created.id, postId });
    return errorJson("comment write verify failed", 500);
  }
  const updated = await ctx.db.getPostById(postId);
  const actorId = user.uuid;
  const postAuthorId = access.post.authorId;
  const replyRecipientId = replyTargetOwnerId && replyTargetOwnerId !== actorId ? replyTargetOwnerId : null;
  const replyCommentId = replyTargetCommentId ?? "";
  if (replyRecipientId && replyCommentId) {
    if (replyRecipientId === postAuthorId) {
      ctx.ctx.waitUntil(
        notifyCommentReply({
          env: ctx.env,
          db: ctx.env.DB,
          recipientId: replyRecipientId,
          actorId,
          postId,
          commentId: replyCommentId
        })
      );
    } else {
      if (postAuthorId !== actorId) {
        ctx.ctx.waitUntil(
          notifyPostComment({
            env: ctx.env,
            db: ctx.env.DB,
            recipientId: postAuthorId,
            actorId,
            postId
          })
        );
      }
      ctx.ctx.waitUntil(
        notifyCommentReply({
          env: ctx.env,
          db: ctx.env.DB,
          recipientId: replyRecipientId,
          actorId,
          postId,
          commentId: replyCommentId
        })
      );
    }
  } else if (postAuthorId !== actorId) {
    ctx.ctx.waitUntil(
      notifyPostComment({
        env: ctx.env,
        db: ctx.env.DB,
        recipientId: postAuthorId,
        actorId,
        postId
      })
    );
  }
  return okJson({ comment: created, comment_count: updated?.commentCount ?? (access.post.commentCount ?? 0) + 1 }, 201);
}
__name(createCommentRoute, "createCommentRoute");
async function listCommentsRoute(ctx, params) {
  const user = await requireAuthOwner(ctx);
  const access = await ensureCommentAccess(ctx, params.id, user);
  if (access instanceof Response) return access;
  const url = new URL(ctx.request.url);
  const limit = asNumber(url.searchParams.get("limit"), 20);
  const cursor = url.searchParams.get("cursor");
  const page = await ctx.db.listPostCommentsThread(params.id, limit, cursor, user.uuid);
  return okJson({ items: page.items, nextCursor: page.nextCursor, hasMore: page.hasMore }, 200);
}
__name(listCommentsRoute, "listCommentsRoute");
async function toggleCommentLikeRoute(ctx, params) {
  const user = await requireAuthOwner(ctx);
  const comment = await ctx.db.getCommentById(params.id);
  if (!comment) return errorJson("comment not found", 404);
  const access = await ensureCommentAccess(ctx, comment.postId, user);
  if (access instanceof Response) return access;
  const result = await ctx.db.toggleCommentLike(comment.id, user.uuid);
  if (result.isLiked && comment.ownerId !== user.uuid) {
    ctx.ctx.waitUntil(
      notifyCommentLike({
        env: ctx.env,
        db: ctx.env.DB,
        recipientId: comment.ownerId,
        actorId: user.uuid,
        postId: comment.postId,
        commentId: comment.id
      })
    );
  }
  return okJson({ isLiked: result.isLiked, like_count: result.likeCount }, 200);
}
__name(toggleCommentLikeRoute, "toggleCommentLikeRoute");
var routes3 = [
  { method: "GET", path: "/posts", handler: postsListRoute },
  { method: "POST", path: "/posts", handler: createPostRoute }
];
var dynamicRoutes = [
  { method: "POST", pattern: /^\/posts\/([^/]+)\/media\/attach$/, handler: attachMediaRoute },
  { method: "POST", pattern: /^\/posts\/([^/]+)\/like$/, handler: likeRoute },
  { method: "DELETE", pattern: /^\/posts\/([^/]+)\/like$/, handler: unlikeRoute },
  { method: "POST", pattern: /^\/posts\/([^/]+)\/repost$/, handler: repostRoute },
  { method: "GET", pattern: /^\/posts\/([^/]+)\/comments\/list$/, handler: listCommentsRoute },
  { method: "GET", pattern: /^\/posts\/([^/]+)\/comments$/, handler: listLatestCommentRoute },
  { method: "POST", pattern: /^\/posts\/([^/]+)\/comments$/, handler: createCommentRoute },
  { method: "POST", pattern: /^\/comments\/([^/]+)\/like$/, handler: toggleCommentLikeRoute }
];

// src/api/routes/media.ts
async function mediaImagesInitRoute(ctx) {
  try {
    const user = await getUserFromAuthHeader(ctx.db, ctx.request);
    if (!user) return errorJson("Unauthorized", 401);
    const body = await ctx.request.json().catch(() => ({}));
    const usage = (body.usage ?? "").trim();
    const file = body.file ?? {};
    if (!["avatar", "pet_avatar", "post", "kyc", "other"].includes(usage)) {
      return errorJson("invalid usage", 400);
    }
    if (!file.filename || !file.mime_type || typeof file.size_bytes !== "number") {
      return errorJson("file.filename, file.mime_type, size_bytes are required", 400);
    }
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.mime_type)) {
      return errorJson("unsupported mime_type", 422);
    }
    const cfAccountId = ctx.env.CF_ACCOUNT_ID;
    const cfToken = ctx.env.CF_API_TOKEN;
    const cfImagesHash = ctx.env.CF_IMAGES_ACCOUNT_HASH;
    if (!cfAccountId || !cfToken || !cfImagesHash) return errorJson("cloudflare images not configured", 500);
    const cfResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/images/v2/direct_upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfToken}` }
    });
    const cfJson = await cfResp.json().catch(() => ({}));
    if (!cfResp.ok || !cfJson?.success) {
      console.error("CF Images init failed", cfJson);
      return errorJson("cloudflare images init failed", 502);
    }
    const cfImageId = cfJson.result?.id;
    const uploadUrl = cfJson.result?.uploadURL;
    if (!cfImageId || !uploadUrl) return errorJson("cloudflare images init missing uploadURL", 502);
    const asset = await ctx.db.createMediaAsset({
      ownerId: user.uuid,
      kind: "image",
      usage,
      storageProvider: "cf_media",
      storageKey: cfImageId,
      url: `https://imagedelivery.net/${cfImagesHash}/${cfImageId}/${pickImageVariant(usage)}`,
      mimeType: file.mime_type,
      sizeBytes: file.size_bytes,
      status: "uploaded"
    });
    return okJson({ asset_id: asset.id, upload_url: uploadUrl }, 201);
  } catch (err) {
    console.error("mediaImagesInit error", err);
    return errorJson(err.message, 500);
  }
}
__name(mediaImagesInitRoute, "mediaImagesInitRoute");
async function mediaVideosInitRoute(ctx) {
  try {
    const user = await getUserFromAuthHeader(ctx.db, ctx.request);
    if (!user) return errorJson("Unauthorized", 401);
    const body = await ctx.request.json().catch(() => ({}));
    const usage = (body.usage ?? "").trim();
    const file = body.file ?? {};
    if (usage !== "post") return errorJson("video upload only supports usage=post for now", 400);
    if (!file.filename || !file.mime_type || typeof file.size_bytes !== "number") {
      return errorJson("file.filename, file.mime_type, size_bytes are required", 400);
    }
    const cfAccountId = ctx.env.CF_ACCOUNT_ID;
    const cfToken = ctx.env.CF_API_TOKEN;
    if (!cfAccountId || !cfToken) return errorJson("cloudflare stream not configured", 500);
    const cfStreamSubdomain = ctx.env.CF_STREAM_SUBDOMAIN;
    const cfResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/stream/direct_upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ maxDurationSeconds: 60, creator: user.uuid })
    });
    const cfJson = await cfResp.json().catch(() => ({}));
    if (!cfResp.ok || !cfJson?.success) {
      console.error("CF Stream init failed", cfJson);
      return errorJson("cloudflare stream init failed", 502);
    }
    const uid = cfJson.result?.uid;
    const uploadUrl = cfJson.result?.uploadURL;
    if (!uid || !uploadUrl) return errorJson("cloudflare stream init missing uploadURL", 502);
    const streamUrl = cfStreamSubdomain && uid ? `https://customer-${normalizeStreamSubdomain(cfStreamSubdomain)}.cloudflarestream.com/${uid}/manifest/video.m3u8` : null;
    const asset = await ctx.db.createMediaAsset({
      ownerId: user.uuid,
      kind: "video",
      usage: "post",
      storageProvider: "cf_media",
      storageKey: uid,
      url: streamUrl,
      mimeType: file.mime_type,
      sizeBytes: file.size_bytes,
      status: "processing"
    });
    return okJson({ asset_id: asset.id, upload_url: uploadUrl }, 201);
  } catch (err) {
    console.error("mediaVideosInit error", err);
    return errorJson(err.message, 500);
  }
}
__name(mediaVideosInitRoute, "mediaVideosInitRoute");
async function mediaUploadStubRoute(ctx, params) {
  const assetId = params.id;
  try {
    const form = await ctx.request.formData().catch(() => null);
    if (!form) return okJson({ asset_id: assetId }, 200);
    return okJson({ asset_id: assetId }, 200);
  } catch (err) {
    console.error("mediaUploadStub error", err);
    return errorJson(err.message, 500);
  }
}
__name(mediaUploadStubRoute, "mediaUploadStubRoute");
function pickImageVariant(usage) {
  switch (usage) {
    case "avatar":
      return "OwnerAvatar256";
    case "pet_avatar":
      return "PetAvatar256";
    case "post":
      return "Post1080";
    case "kyc":
      return "KYCMax1600";
    default:
      return "public";
  }
}
__name(pickImageVariant, "pickImageVariant");
function normalizeStreamSubdomain(value) {
  let sub = value.trim();
  sub = sub.replace(/^https?:\/\//, "");
  sub = sub.replace(/\.cloudflarestream\.com.*$/i, "");
  sub = sub.replace(/^customer-/, "");
  return sub;
}
__name(normalizeStreamSubdomain, "normalizeStreamSubdomain");
var routes4 = [
  { method: "POST", path: "/media/images/init", handler: mediaImagesInitRoute },
  { method: "POST", path: "/media/videos/init", handler: mediaVideosInitRoute }
];
var dynamicRoutes2 = [
  { method: "POST", pattern: /^\/media\/upload\/([^/]+)$/, handler: mediaUploadStubRoute }
];

// src/api/routes/admin.ts
function getClientIps(request) {
  const ips = [];
  const pushIp = /* @__PURE__ */ __name((value) => {
    if (!value) return;
    const normalized = normalizeIp(value);
    if (normalized) ips.push(normalized);
  }, "pushIp");
  pushIp(request.headers.get("CF-Connecting-IP"));
  pushIp(request.headers.get("True-Client-IP"));
  const forwarded = request.headers.get("X-Forwarded-For");
  if (forwarded) {
    forwarded.split(",").map((entry) => entry.trim()).forEach((entry) => pushIp(entry));
  }
  const forwardedHeader = request.headers.get("Forwarded");
  if (forwardedHeader) {
    forwardedHeader.split(",").map((entry) => entry.trim()).forEach((entry) => {
      const match = entry.match(/for=([^;]+)/i);
      if (match?.[1]) {
        pushIp(match[1].replace(/^"|"$/g, ""));
      }
    });
  }
  pushIp(request.headers.get("X-Real-IP"));
  return Array.from(new Set(ips));
}
__name(getClientIps, "getClientIps");
function getPrimaryClientIp(request) {
  const ips = getClientIps(request);
  return ips.length > 0 ? ips[0] : null;
}
__name(getPrimaryClientIp, "getPrimaryClientIp");
function normalizeIp(value) {
  const trimmed = value.trim().replace(/^"|"$/g, "");
  if (!trimmed) return "";
  if (trimmed.startsWith("::ffff:")) {
    return trimmed.slice("::ffff:".length);
  }
  if (trimmed.startsWith("[") && trimmed.includes("]")) {
    return trimmed.slice(1, trimmed.indexOf("]"));
  }
  const ipv4Match = trimmed.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/);
  if (ipv4Match) return ipv4Match[1];
  return trimmed;
}
__name(normalizeIp, "normalizeIp");
function splitAllowlist(value) {
  return value.split(/[,\s，;]+/).map((entry) => normalizeIp(entry)).filter(Boolean);
}
__name(splitAllowlist, "splitAllowlist");
function normalizeAllowlist(value) {
  const entries = splitAllowlist(value);
  if (entries.length === 0) return null;
  return entries.join(",");
}
__name(normalizeAllowlist, "normalizeAllowlist");
function parseAdminIdFromToken(request) {
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const token = auth.slice(7).trim();
  if (!token.startsWith("admin:")) return null;
  const adminId = token.slice("admin:".length).trim();
  return adminId ? adminId : null;
}
__name(parseAdminIdFromToken, "parseAdminIdFromToken");
async function requireAdmin(ctx) {
  const adminId = parseAdminIdFromToken(ctx.request);
  if (!adminId) return errorJson("Unauthorized", 401);
  const admin = await ctx.db.getAdminByAdminId(adminId);
  if (!admin) return errorJson("Unauthorized", 401);
  const allowlist = splitAllowlist(admin.ipAllowlist ?? "");
  if (allowlist.length === 0) return { adminId };
  const ips = getClientIps(ctx.request);
  if (ips.length === 0 || !ips.some((ip) => allowlist.includes(ip))) return errorJson("Forbidden", 403);
  return { adminId };
}
__name(requireAdmin, "requireAdmin");
async function reviewSummaryRoute(ctx) {
  const auth = await requireAdmin(ctx);
  if (auth instanceof Response) return auth;
  const counts = await ctx.db.countVerificationStatuses();
  return okJson({ ...counts, ts: (/* @__PURE__ */ new Date()).toISOString() });
}
__name(reviewSummaryRoute, "reviewSummaryRoute");
async function reviewKycPendingRoute(ctx) {
  const auth = await requireAdmin(ctx);
  if (auth instanceof Response) return auth;
  const data = await ctx.db.listVerifications();
  return okJson(data, 200);
}
__name(reviewKycPendingRoute, "reviewKycPendingRoute");
async function kycDetailRoute(ctx, params) {
  const auth = await requireAdmin(ctx);
  if (auth instanceof Response) return auth;
  const account = await ctx.db.getAccountById(params.id);
  if (!account) return errorJson("Not found", 404);
  const bucket = ctx.env.R2_MEDIA?.bucket?.name ?? "rubypets-media-dev";
  const toUrl = /* @__PURE__ */ __name((value) => {
    if (!value) return null;
    if (value.startsWith("http://") || value.startsWith("https://")) return value;
    const base = ctx.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "");
    let key = value.replace(/^\/+/, "");
    if (base) {
      if (key.startsWith(`${bucket}/`)) {
        key = key.slice(bucket.length + 1);
      }
      return `${base}/${key}`;
    }
    return `${bucket}/${key}`;
  }, "toUrl");
  return okJson(
    {
      accountId: account.accountId,
      realName: account.realName ?? null,
      idNumber: account.idNumber ?? null,
      phoneNumber: account.phoneNumber ?? null,
      isVerified: account.isVerified,
      idLicenseFrontUrl: toUrl(account.idLicenseFrontUrl),
      idLicenseBackUrl: toUrl(account.idLicenseBackUrl),
      faceWithLicenseUrl: toUrl(account.faceWithLicenseUrl),
      createdAt: account.createdAt ?? null
    },
    200
  );
}
__name(kycDetailRoute, "kycDetailRoute");
async function kycDecisionRoute(ctx, params) {
  const auth = await requireAdmin(ctx);
  if (auth instanceof Response) return auth;
  const accountId = params.id;
  const body = await ctx.request.json().catch(() => ({}));
  if (body.status !== 1 && body.status !== 3) return errorJson("invalid status", 400);
  await ctx.db.updateAccountVerificationStatus(accountId, body.status);
  return okJson({ accountId, status: body.status }, 200);
}
__name(kycDecisionRoute, "kycDecisionRoute");
async function adminAccountsListRoute(ctx) {
  const auth = await requireAdmin(ctx);
  if (auth instanceof Response) return auth;
  const admins = await ctx.db.listAdminAccounts();
  return okJson(admins, 200);
}
__name(adminAccountsListRoute, "adminAccountsListRoute");
async function adminAccountsCreateRoute(ctx) {
  const auth = await requireAdmin(ctx);
  if (auth instanceof Response) return auth;
  const payload = await ctx.request.json().catch(() => ({}));
  const adminId = (payload.adminId ?? "").trim();
  const password = payload.password ?? "";
  const permission = (payload.permission ?? "").trim() || "Inspector";
  if (!adminId || !password) return errorJson("adminId and password are required", 400);
  if (!["super", "administrator", "Inspector"].includes(permission)) return errorJson("invalid permission", 400);
  const hashed = await hashPassword(password);
  const created = await ctx.db.createAdminAccount({ adminId, password: hashed, permission });
  const currentIp = getPrimaryClientIp(ctx.request);
  if (currentIp) {
    await ctx.db.updateAdminIpAllowlist(adminId, currentIp);
  }
  return okJson(created, 201);
}
__name(adminAccountsCreateRoute, "adminAccountsCreateRoute");
async function adminLoginRoute(ctx) {
  const payload = await ctx.request.json().catch(() => ({}));
  const adminId = (payload.adminId ?? "").trim();
  const password = payload.password ?? "";
  if (!adminId || !password) return errorJson("adminId and password are required", 400);
  const admin = await ctx.db.getAdminByAdminId(adminId);
  if (!admin) return errorJson("invalid credentials", 401);
  const ok = await verifyPassword(password, admin.passwordHash);
  if (!ok) return errorJson("invalid credentials", 401);
  const allowlist = splitAllowlist(admin.ipAllowlist ?? "");
  if (allowlist.length > 0) {
    const ips = getClientIps(ctx.request);
    if (ips.length === 0 || !ips.some((ip) => allowlist.includes(ip))) return errorJson("Forbidden", 403);
  }
  const token = `admin:${admin.adminId}`;
  await ctx.db.updateAdminLastAt(admin.adminId, (/* @__PURE__ */ new Date()).toISOString());
  return okJson({ token, admin: { id: admin.id, adminId: admin.adminId, permission: admin.permission } }, 200);
}
__name(adminLoginRoute, "adminLoginRoute");
async function adminAccountRollRoute(ctx, params) {
  const auth = await requireAdmin(ctx);
  if (auth instanceof Response) return auth;
  const id = params.id;
  const payload = await ctx.request.json().catch(() => ({}));
  const newPassword = payload.password ?? "";
  if (!newPassword) return errorJson("password required", 400);
  const hashed = await hashPassword(newPassword);
  await ctx.db.updateAdminPassword(id, hashed);
  return okJson({ accountId: id }, 200);
}
__name(adminAccountRollRoute, "adminAccountRollRoute");
async function adminPostsListRoute(ctx) {
  const auth = await requireAdmin(ctx);
  if (auth instanceof Response) return auth;
  const url = new URL(ctx.request.url);
  const limit = asNumber(url.searchParams.get("limit"), 20);
  const page = Math.max(asNumber(url.searchParams.get("page"), 1), 1);
  const offset = (page - 1) * limit;
  const posts = await ctx.db.listAdminPosts(limit, offset);
  return okJson({ items: posts, page, hasMore: posts.length === limit }, 200);
}
__name(adminPostsListRoute, "adminPostsListRoute");
async function adminPostDetailRoute(ctx, params) {
  const auth = await requireAdmin(ctx);
  if (auth instanceof Response) return auth;
  const post = await ctx.db.getPostById(params.id);
  if (!post) return errorJson("post not found", 404);
  return okJson(post, 200);
}
__name(adminPostDetailRoute, "adminPostDetailRoute");
async function adminPostModerateRoute(ctx, params) {
  const auth = await requireAdmin(ctx);
  if (auth instanceof Response) return auth;
  try {
    const postId = params.id;
    const body = await ctx.request.json().catch(() => ({}));
    const action = (body.action ?? "").trim();
    const post = await ctx.db.getPostById(postId);
    if (!post) return errorJson("post not found", 404);
    const assets = await ctx.db.getPostAssets(postId);
    const assetIds = assets.map((a) => a.assetId);
    if (action === "disable") {
      await ctx.db.markPostDeleted(postId);
      return okJson(null, 200);
    }
    if (action === "disable_delete_media") {
      await deleteCloudflareAssets(assets, ctx.env);
      await ctx.db.deletePostMediaAndAssets(postId, assetIds);
      await ctx.db.markPostDeleted(postId);
      return okJson(null, 200);
    }
    if (action === "delete_all") {
      await deleteCloudflareAssets(assets, ctx.env);
      await ctx.db.deletePostCascade(postId, assetIds);
      return okJson(null, 200);
    }
    return errorJson("invalid action", 400);
  } catch (err) {
    console.error("adminPostModerate error", err);
    return errorJson(err.message, 500);
  }
}
__name(adminPostModerateRoute, "adminPostModerateRoute");
async function adminIpInfoRoute(ctx) {
  const auth = await requireAdmin(ctx);
  if (auth instanceof Response) return auth;
  return okJson(
    {
      primaryIp: getPrimaryClientIp(ctx.request),
      ips: getClientIps(ctx.request)
    },
    200
  );
}
__name(adminIpInfoRoute, "adminIpInfoRoute");
async function adminAccountIpAllowlistRoute(ctx, params) {
  const auth = await requireAdmin(ctx);
  if (auth instanceof Response) return auth;
  const payload = await ctx.request.json().catch(() => ({}));
  const normalized = normalizeAllowlist(payload.ipAllowlist ?? "");
  const updated = await ctx.db.updateAdminIpAllowlist(params.id, normalized);
  if (!updated) return errorJson("Not found", 404);
  return okJson({ adminId: params.id, ipAllowlist: normalized }, 200);
}
__name(adminAccountIpAllowlistRoute, "adminAccountIpAllowlistRoute");
async function deleteCloudflareAssets(assets, env) {
  const cfAccountId = env.CF_ACCOUNT_ID;
  const cfToken = env.CF_API_TOKEN;
  if (!cfAccountId || !cfToken) {
    console.warn("Cloudflare credentials missing, skip remote delete");
    return;
  }
  for (const asset of assets) {
    try {
      if (asset.kind === "image") {
        await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/images/v1/${asset.storageKey}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${cfToken}` }
        });
      } else if (asset.kind === "video") {
        await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/stream/${asset.storageKey}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${cfToken}` }
        });
      }
    } catch (err) {
      console.error("deleteCloudflareAsset failed", asset, err);
    }
  }
}
__name(deleteCloudflareAssets, "deleteCloudflareAssets");
var routes5 = [
  { method: "GET", path: "/admin/ip-info", handler: adminIpInfoRoute },
  { method: "GET", path: "/admin/review/summary", handler: reviewSummaryRoute },
  { method: "GET", path: "/admin/review/kyc-pending", handler: reviewKycPendingRoute },
  { method: "GET", path: "/admin/admin-accounts", handler: adminAccountsListRoute },
  { method: "POST", path: "/admin/admin-accounts", handler: adminAccountsCreateRoute },
  { method: "POST", path: "/admin/auth/login", handler: adminLoginRoute },
  { method: "GET", path: "/admin/posts", handler: adminPostsListRoute }
];
var dynamicRoutes3 = [
  { method: "GET", pattern: /^\/admin\/review\/kyc\/([^/]+)$/, handler: kycDetailRoute },
  { method: "POST", pattern: /^\/admin\/review\/kyc\/([^/]+)\/decision$/, handler: kycDecisionRoute },
  { method: "POST", pattern: /^\/admin\/admin-accounts\/([^/]+)\/roll$/, handler: adminAccountRollRoute },
  { method: "POST", pattern: /^\/admin\/admin-accounts\/([^/]+)\/ip-allowlist$/, handler: adminAccountIpAllowlistRoute },
  { method: "GET", pattern: /^\/admin\/posts\/([^/]+)$/, handler: adminPostDetailRoute },
  { method: "POST", pattern: /^\/admin\/posts\/([^/]+)\/moderate$/, handler: adminPostModerateRoute }
];

// src/data/pets-category.json
var pets_category_default = {
  classes: [
    {
      key: "mammals",
      label: "mammals",
      species: [
        {
          key: "dogs",
          label: "dogs",
          hasBreed: true,
          breeds: [
            {
              key: "Taiwan Dog",
              label: "Taiwan Dog"
            },
            {
              key: "Chihuahua",
              label: "Chihuahua"
            },
            {
              key: "Pomeranian",
              label: "Pomeranian"
            },
            {
              key: "Yorkshire Terrier",
              label: "Yorkshire Terrier"
            },
            {
              key: "Maltese",
              label: "Maltese"
            },
            {
              key: "Shih Tzu",
              label: "Shih Tzu"
            },
            {
              key: "Poodle",
              label: "Poodle"
            },
            {
              key: "Pug",
              label: "Pug"
            },
            {
              key: "Bichon Frise",
              label: "Bichon Frise"
            },
            {
              key: "Dachshund",
              label: "Dachshund"
            },
            {
              key: "Pembroke Welsh Corgi",
              label: "Pembroke Welsh Corgi"
            },
            {
              key: "Schnauzer",
              label: "Schnauzer"
            },
            {
              key: "Labrador Retriever",
              label: "Labrador Retriever"
            },
            {
              key: "Golden Retriever",
              label: "Golden Retriever"
            },
            {
              key: "Siberian Husky",
              label: "Siberian Husky"
            },
            {
              key: "Shiba Inu",
              label: "Shiba Inu"
            },
            {
              key: "Border Collie",
              label: "Border Collie"
            },
            {
              key: "English Bulldog",
              label: "English Bulldog"
            },
            {
              key: "French Bulldog",
              label: "French Bulldog"
            },
            {
              key: "Boxer",
              label: "Boxer"
            },
            {
              key: "German Shepherd",
              label: "German Shepherd"
            },
            {
              key: "Rottweiler",
              label: "Rottweiler"
            },
            {
              key: "Doberman Pinscher",
              label: "Doberman Pinscher"
            },
            {
              key: "Australian Shepherd",
              label: "Australian Shepherd"
            },
            {
              key: "Dalmatian",
              label: "Dalmatian"
            },
            {
              key: "Old English Sheepdog",
              label: "Old English Sheepdog"
            },
            {
              key: "Shetland Sheepdog",
              label: "Shetland Sheepdog"
            },
            {
              key: "Alaskan Malamute",
              label: "Alaskan Malamute"
            },
            {
              key: "Akita",
              label: "Akita"
            },
            {
              key: "Vizsla",
              label: "Vizsla"
            },
            {
              key: "American Pit Bull Terrier",
              label: "American Pit Bull Terrier"
            },
            {
              key: "American Bully",
              label: "American Bully"
            },
            {
              key: "Boston Terrier",
              label: "Boston Terrier"
            },
            {
              key: "Beagle",
              label: "Beagle"
            },
            {
              key: "Whippet",
              label: "Whippet"
            },
            {
              key: "Greyhound",
              label: "Greyhound"
            },
            {
              key: "Irish Setter",
              label: "Irish Setter"
            },
            {
              key: "English Cocker Spaniel",
              label: "English Cocker Spaniel"
            },
            {
              key: "American Cocker Spaniel",
              label: "American Cocker Spaniel"
            },
            {
              key: "Basset Hound",
              label: "Basset Hound"
            },
            {
              key: "Great Dane",
              label: "Great Dane"
            },
            {
              key: "Bernese Mountain Dog",
              label: "Bernese Mountain Dog"
            },
            {
              key: "Saint Bernard",
              label: "Saint Bernard"
            },
            {
              key: "Newfoundland",
              label: "Newfoundland"
            },
            {
              key: "Lhasa Apso",
              label: "Lhasa Apso"
            },
            {
              key: "Bull Terrier",
              label: "Bull Terrier"
            },
            {
              key: "Miniature Bull Terrier",
              label: "Miniature Bull Terrier"
            },
            {
              key: "Chinese Crested",
              label: "Chinese Crested"
            },
            {
              key: "West Highland White Terrier",
              label: "West Highland White Terrier"
            },
            {
              key: "Scottish Terrier",
              label: "Scottish Terrier"
            },
            {
              key: "Jack Russell Terrier",
              label: "Jack Russell Terrier"
            },
            {
              key: "Fox Terrier",
              label: "Fox Terrier"
            },
            {
              key: "Basenji",
              label: "Basenji"
            },
            {
              key: "Shar Pei",
              label: "Shar Pei"
            },
            {
              key: "Chow Chow",
              label: "Chow Chow"
            },
            {
              key: "Tibetan Mastiff",
              label: "Tibetan Mastiff"
            },
            {
              key: "Portuguese Water Dog",
              label: "Portuguese Water Dog"
            },
            {
              key: "Coton de Tulear",
              label: "Coton de Tulear"
            },
            {
              key: "Italian Greyhound",
              label: "Italian Greyhound"
            },
            {
              key: "Papillon",
              label: "Papillon"
            },
            {
              key: "Cavalier King Charles Spaniel",
              label: "Cavalier King Charles Spaniel"
            },
            {
              key: "American Eskimo Dog",
              label: "American Eskimo Dog"
            },
            {
              key: "Samoyed",
              label: "Samoyed"
            },
            {
              key: "Belgian Malinois",
              label: "Belgian Malinois"
            },
            {
              key: "Belgian Tervuren",
              label: "Belgian Tervuren"
            },
            {
              key: "Belgian Sheepdog",
              label: "Belgian Sheepdog"
            },
            {
              key: "Foxhound",
              label: "Foxhound"
            },
            {
              key: "American Foxhound",
              label: "American Foxhound"
            },
            {
              key: "Treeing Walker Coonhound",
              label: "Treeing Walker Coonhound"
            },
            {
              key: "Rough Collie",
              label: "Rough Collie"
            },
            {
              key: "Smooth Collie",
              label: "Smooth Collie"
            },
            {
              key: "English Setter",
              label: "English Setter"
            },
            {
              key: "Goldendoodle",
              label: "Goldendoodle"
            },
            {
              key: "Labradoodle",
              label: "Labradoodle"
            },
            {
              key: "Mixed",
              label: "Mixed"
            }
          ]
        },
        {
          key: "cats",
          label: "cats",
          hasBreed: true,
          breeds: [
            {
              key: "Mixed",
              label: "Mixed"
            },
            {
              key: "Persian",
              label: "Persian"
            },
            {
              key: "British Shorthair",
              label: "British Shorthair"
            },
            {
              key: "British Longhair",
              label: "British Longhair"
            },
            {
              key: "American Shorthair",
              label: "American Shorthair"
            },
            {
              key: "American Longhair",
              label: "American Longhair"
            },
            {
              key: "Tuxedo Cat",
              label: "Tuxedo Cat"
            },
            {
              key: "Orange Tabby",
              label: "Orange Tabby"
            },
            {
              key: "Tabby Cat",
              label: "Tabby Cat"
            },
            {
              key: "Calico",
              label: "Calico"
            },
            {
              key: "Tortoiseshell",
              label: "Tortoiseshell"
            },
            {
              key: "Ragdoll",
              label: "Ragdoll"
            },
            {
              key: "Maine Coon",
              label: "Maine Coon"
            },
            {
              key: "Norwegian Forest Cat",
              label: "Norwegian Forest Cat"
            },
            {
              key: "Birman",
              label: "Birman"
            },
            {
              key: "Exotic Shorthair",
              label: "Exotic Shorthair"
            },
            {
              key: "Scottish Fold",
              label: "Scottish Fold"
            },
            {
              key: "Scottish Straight",
              label: "Scottish Straight"
            },
            {
              key: "Russian Blue",
              label: "Russian Blue"
            },
            {
              key: "Egyptian Mau",
              label: "Egyptian Mau"
            },
            {
              key: "Sphynx",
              label: "Sphynx"
            },
            {
              key: "Bengal",
              label: "Bengal"
            },
            {
              key: "Abyssinian",
              label: "Abyssinian"
            },
            {
              key: "Somali",
              label: "Somali"
            },
            {
              key: "Turkish Van",
              label: "Turkish Van"
            },
            {
              key: "Turkish Angora",
              label: "Turkish Angora"
            },
            {
              key: "Chartreux",
              label: "Chartreux"
            },
            {
              key: "Himalayan",
              label: "Himalayan"
            },
            {
              key: "Munchkin",
              label: "Munchkin"
            },
            {
              key: "Peterbald",
              label: "Peterbald"
            },
            {
              key: "Devon Rex",
              label: "Devon Rex"
            },
            {
              key: "Cornish Rex",
              label: "Cornish Rex"
            },
            {
              key: "Oriental Shorthair",
              label: "Oriental Shorthair"
            },
            {
              key: "Oriental Longhair",
              label: "Oriental Longhair"
            },
            {
              key: "Burmese",
              label: "Burmese"
            },
            {
              key: "Singapura",
              label: "Singapura"
            },
            {
              key: "Arabian Mau",
              label: "Arabian Mau"
            },
            {
              key: "Selkirk Rex",
              label: "Selkirk Rex"
            },
            {
              key: "Japanese Bobtail",
              label: "Japanese Bobtail"
            },
            {
              key: "Kurilian Bobtail",
              label: "Kurilian Bobtail"
            },
            {
              key: "American Curl",
              label: "American Curl"
            },
            {
              key: "Highland Fold",
              label: "Highland Fold"
            },
            {
              key: "LaPerm",
              label: "LaPerm"
            },
            {
              key: "Donskoy",
              label: "Donskoy"
            },
            {
              key: "Savannah",
              label: "Savannah"
            },
            {
              key: "Ragamuffin",
              label: "Ragamuffin"
            },
            {
              key: "Minuet (Napoleon)",
              label: "Minuet (Napoleon)"
            },
            {
              key: "Australian Mist",
              label: "Australian Mist"
            },
            {
              key: "Snowshoe",
              label: "Snowshoe"
            },
            {
              key: "Toyger",
              label: "Toyger"
            },
            {
              key: "Dinkum Cat",
              label: "Dinkum Cat"
            },
            {
              key: "Ocicat",
              label: "Ocicat"
            },
            {
              key: "Balinese",
              label: "Balinese"
            }
          ]
        },
        {
          key: "rabbits",
          label: "rabbits",
          hasBreed: true,
          breeds: [
            {
              key: "Spot Rabbit",
              label: "Spot Rabbit"
            },
            {
              key: "Angora",
              label: "Angora"
            },
            {
              key: "Creme d'Argent",
              label: "Creme d'Argent"
            },
            {
              key: "Flemish Rabbit",
              label: "Flemish Rabbit"
            },
            {
              key: "Dutch",
              label: "Dutch"
            },
            {
              key: "Oryctolagus cuniculus",
              label: "Oryctolagus cuniculus"
            },
            {
              key: "Red-eared Slider",
              label: "Red-eared Slider"
            },
            {
              key: "Yellow-bellied Slider",
              label: "Yellow-bellied Slider"
            },
            {
              key: "Map Turtle",
              label: "Map Turtle"
            },
            {
              key: "Common Musk Turtle",
              label: "Common Musk Turtle"
            },
            {
              key: "Razor-backed Musk Turtle",
              label: "Razor-backed Musk Turtle"
            },
            {
              key: "Mud Turtle",
              label: "Mud Turtle"
            },
            {
              key: "Diamondback Terrapin",
              label: "Diamondback Terrapin"
            },
            {
              key: "Chinese Pond Turtle",
              label: "Chinese Pond Turtle"
            },
            {
              key: "Golden Coin Turtle",
              label: "Golden Coin Turtle"
            },
            {
              key: "Reeves's Turtle",
              label: "Reeves's Turtle"
            },
            {
              key: "Asian Leaf Turtle",
              label: "Asian Leaf Turtle"
            },
            {
              key: "Burmese Star Tortoise",
              label: "Burmese Star Tortoise"
            },
            {
              key: "Indian Star Tortoise",
              label: "Indian Star Tortoise"
            }
          ]
        },
        {
          key: "hamster",
          label: "hamster",
          hasBreed: true,
          breeds: [
            {
              key: "Sulcata Tortoise",
              label: "Sulcata Tortoise"
            },
            {
              key: "Leopard Tortoise",
              label: "Leopard Tortoise"
            },
            {
              key: "Hermann's Tortoise",
              label: "Hermann's Tortoise"
            },
            {
              key: "Greek Tortoise",
              label: "Greek Tortoise"
            },
            {
              key: "Russian Tortoise",
              label: "Russian Tortoise"
            }
          ]
        },
        {
          key: "pigs",
          label: "pigs",
          hasBreed: true,
          breeds: [
            {
              key: "Red-footed Tortoise",
              label: "Red-footed Tortoise"
            }
          ]
        },
        {
          key: "sheep",
          label: "sheep",
          hasBreed: true,
          breeds: [
            {
              key: "Yellow-footed Tortoise",
              label: "Yellow-footed Tortoise"
            }
          ]
        },
        {
          key: "horses",
          label: "horses",
          hasBreed: true,
          breeds: [
            {
              key: "nan",
              label: "nan"
            }
          ]
        },
        {
          key: "hedgehogs",
          label: "hedgehogs",
          hasBreed: true,
          breeds: [
            {
              key: "nan",
              label: "nan"
            }
          ]
        },
        {
          key: "sugar gliders",
          label: "sugar gliders",
          hasBreed: true,
          breeds: [
            {
              key: "nan",
              label: "nan"
            }
          ]
        },
        {
          key: "squirrels",
          label: "squirrels",
          hasBreed: true,
          breeds: [
            {
              key: "nan",
              label: "nan"
            }
          ]
        }
      ]
    },
    {
      key: "reptiles",
      label: "reptiles",
      species: [
        {
          key: "frogs",
          label: "frogs",
          hasBreed: true,
          breeds: [
            {
              key: "White's Tree Frog",
              label: "White's Tree Frog"
            },
            {
              key: "Green Tree Frog",
              label: "Green Tree Frog"
            },
            {
              key: "Red-eyed Tree Frog",
              label: "Red-eyed Tree Frog"
            },
            {
              key: "American Bullfrog",
              label: "American Bullfrog"
            },
            {
              key: "African Dwarf Frog",
              label: "African Dwarf Frog"
            },
            {
              key: "African Clawed Frog",
              label: "African Clawed Frog"
            },
            {
              key: "Poison Dart Frog",
              label: "Poison Dart Frog"
            },
            {
              key: "Horned Frog",
              label: "Horned Frog"
            },
            {
              key: "Amazonian Horned Frog",
              label: "Amazonian Horned Frog"
            },
            {
              key: "Ornate Horned Frog",
              label: "Ornate Horned Frog"
            },
            {
              key: "Tomato Frog",
              label: "Tomato Frog"
            },
            {
              key: "Glass Frog",
              label: "Glass Frog"
            },
            {
              key: "Asian Rice Frog",
              label: "Asian Rice Frog"
            },
            {
              key: "Taiwan Tree Frog",
              label: "Taiwan Tree Frog"
            }
          ]
        },
        {
          key: "snakes",
          label: "snakes",
          hasBreed: true,
          breeds: [
            {
              key: "Ball Python",
              label: "Ball Python"
            },
            {
              key: "Corn Snake",
              label: "Corn Snake"
            },
            {
              key: "Milk Snake",
              label: "Milk Snake"
            },
            {
              key: "Kingsnake",
              label: "Kingsnake"
            },
            {
              key: "California Kingsnake",
              label: "California Kingsnake"
            },
            {
              key: "Red-tailed Boa",
              label: "Red-tailed Boa"
            },
            {
              key: "Burmese Python",
              label: "Burmese Python"
            },
            {
              key: "Reticulated Python",
              label: "Reticulated Python"
            },
            {
              key: "Green Tree Python",
              label: "Green Tree Python"
            },
            {
              key: "Carpet Python",
              label: "Carpet Python"
            },
            {
              key: "Blood Python",
              label: "Blood Python"
            },
            {
              key: "Short-tailed Python",
              label: "Short-tailed Python"
            },
            {
              key: "Hognose Snake",
              label: "Hognose Snake"
            },
            {
              key: "Garter Snake",
              label: "Garter Snake"
            },
            {
              key: "Vine Snake",
              label: "Vine Snake"
            },
            {
              key: "Rat Snake",
              label: "Rat Snake"
            },
            {
              key: "Ratsnake (Oriental Rat Snake)",
              label: "Ratsnake (Oriental Rat Snake)"
            },
            {
              key: "White-lipped Tree Snake",
              label: "White-lipped Tree Snake"
            },
            {
              key: "Cobra",
              label: "Cobra"
            },
            {
              key: "King Cobra",
              label: "King Cobra"
            },
            {
              key: "Rattlesnake",
              label: "Rattlesnake"
            },
            {
              key: "Green Mamba",
              label: "Green Mamba"
            },
            {
              key: "Black Mamba",
              label: "Black Mamba"
            }
          ]
        },
        {
          key: "lizards",
          label: "lizards",
          hasBreed: true,
          breeds: [
            {
              key: "Leopard Gecko",
              label: "Leopard Gecko"
            },
            {
              key: "Crested Gecko",
              label: "Crested Gecko"
            },
            {
              key: "African Fat-tailed Gecko",
              label: "African Fat-tailed Gecko"
            },
            {
              key: "Giant Day Gecko",
              label: "Giant Day Gecko"
            },
            {
              key: "Day Gecko",
              label: "Day Gecko"
            },
            {
              key: "Blue-tongued Skink",
              label: "Blue-tongued Skink"
            },
            {
              key: "Solomon Islands Skink",
              label: "Solomon Islands Skink"
            },
            {
              key: "Green Iguana",
              label: "Green Iguana"
            },
            {
              key: "Red Iguana",
              label: "Red Iguana"
            },
            {
              key: "Desert Iguana",
              label: "Desert Iguana"
            },
            {
              key: "Chameleon",
              label: "Chameleon"
            },
            {
              key: "Leaf-tailed Gecko",
              label: "Leaf-tailed Gecko"
            },
            {
              key: "Bearded Dragon",
              label: "Bearded Dragon"
            },
            {
              key: "Uromastyx",
              label: "Uromastyx"
            },
            {
              key: "Nile Monitor",
              label: "Nile Monitor"
            },
            {
              key: "Savannah Monitor",
              label: "Savannah Monitor"
            },
            {
              key: "Blue Tree Monitor",
              label: "Blue Tree Monitor"
            },
            {
              key: "Anole",
              label: "Anole"
            },
            {
              key: "Long-tailed Lizard",
              label: "Long-tailed Lizard"
            },
            {
              key: "Chinese Water Dragon",
              label: "Chinese Water Dragon"
            },
            {
              key: "Asian Water Dragon",
              label: "Asian Water Dragon"
            },
            {
              key: "Draco",
              label: "Draco"
            }
          ]
        },
        {
          key: "turtles",
          label: "turtles",
          hasBreed: true,
          breeds: [
            {
              key: "Red-eared Slider",
              label: "Red-eared Slider"
            },
            {
              key: "Yellow-bellied Slider",
              label: "Yellow-bellied Slider"
            },
            {
              key: "Map Turtle",
              label: "Map Turtle"
            },
            {
              key: "Common Musk Turtle",
              label: "Common Musk Turtle"
            },
            {
              key: "Razor-backed Musk Turtle",
              label: "Razor-backed Musk Turtle"
            },
            {
              key: "Mud Turtle",
              label: "Mud Turtle"
            },
            {
              key: "Diamondback Terrapin",
              label: "Diamondback Terrapin"
            },
            {
              key: "Chinese Pond Turtle",
              label: "Chinese Pond Turtle"
            },
            {
              key: "Golden Coin Turtle",
              label: "Golden Coin Turtle"
            },
            {
              key: "Reeves's Turtle",
              label: "Reeves's Turtle"
            },
            {
              key: "Asian Leaf Turtle",
              label: "Asian Leaf Turtle"
            },
            {
              key: "Burmese Star Tortoise",
              label: "Burmese Star Tortoise"
            },
            {
              key: "Indian Star Tortoise",
              label: "Indian Star Tortoise"
            },
            {
              key: "Sulcata Tortoise",
              label: "Sulcata Tortoise"
            },
            {
              key: "Leopard Tortoise",
              label: "Leopard Tortoise"
            },
            {
              key: "Hermann's Tortoise",
              label: "Hermann's Tortoise"
            },
            {
              key: "Greek Tortoise",
              label: "Greek Tortoise"
            },
            {
              key: "Russian Tortoise",
              label: "Russian Tortoise"
            },
            {
              key: "Red-footed Tortoise",
              label: "Red-footed Tortoise"
            },
            {
              key: "Yellow-footed Tortoise",
              label: "Yellow-footed Tortoise"
            }
          ]
        }
      ]
    },
    {
      key: "birds",
      label: "birds",
      species: [
        {
          key: "birds",
          label: "birds",
          hasBreed: true,
          breeds: [
            {
              key: "Budgerigar",
              label: "Budgerigar"
            },
            {
              key: "Cockatiel",
              label: "Cockatiel"
            },
            {
              key: "Monk Parakeet",
              label: "Monk Parakeet"
            },
            {
              key: "Sun Conure",
              label: "Sun Conure"
            },
            {
              key: "Sun Conure (Golden)",
              label: "Sun Conure (Golden)"
            },
            {
              key: "Caique",
              label: "Caique"
            },
            {
              key: "African Grey Parrot",
              label: "African Grey Parrot"
            },
            {
              key: "Eclectus Parrot",
              label: "Eclectus Parrot"
            },
            {
              key: "Amazon Parrot",
              label: "Amazon Parrot"
            },
            {
              key: "Macaw",
              label: "Macaw"
            },
            {
              key: "Green-cheeked Conure",
              label: "Green-cheeked Conure"
            },
            {
              key: "Lovebird",
              label: "Lovebird"
            },
            {
              key: "Java Sparrow",
              label: "Java Sparrow"
            },
            {
              key: "Zebra Finch",
              label: "Zebra Finch"
            },
            {
              key: "Canary",
              label: "Canary"
            },
            {
              key: "White Java Sparrow",
              label: "White Java Sparrow"
            },
            {
              key: "Pigeon",
              label: "Pigeon"
            },
            {
              key: "Dove",
              label: "Dove"
            },
            {
              key: "Quail",
              label: "Quail"
            },
            {
              key: "Peafowl",
              label: "Peafowl"
            },
            {
              key: "Crow",
              label: "Crow"
            },
            {
              key: "Myna",
              label: "Myna"
            }
          ]
        },
        {
          key: "ducks",
          label: "ducks",
          hasBreed: true,
          breeds: [
            {
              key: "Pekin Duck",
              label: "Pekin Duck"
            },
            {
              key: "Muscovy Duck",
              label: "Muscovy Duck"
            },
            {
              key: "Mallard",
              label: "Mallard"
            },
            {
              key: "Khaki Campbell Duck",
              label: "Khaki Campbell Duck"
            },
            {
              key: "Indian Runner Duck",
              label: "Indian Runner Duck"
            },
            {
              key: "Call Duck",
              label: "Call Duck"
            }
          ]
        },
        {
          key: "chickens",
          label: "chickens",
          hasBreed: true,
          breeds: [
            {
              key: "nan",
              label: "nan"
            }
          ]
        },
        {
          key: "geese",
          label: "geese",
          hasBreed: true,
          breeds: [
            {
              key: "nan",
              label: "nan"
            }
          ]
        }
      ]
    }
  ]
};

// src/services/pets.ts
function getPublicMediaBase(env) {
  const raw = (env.R2_PUBLIC_BASE_URL ?? "https://media.rubypets.com").trim();
  return raw.replace(/\/+$/, "");
}
__name(getPublicMediaBase, "getPublicMediaBase");
async function createPetForOwner(db, env, me, body) {
  const {
    pet_id,
    owners_uuid,
    "class": petClass,
    species,
    breed,
    name,
    gender,
    birthday: birthdayRaw,
    bio,
    avatar_storage_key: storageKey,
    avatar_url: avatarUrl
  } = body;
  if (!pet_id || !owners_uuid || !petClass || !species || !name || !storageKey || !avatarUrl) {
    throw Object.assign(new Error("missing required fields"), { status: 400 });
  }
  if (owners_uuid !== me.uuid) throw Object.assign(new Error("Forbidden"), { status: 403 });
  if (!gender) throw Object.assign(new Error("gender required"), { status: 400 });
  if (!["male", "female", "unknown"].includes(gender)) {
    throw Object.assign(new Error("invalid gender"), { status: 400 });
  }
  if (!birthdayRaw) throw Object.assign(new Error("birthday required"), { status: 400 });
  if (bio && bio.length > 200) throw Object.assign(new Error("bio too long"), { status: 400 });
  let birthday = null;
  if (birthdayRaw && birthdayRaw !== "unknown") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdayRaw)) {
      throw Object.assign(new Error("invalid birthday"), { status: 400 });
    }
    birthday = birthdayRaw;
  }
  const keyPrefix = `owners/${me.uuid}/pets/${pet_id}/`;
  if (!storageKey.startsWith(keyPrefix)) {
    throw Object.assign(new Error("invalid avatar_storage_key"), { status: 400 });
  }
  const fileName = storageKey.slice(keyPrefix.length);
  if (!new RegExp(`^${pet_id}_avatar.(jpg|png|webp)$`).test(fileName)) {
    throw Object.assign(new Error("invalid avatar_storage_key"), { status: 400 });
  }
  const base = getPublicMediaBase(env);
  const expectedUrl = `${base}/${storageKey}`;
  if (avatarUrl !== expectedUrl) throw Object.assign(new Error("avatar_url mismatch"), { status: 400 });
  const existing = await db.getPetById(pet_id);
  if (existing) throw Object.assign(new Error("pet already exists"), { status: 409 });
  const currentCount = await db.countActivePetsByOwner(me.uuid);
  if (currentCount >= me.maxPets) throw Object.assign(new Error("pet limit reached"), { status: 409 });
  const head = await env.R2_MEDIA.head(storageKey);
  if (!head) throw Object.assign(new Error("avatar not found"), { status: 404 });
  const asset = await db.createMediaAsset({
    ownerId: me.uuid,
    kind: "image",
    usage: "pet_avatar",
    storageProvider: "r2",
    storageKey,
    url: avatarUrl,
    mimeType: head.httpMetadata?.contentType ?? null,
    sizeBytes: head.size ?? null,
    status: "uploaded"
  });
  const pet = await db.createPet({
    id: pet_id,
    ownerId: me.uuid,
    name,
    class: petClass,
    species,
    breed,
    gender,
    birthday,
    avatarAssetId: asset.id,
    avatarUrl,
    bio
  });
  return pet;
}
__name(createPetForOwner, "createPetForOwner");

// src/api/routes/pets.ts
async function petsCategoriesRoute(_ctx) {
  return okJson(pets_category_default, 200);
}
__name(petsCategoriesRoute, "petsCategoriesRoute");
async function r2PetAvatarUploadRoute(ctx) {
  const me = await requireAuthOwner(ctx);
  const form = await ctx.request.formData().catch(() => null);
  if (!form) return errorJson("invalid form data", 400);
  const petId = (form.get("pet_id") ?? "").toString().trim();
  const file = form.get("file");
  if (!petId || !(file instanceof File)) {
    return errorJson("pet_id and file are required", 400);
  }
  const ext = imageMimeToExt(file.type || "");
  if (!ext) return errorJson("unsupported file type", 422);
  const key = `owners/${me.uuid}/pets/${petId}/${petId}_avatar.${ext}`;
  await ctx.env.R2_MEDIA.put(key, file, { httpMetadata: { contentType: file.type || void 0 } });
  const base = getPublicMediaBase2(ctx.env);
  const publicUrl = `${base}/${key}`;
  return okJson({ storage_key: key, public_url: publicUrl }, 200);
}
__name(r2PetAvatarUploadRoute, "r2PetAvatarUploadRoute");
async function createPetsRoute(ctx) {
  const me = await requireAuthOwner(ctx);
  const body = await ctx.request.json();
  const pet = await createPetForOwner(ctx.db, ctx.env, me, body);
  return okJson(pet, 201);
}
__name(createPetsRoute, "createPetsRoute");
async function petDetailRoute(ctx, params) {
  const pet = await ctx.db.getPetById(params.id);
  if (!pet) return errorJson("Not found", 404);
  const authed = await getUserFromAuthHeader(ctx.db, ctx.request);
  const isFollowing = authed ? await ctx.db.isFollowingPet(authed.uuid, pet.id) : false;
  return okJson({ ...pet, isFollowing }, 200);
}
__name(petDetailRoute, "petDetailRoute");
async function followPetRoute(ctx, params) {
  const me = await requireAuthOwner(ctx);
  const pet = await ctx.db.getPetById(params.id);
  if (!pet) return errorJson("Not found", 404);
  if (await ctx.db.isPetOwnedByOwner(pet.id, me.uuid)) {
    return errorJson("Cannot follow your own pet", 403);
  }
  const followersCount = await ctx.db.followPetTx(me.uuid, pet.id);
  return okJson({ petId: pet.id, isFollowing: true, followersCount }, 200);
}
__name(followPetRoute, "followPetRoute");
async function unfollowPetRoute(ctx, params) {
  const me = await requireAuthOwner(ctx);
  const pet = await ctx.db.getPetById(params.id);
  if (!pet) return errorJson("Not found", 404);
  const followersCount = await ctx.db.unfollowPetTx(me.uuid, pet.id);
  return okJson({ petId: pet.id, isFollowing: false, followersCount }, 200);
}
__name(unfollowPetRoute, "unfollowPetRoute");
async function petFollowersRoute(ctx, params) {
  const pet = await ctx.db.getPetById(params.id);
  if (!pet) return errorJson("Not found", 404);
  const url = new URL(ctx.request.url);
  const limit = Math.min(50, Math.max(1, asNumber(url.searchParams.get("limit"), 20)));
  const cursorRaw = url.searchParams.get("cursor");
  const cursor = cursorRaw && Number.isFinite(Number(cursorRaw)) ? Number(cursorRaw) : null;
  const page = await ctx.db.listPetFollowers(pet.id, limit, cursor);
  return okJson(page, 200);
}
__name(petFollowersRoute, "petFollowersRoute");
function imageMimeToExt(mimeType) {
  switch (mimeType.toLowerCase()) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return null;
  }
}
__name(imageMimeToExt, "imageMimeToExt");
function getPublicMediaBase2(env) {
  const raw = (env.R2_PUBLIC_BASE_URL ?? "https://media.rubypets.com").trim();
  return raw.replace(/\/+$/, "");
}
__name(getPublicMediaBase2, "getPublicMediaBase");
var routes6 = [
  { method: "GET", path: "/pets/categories", handler: petsCategoriesRoute },
  { method: "POST", path: "/r2/pets/avatar/upload", handler: r2PetAvatarUploadRoute },
  { method: "POST", path: "/create-pets", handler: createPetsRoute }
];
var dynamicRoutes4 = [
  { method: "POST", pattern: /^\/pets\/([^/]+)\/follow$/, handler: followPetRoute },
  { method: "DELETE", pattern: /^\/pets\/([^/]+)\/follow$/, handler: unfollowPetRoute },
  { method: "GET", pattern: /^\/pets\/([^/]+)\/followers$/, handler: petFollowersRoute },
  { method: "GET", pattern: /^\/pets\/(?!categories$)([^/]+)$/, handler: petDetailRoute }
];

// src/api/routes/owners.ts
function canonicalPair(a, b) {
  if (a === b) return null;
  const ownerA = a < b ? a : b;
  const ownerB = a < b ? b : a;
  return { ownerA, ownerB, pairKey: `${ownerA}#${ownerB}` };
}
__name(canonicalPair, "canonicalPair");
async function ownersSearchRoute(ctx) {
  const me = await requireAuthOwner(ctx);
  const url = new URL(ctx.request.url);
  const q = (url.searchParams.get("display_name") ?? "").trim().toLowerCase();
  const limit = Math.min(20, Math.max(10, asNumber(url.searchParams.get("limit"), 20)));
  if (q.length < 2) return okJson({ items: [] });
  const items = await ctx.db.searchOwnersByDisplayName(q, limit, me.uuid);
  return okJson({ items });
}
__name(ownersSearchRoute, "ownersSearchRoute");
async function incomingRequestsRoute(ctx) {
  const me = await requireAuthOwner(ctx);
  const items = await ctx.db.listIncomingRequests(me.uuid, 50);
  return okJson({ items });
}
__name(incomingRequestsRoute, "incomingRequestsRoute");
async function outgoingRequestsRoute(ctx) {
  const me = await requireAuthOwner(ctx);
  const items = await ctx.db.listOutgoingRequests(me.uuid, 50);
  return okJson({ items });
}
__name(outgoingRequestsRoute, "outgoingRequestsRoute");
async function friendsListRoute(ctx) {
  const me = await requireAuthOwner(ctx);
  const url = new URL(ctx.request.url);
  const limit = Math.min(100, Math.max(1, asNumber(url.searchParams.get("limit"), 50)));
  const items = await ctx.db.listFriends(me.uuid, limit);
  const payload = items.map((item) => ({
    uuid: item.uuid,
    display_name: item.displayName,
    avatar_url: item.avatarUrl ?? null,
    city: item.city ?? null,
    region: item.region ?? null
  }));
  return okJson({ items: payload });
}
__name(friendsListRoute, "friendsListRoute");
async function friendshipStatusRoute(ctx, params) {
  const me = await requireAuthOwner(ctx);
  const otherId = params.id;
  const pair = canonicalPair(me.uuid, otherId);
  if (!pair) return errorJson("Invalid target", 400);
  const row = await ctx.db.getFriendshipRowByPairKey(pair.pairKey);
  if (!row) return okJson({ status: "none" });
  if (row.status === "accepted") return okJson({ status: "friends" });
  if (row.requestedBy === me.uuid) return okJson({ status: "pending_outgoing" });
  return okJson({ status: "pending_incoming" });
}
__name(friendshipStatusRoute, "friendshipStatusRoute");
async function sendFriendRequestRoute(ctx, params) {
  const me = await requireAuthOwner(ctx);
  const otherId = params.id;
  const pair = canonicalPair(me.uuid, otherId);
  if (!pair) return errorJson("Invalid target", 400);
  const existing = await ctx.db.getFriendshipRowByPairKey(pair.pairKey);
  if (existing) {
    if (existing.status === "accepted") return errorJson("Already friends", 409);
    if (existing.requestedBy === me.uuid) return okJson({ status: "pending_outgoing" });
    return okJson({ status: "pending_incoming" });
  }
  try {
    const friendshipId = await ctx.db.createFriendRequest({
      ownerA: pair.ownerA,
      ownerB: pair.ownerB,
      requestedBy: me.uuid,
      pairKey: pair.pairKey
    });
    if (friendshipId > 0 && otherId !== me.uuid) {
      ctx.ctx.waitUntil(
        notifyFriendRequest({
          env: ctx.env,
          db: ctx.env.DB,
          recipientId: otherId,
          actorId: me.uuid,
          friendshipId
        })
      );
    }
  } catch (err) {
    return errorJson("Failed to create request", 500);
  }
  return okJson({ status: "pending_outgoing" });
}
__name(sendFriendRequestRoute, "sendFriendRequestRoute");
async function cancelFriendRequestRoute(ctx, params) {
  const me = await requireAuthOwner(ctx);
  const pair = canonicalPair(me.uuid, params.id);
  if (!pair) return errorJson("Invalid target", 400);
  const changes = await ctx.db.deletePendingRequest(pair.pairKey, me.uuid);
  if (!changes) return errorJson("Not found", 404);
  return okJson({ status: "none" });
}
__name(cancelFriendRequestRoute, "cancelFriendRequestRoute");
async function acceptFriendRequestRoute(ctx, params) {
  const me = await requireAuthOwner(ctx);
  const pair = canonicalPair(me.uuid, params.id);
  if (!pair) return errorJson("Invalid target", 400);
  const changes = await ctx.db.acceptPendingIncoming(pair.pairKey, me.uuid);
  if (!changes) return errorJson("Not found", 404);
  return okJson({ status: "friends" });
}
__name(acceptFriendRequestRoute, "acceptFriendRequestRoute");
async function rejectFriendRequestRoute(ctx, params) {
  const me = await requireAuthOwner(ctx);
  const pair = canonicalPair(me.uuid, params.id);
  if (!pair) return errorJson("Invalid target", 400);
  const changes = await ctx.db.deletePendingIncoming(pair.pairKey, me.uuid);
  if (!changes) return errorJson("Not found", 404);
  return okJson({ status: "none" });
}
__name(rejectFriendRequestRoute, "rejectFriendRequestRoute");
async function unfriendRoute(ctx, params) {
  const me = await requireAuthOwner(ctx);
  const pair = canonicalPair(me.uuid, params.id);
  if (!pair) return errorJson("Invalid target", 400);
  const changes = await ctx.db.deleteFriendship(pair.pairKey);
  if (!changes) return errorJson("Not found", 404);
  return okJson({ status: "none" });
}
__name(unfriendRoute, "unfriendRoute");
async function ownerDetailRoute(ctx, params) {
  const owner = await ctx.db.getOwnerByUuid(params.id);
  if (!owner) return errorJson("Not found", 404);
  return okJson({
    accountId: owner.accountId,
    uuid: owner.uuid,
    email: owner.email,
    displayName: owner.displayName,
    avatarUrl: owner.avatarUrl,
    maxPets: owner.maxPets,
    createdAt: owner.createdAt,
    updatedAt: owner.updatedAt,
    isActive: owner.isActive,
    city: owner.city ?? null,
    region: owner.region ?? null,
    isVerified: owner.isVerified ?? 0,
    idLicenseFrontUrl: owner.idLicenseFrontUrl ?? null,
    idLicenseBackUrl: owner.idLicenseBackUrl ?? null,
    faceWithLicenseUrl: owner.faceWithLicenseUrl ?? null
  });
}
__name(ownerDetailRoute, "ownerDetailRoute");
async function ownerPetsRoute(ctx, params) {
  const owner = await ctx.db.getOwnerByUuid(params.id);
  if (!owner) return errorJson("Not found", 404);
  const items = await ctx.db.listPetsByOwner(params.id);
  return okJson({ items }, 200);
}
__name(ownerPetsRoute, "ownerPetsRoute");
async function followedPetsRoute(ctx) {
  const me = await requireAuthOwner(ctx);
  const url = new URL(ctx.request.url);
  const limit = Math.min(50, Math.max(1, asNumber(url.searchParams.get("limit"), 20)));
  const cursorRaw = url.searchParams.get("cursor");
  const cursor = cursorRaw && Number.isFinite(Number(cursorRaw)) ? Number(cursorRaw) : null;
  const page = await ctx.db.listFollowedPets(me.uuid, limit, cursor);
  return okJson(page, 200);
}
__name(followedPetsRoute, "followedPetsRoute");
async function ownerLocationRoute(ctx, params) {
  const authed = await getUserFromAuthHeader(ctx.db, ctx.request);
  if (!authed || authed.uuid !== params.id) return errorJson("Forbidden", 403);
  const body = await ctx.request.json();
  if (!body.city || !body.region) return errorJson("city and region are required", 400);
  const owner = await ctx.db.updateOwnerLocation(params.id, body.city, body.region);
  return okJson({
    accountId: owner.accountId,
    uuid: owner.uuid,
    email: owner.email,
    displayName: owner.displayName,
    avatarUrl: owner.avatarUrl,
    maxPets: owner.maxPets,
    createdAt: owner.createdAt,
    updatedAt: owner.updatedAt,
    isActive: owner.isActive,
    city: owner.city ?? null,
    region: owner.region ?? null,
    isVerified: owner.isVerified ?? 0,
    idLicenseFrontUrl: owner.idLicenseFrontUrl ?? null,
    idLicenseBackUrl: owner.idLicenseBackUrl ?? null,
    faceWithLicenseUrl: owner.faceWithLicenseUrl ?? null
  });
}
__name(ownerLocationRoute, "ownerLocationRoute");
async function ownerVerificationDocsRoute(ctx, params) {
  const authed = await getUserFromAuthHeader(ctx.db, ctx.request);
  if (!authed || authed.uuid !== params.id) return errorJson("Forbidden", 403);
  const owner = await ctx.db.getOwnerByUuid(params.id);
  if (!owner) return errorJson("Not found", 404);
  const form = await ctx.request.formData();
  const front = form.get("id_license_front");
  const back = form.get("id_license_back");
  const face = form.get("face_with_license");
  if (!(front instanceof File) || !(back instanceof File) || !(face instanceof File)) {
    return errorJson("all three images are required", 400);
  }
  const accountId = owner.accountId;
  const basePath = `${accountId}/verify_doc/pics`;
  const frontKey = `${basePath}/${accountId}_id_license_front.png`;
  const backKey = `${basePath}/${accountId}_id_license_back.png`;
  const faceKey = `${basePath}/${accountId}_face_with_license.png`;
  await Promise.all([
    ctx.env.R2_MEDIA.put(frontKey, front, { httpMetadata: { contentType: front.type || "image/png" } }),
    ctx.env.R2_MEDIA.put(backKey, back, { httpMetadata: { contentType: back.type || "image/png" } }),
    ctx.env.R2_MEDIA.put(faceKey, face, { httpMetadata: { contentType: face.type || "image/png" } })
  ]);
  const publicBase = ctx.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "");
  const toUrl = /* @__PURE__ */ __name((key) => publicBase ? `${publicBase}/${key}` : key, "toUrl");
  const frontUrl = toUrl(frontKey);
  const backUrl = toUrl(backKey);
  const faceUrl = toUrl(faceKey);
  await ctx.db.updateAccountVerificationUrls(accountId, {
    frontUrl,
    backUrl,
    faceUrl,
    setPending: true
  });
  return okJson(
    {
      idLicenseFrontUrl: frontUrl,
      idLicenseBackUrl: backUrl,
      faceWithLicenseUrl: faceUrl
    },
    200
  );
}
__name(ownerVerificationDocsRoute, "ownerVerificationDocsRoute");
var routes7 = [
  { method: "GET", path: "/owners/search", handler: ownersSearchRoute },
  { method: "GET", path: "/me/followed-pets", handler: followedPetsRoute },
  { method: "GET", path: "/friendships/incoming", handler: incomingRequestsRoute },
  { method: "GET", path: "/friendships/outgoing", handler: outgoingRequestsRoute },
  { method: "GET", path: "/friendships/friends", handler: friendsListRoute }
];
var dynamicRoutes5 = [
  { method: "GET", pattern: /^\/owners\/(?!search$)([^/]+)$/, handler: ownerDetailRoute },
  { method: "GET", pattern: /^\/owners\/([^/]+)\/pets$/, handler: ownerPetsRoute },
  { method: "POST", pattern: /^\/owners\/([^/]+)\/location$/, handler: ownerLocationRoute },
  { method: "POST", pattern: /^\/owners\/([^/]+)\/verification-docs$/, handler: ownerVerificationDocsRoute },
  { method: "GET", pattern: /^\/owners\/([^/]+)\/friendship\/status$/, handler: friendshipStatusRoute },
  { method: "POST", pattern: /^\/owners\/([^/]+)\/friend-request$/, handler: sendFriendRequestRoute },
  { method: "DELETE", pattern: /^\/owners\/([^/]+)\/friend-request$/, handler: cancelFriendRequestRoute },
  { method: "POST", pattern: /^\/owners\/([^/]+)\/friend-request\/accept$/, handler: acceptFriendRequestRoute },
  { method: "DELETE", pattern: /^\/owners\/([^/]+)\/friend-request\/reject$/, handler: rejectFriendRequestRoute },
  { method: "DELETE", pattern: /^\/owners\/([^/]+)\/friendship$/, handler: unfriendRoute }
];

// src/api/routes/chat.ts
var MAX_MESSAGE_LENGTH = 500;
async function listThreadsRoute(ctx) {
  const me = await requireAuthOwner(ctx);
  const url = new URL(ctx.request.url);
  const limit = asNumber(url.searchParams.get("limit"), 30);
  const cursor = url.searchParams.get("cursor");
  const includeArchived = url.searchParams.get("archived") === "1";
  const page = await ctx.db.listChatThreadsForOwner(me.uuid, limit, cursor, includeArchived);
  const items = await Promise.all(
    page.items.map(async (item) => {
      const isFriend = await ctx.db.isFriends(me.uuid, item.otherOwner.uuid);
      return serializeThreadItem(item, isFriend);
    })
  );
  return okJson({ items, nextCursor: page.nextCursor }, 200);
}
__name(listThreadsRoute, "listThreadsRoute");
async function getThreadRoute(ctx, params) {
  const me = await requireAuthOwner(ctx);
  const thread = await ctx.db.getChatThreadForOwner(params.id, me.uuid);
  if (!thread) return errorJson("thread not found", 404);
  const isFriend = await ctx.db.isFriends(me.uuid, thread.otherOwner.uuid);
  return okJson(serializeThreadItem(thread, isFriend), 200);
}
__name(getThreadRoute, "getThreadRoute");
async function createThreadRoute(ctx) {
  const me = await requireAuthOwner(ctx);
  const payload = await ctx.request.json().catch(() => ({}));
  const otherOwnerId = (payload.otherOwnerId ?? "").trim();
  const firstMessageText = (payload.firstMessageText ?? "").trim();
  if (!otherOwnerId) return errorJson("otherOwnerId required", 400);
  if (otherOwnerId === me.uuid) return errorJson("invalid otherOwnerId", 400);
  if (firstMessageText && firstMessageText.length > MAX_MESSAGE_LENGTH) {
    return errorJson("firstMessageText too long", 400);
  }
  const otherOwner = await ctx.db.getOwnerByUuid(otherOwnerId);
  if (!otherOwner) return errorJson("owner not found", 404);
  const pairKey = buildPairKey(me.uuid, otherOwnerId);
  let thread = await ctx.db.getChatThreadByPairKey(pairKey);
  if (!thread) {
    const isFriend2 = await ctx.db.isFriends(me.uuid, otherOwnerId);
    const requestState = isFriend2 ? "accepted" : "pending";
    if (!isFriend2 && !firstMessageText) {
      return errorJson("firstMessageText required", 400);
    }
    const ownerAId = me.uuid < otherOwnerId ? me.uuid : otherOwnerId;
    const ownerBId = me.uuid < otherOwnerId ? otherOwnerId : me.uuid;
    const threadId = crypto.randomUUID();
    try {
      thread = await ctx.db.createChatThread({
        threadId,
        ownerAId,
        ownerBId,
        pairKey,
        requestState,
        requestSenderId: requestState === "pending" ? me.uuid : null,
        requestMessageId: null,
        lastMessageId: null,
        lastActivityAt: null
      });
    } catch (err) {
      thread = await ctx.db.getChatThreadByPairKey(pairKey);
      if (!thread) throw err;
    }
    await ctx.db.upsertChatParticipants(thread.id, ownerAId, ownerBId);
    if (firstMessageText) {
      const message2 = await ctx.db.insertChatMessage(thread.id, me.uuid, firstMessageText);
      await ctx.db.updateChatThreadOnNewMessage(thread.id, message2.id, {
        requestMessageId: requestState === "pending" ? message2.id : null,
        requestSenderId: requestState === "pending" ? me.uuid : null
      });
    }
  } else {
    await ctx.db.setParticipantDeleted(thread.id, me.uuid, null);
    await ctx.db.setParticipantArchived(thread.id, me.uuid, null);
    if (firstMessageText && thread.requestState === "pending" && thread.requestSenderId === me.uuid && !thread.requestMessageId) {
      const message2 = await ctx.db.insertChatMessage(thread.id, me.uuid, firstMessageText);
      await ctx.db.updateChatThreadOnNewMessage(thread.id, message2.id, {
        requestMessageId: message2.id,
        requestSenderId: me.uuid
      });
    }
  }
  const detail = await ctx.db.getChatThreadForOwner(thread.id, me.uuid);
  if (!detail) return errorJson("thread not found", 404);
  const isFriend = await ctx.db.isFriends(me.uuid, detail.otherOwner.uuid);
  return okJson(serializeThreadItem(detail, isFriend), 200);
}
__name(createThreadRoute, "createThreadRoute");
async function listMessagesRoute(ctx, params) {
  const me = await requireAuthOwner(ctx);
  const participant = await ctx.db.getChatParticipant(params.id, me.uuid);
  if (!participant) return errorJson("forbidden", 403);
  const url = new URL(ctx.request.url);
  const limit = asNumber(url.searchParams.get("limit"), 30);
  const before = url.searchParams.get("before");
  const page = await ctx.db.listChatMessages(params.id, limit, before);
  return okJson(page, 200);
}
__name(listMessagesRoute, "listMessagesRoute");
async function acceptRequestRoute(ctx, params) {
  return updateRequestState(ctx, params.id, "accepted");
}
__name(acceptRequestRoute, "acceptRequestRoute");
async function rejectRequestRoute(ctx, params) {
  return updateRequestState(ctx, params.id, "rejected");
}
__name(rejectRequestRoute, "rejectRequestRoute");
async function archiveThreadRoute(ctx, params) {
  const me = await requireAuthOwner(ctx);
  const participant = await ctx.db.getChatParticipant(params.id, me.uuid);
  if (!participant) return errorJson("forbidden", 403);
  await ctx.db.setParticipantArchived(params.id, me.uuid, (/* @__PURE__ */ new Date()).toISOString());
  return okJson(null, 200);
}
__name(archiveThreadRoute, "archiveThreadRoute");
async function deleteThreadRoute(ctx, params) {
  const me = await requireAuthOwner(ctx);
  const participant = await ctx.db.getChatParticipant(params.id, me.uuid);
  if (!participant) return errorJson("forbidden", 403);
  await ctx.db.setParticipantDeleted(params.id, me.uuid, (/* @__PURE__ */ new Date()).toISOString());
  return okJson(null, 200);
}
__name(deleteThreadRoute, "deleteThreadRoute");
async function wsThreadRoute(ctx, params) {
  const upgrade = ctx.request.headers.get("Upgrade");
  if (!upgrade || upgrade.toLowerCase() !== "websocket") {
    return errorJson("Expected websocket", 426);
  }
  const doId = ctx.env.CHAT_THREAD_DO.idFromName(params.id);
  const stub = ctx.env.CHAT_THREAD_DO.get(doId);
  return stub.fetch(ctx.request);
}
__name(wsThreadRoute, "wsThreadRoute");
async function updateRequestState(ctx, threadId, nextState) {
  const me = await requireAuthOwner(ctx);
  const thread = await ctx.db.getChatThreadById(threadId);
  if (!thread) return errorJson("thread not found", 404);
  const participant = await ctx.db.getChatParticipant(threadId, me.uuid);
  if (!participant) return errorJson("forbidden", 403);
  if (thread.requestState !== "pending") {
    return errorJson("invalid request state", 409);
  }
  if (thread.requestSenderId && thread.requestSenderId === me.uuid) {
    return errorJson("forbidden", 403);
  }
  await ctx.db.updateChatThreadRequestState(threadId, nextState);
  await notifyThreadUpdated(ctx, threadId);
  return okJson(null, 200);
}
__name(updateRequestState, "updateRequestState");
async function notifyThreadUpdated(ctx, threadId) {
  try {
    const base = new URL(ctx.request.url);
    const target = new URL(`/ws/threads/${threadId}?action=thread_updated`, base.origin);
    const doId = ctx.env.CHAT_THREAD_DO.idFromName(threadId);
    const stub = ctx.env.CHAT_THREAD_DO.get(doId);
    await stub.fetch(
      new Request(target.toString(), {
        method: "POST",
        headers: ctx.request.headers
      })
    );
  } catch (err) {
    console.error("notifyThreadUpdated failed", err);
  }
}
__name(notifyThreadUpdated, "notifyThreadUpdated");
function serializeThreadItem(item, isFriend) {
  const fallbackUnread = !!item.lastMessageId && item.lastMessageId !== item.lastReadMessageId;
  const unreadCount = item.unreadCount ?? (fallbackUnread ? 1 : 0);
  const unread = unreadCount > 0;
  return {
    threadId: item.threadId,
    otherOwner: item.otherOwner,
    requestState: item.requestState,
    requestSenderId: item.requestSenderId ?? null,
    requestMessageId: item.requestMessageId ?? null,
    lastMessageId: item.lastMessageId ?? null,
    lastMessagePreview: item.lastMessagePreview ?? null,
    lastActivityAt: item.lastActivityAt ?? null,
    unreadCount,
    unread,
    archived: !!item.archivedAt,
    deleted: !!item.deletedAt,
    isFriend
  };
}
__name(serializeThreadItem, "serializeThreadItem");
function buildPairKey(ownerA, ownerB) {
  return ownerA < ownerB ? `${ownerA}:${ownerB}` : `${ownerB}:${ownerA}`;
}
__name(buildPairKey, "buildPairKey");
var routes8 = [
  { method: "GET", path: "/chat/threads", handler: listThreadsRoute },
  { method: "POST", path: "/chat/threads", handler: createThreadRoute }
];
var dynamicRoutes6 = [
  { method: "GET", pattern: /^\/chat\/threads\/([^/]+)$/, handler: getThreadRoute },
  { method: "GET", pattern: /^\/chat\/threads\/([^/]+)\/messages$/, handler: listMessagesRoute },
  { method: "POST", pattern: /^\/chat\/threads\/([^/]+)\/request\/accept$/, handler: acceptRequestRoute },
  { method: "POST", pattern: /^\/chat\/threads\/([^/]+)\/request\/reject$/, handler: rejectRequestRoute },
  { method: "POST", pattern: /^\/chat\/threads\/([^/]+)\/archive$/, handler: archiveThreadRoute },
  { method: "POST", pattern: /^\/chat\/threads\/([^/]+)\/delete$/, handler: deleteThreadRoute },
  { method: "GET", pattern: /^\/ws\/threads\/([^/]+)$/, handler: wsThreadRoute }
];

// src/api/routes/notifications.ts
async function registerPushTokenRoute(ctx) {
  const me = await requireAuthOwner(ctx);
  const body = await ctx.request.json().catch(() => ({}));
  const platform = body.platform;
  const fcmToken = (body.fcm_token ?? "").trim();
  if (!platform || !["ios", "android"].includes(platform)) return errorJson("invalid platform", 400);
  if (!fcmToken) return errorJson("fcm_token required", 400);
  await registerPushToken(ctx.env.DB, me.uuid, platform, fcmToken);
  return okJson({ fcm_token: fcmToken }, 200);
}
__name(registerPushTokenRoute, "registerPushTokenRoute");
async function unregisterPushTokenRoute(ctx) {
  const me = await requireAuthOwner(ctx);
  const body = await ctx.request.json().catch(() => ({}));
  const fcmToken = (body.fcm_token ?? "").trim();
  if (!fcmToken) return errorJson("fcm_token required", 400);
  await unregisterPushToken(ctx.env.DB, fcmToken);
  return okJson({ fcm_token: fcmToken, owner_id: me.uuid }, 200);
}
__name(unregisterPushTokenRoute, "unregisterPushTokenRoute");
async function listNotificationsRoute(ctx) {
  const me = await requireAuthOwner(ctx);
  const url = new URL(ctx.request.url);
  const limit = Math.min(50, Math.max(1, asNumber(url.searchParams.get("limit"), 20)));
  const cursorRaw = url.searchParams.get("cursor");
  const cursor = parseCursor(cursorRaw);
  const rows = await listNotifications(ctx.env.DB, me.uuid, limit, cursor);
  const items = await Promise.all(
    rows.items.map(async (row) => {
      const actors = await listActors(ctx.env.DB, row.id, 3);
      return {
        id: row.id,
        type: row.type,
        actor_count: row.actor_count,
        actors,
        post_id: row.post_id ?? "",
        comment_id: row.comment_id ?? "",
        friendship_id: row.friendship_id ? String(row.friendship_id) : "",
        is_read: row.is_read === 1,
        latest_action_at: row.latest_action_at ?? row.created_at,
        created_at: row.created_at
      };
    })
  );
  return okJson({ items, nextCursor: rows.nextCursor }, 200);
}
__name(listNotificationsRoute, "listNotificationsRoute");
async function markReadRoute(ctx, params) {
  const me = await requireAuthOwner(ctx);
  const id = params.id;
  const ts = (/* @__PURE__ */ new Date()).toISOString();
  const res = await ctx.env.DB.prepare(
    `
      update notifications
      set is_read = 1, read_at = ?, updated_at = ?
      where id = ? and recipient_owner_id = ?
      `
  ).bind(ts, ts, id, me.uuid).run();
  const changes = res?.meta?.changes ?? 0;
  if (!changes) return errorJson("Not found", 404);
  return okJson({ id }, 200);
}
__name(markReadRoute, "markReadRoute");
async function markAllReadRoute(ctx) {
  const me = await requireAuthOwner(ctx);
  const ts = (/* @__PURE__ */ new Date()).toISOString();
  await ctx.env.DB.prepare(
    `
      update notifications
      set is_read = 1, read_at = ?, updated_at = ?
      where recipient_owner_id = ? and is_hidden = 0 and is_read = 0
      `
  ).bind(ts, ts, me.uuid).run();
  return okJson({ ok: true }, 200);
}
__name(markAllReadRoute, "markAllReadRoute");
async function hideNotificationRoute(ctx, params) {
  const me = await requireAuthOwner(ctx);
  const id = params.id;
  const ts = (/* @__PURE__ */ new Date()).toISOString();
  const res = await ctx.env.DB.prepare(
    `
      update notifications
      set is_hidden = 1, hidden_at = ?, updated_at = ?
      where id = ? and recipient_owner_id = ?
      `
  ).bind(ts, ts, id, me.uuid).run();
  const changes = res?.meta?.changes ?? 0;
  if (!changes) return errorJson("Not found", 404);
  return okJson({ id }, 200);
}
__name(hideNotificationRoute, "hideNotificationRoute");
function parseCursor(value) {
  if (!value) return null;
  const [ts, id] = value.split("|");
  if (!ts || !id) return null;
  return { ts, id };
}
__name(parseCursor, "parseCursor");
function toCursor(row) {
  return `${row.sort_ts}|${row.id}`;
}
__name(toCursor, "toCursor");
async function listNotifications(db, ownerId, limit, cursor) {
  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const sortExpr = "coalesce(latest_action_at, created_at)";
  let sql = `
    select
      id, type, actor_count, latest_action_at, post_id, comment_id, friendship_id,
      is_read, is_hidden, created_at,
      ${sortExpr} as sort_ts
    from notifications
    where recipient_owner_id = ? and is_hidden = 0
  `;
  const params = [ownerId];
  if (cursor) {
    sql += ` and (${sortExpr} < ? or (${sortExpr} = ? and id < ?))`;
    params.push(cursor.ts, cursor.ts, cursor.id);
  }
  sql += ` order by ${sortExpr} desc, id desc limit ?`;
  params.push(safeLimit + 1);
  const { results } = await db.prepare(sql).bind(...params).all();
  const rows = results ?? [];
  const hasMore = rows.length > safeLimit;
  const pageRows = hasMore ? rows.slice(0, safeLimit) : rows;
  const nextCursor = hasMore && pageRows.length > 0 ? toCursor(pageRows[pageRows.length - 1]) : null;
  return { items: pageRows, nextCursor };
}
__name(listNotifications, "listNotifications");
async function listActors(db, notificationId, limit) {
  const { results } = await db.prepare(
    `
      select na.actor_owner_id, o.display_name
      from notification_actors na
      join owners o on o.uuid = na.actor_owner_id
      where na.notification_id = ?
      order by na.last_action_at desc
      limit ?
      `
  ).bind(notificationId, limit).all();
  return (results ?? []).map((row) => ({
    ownerId: row.actor_owner_id,
    displayName: row.display_name
  }));
}
__name(listActors, "listActors");
var routes9 = [
  { method: "POST", path: "/push-tokens/register", handler: registerPushTokenRoute },
  { method: "POST", path: "/push-tokens/unregister", handler: unregisterPushTokenRoute },
  { method: "GET", path: "/notifications", handler: listNotificationsRoute },
  { method: "POST", path: "/notifications/mark-all-read", handler: markAllReadRoute }
];
var dynamicRoutes7 = [
  { method: "POST", pattern: /^\/notifications\/([^/]+)\/read$/, handler: markReadRoute },
  { method: "DELETE", pattern: /^\/notifications\/([^/]+)$/, handler: hideNotificationRoute }
];

// src/api/router.ts
var routes10 = [
  ...routes,
  ...routes3,
  ...routes2,
  ...routes6,
  ...routes7,
  ...routes4,
  ...routes5,
  ...routes8,
  ...routes9
];
var dynamicRoutes8 = [
  ...dynamicRoutes5,
  ...dynamicRoutes4,
  ...dynamicRoutes3,
  ...dynamicRoutes,
  ...dynamicRoutes2,
  ...dynamicRoutes6,
  ...dynamicRoutes7
];
async function handleRequest(request, env, ctx) {
  if (isOptions(request)) return okResponse();
  const url = new URL(request.url);
  const pathname = normalizePath(stripApiPrefix(url.pathname));
  const dynamic = matchDynamicRoute(request.method, pathname);
  if (dynamic) {
    const db2 = createDB(env);
    try {
      const response = await dynamic.handler({ request, env, ctx, db: db2 }, dynamic.params);
      return withCors(response);
    } catch (err) {
      const status = err.status;
      if (status) {
        const message2 = err.message || "Unexpected error";
        return withCors(errorJson(message2, status));
      }
      console.error("Request failed", err);
      return withCors(errorJson("Unexpected error", 500));
    }
  }
  const route = routes10.find((entry) => entry.method === request.method && entry.path === pathname);
  if (!route) {
    return withCors(errorJson("Not found", 404));
  }
  const db = createDB(env);
  try {
    const response = await route.handler({ request, env, ctx, db });
    return withCors(response);
  } catch (err) {
    const status = err.status;
    if (status) {
      const message2 = err.message || "Unexpected error";
      return withCors(errorJson(message2, status));
    }
    console.error("Request failed", err);
    return withCors(errorJson("Unexpected error", 500));
  }
}
__name(handleRequest, "handleRequest");
function normalizePath(path) {
  if (path === "/") return path;
  return path.endsWith("/") ? path.slice(0, -1) : path;
}
__name(normalizePath, "normalizePath");
function stripApiPrefix(path) {
  if (!path.startsWith("/api")) return path;
  const next = path.slice("/api".length);
  return next.startsWith("/") ? next : `/${next}`;
}
__name(stripApiPrefix, "stripApiPrefix");
function matchDynamicRoute(method, pathname) {
  for (const route of dynamicRoutes8) {
    if (route.method !== method) continue;
    const m = pathname.match(route.pattern);
    if (m) {
      return { handler: route.handler, params: { id: m[1] } };
    }
  }
  return null;
}
__name(matchDynamicRoute, "matchDynamicRoute");

// src/do/chat-thread-do.ts
var ChatThreadDO = class {
  constructor(state, env) {
    this.sockets = /* @__PURE__ */ new Map();
    this.state = state;
    this.env = env;
    this.db = new D1Client(env.DB);
    for (const socket of this.state.getWebSockets()) {
      const restored = this.restoreClientInfo(socket);
      if (restored) {
        this.sockets.set(socket, restored);
      } else {
        socket.close(1011, "Missing session");
      }
    }
  }
  static {
    __name(this, "ChatThreadDO");
  }
  async fetch(request) {
    const url = new URL(request.url);
    const action = url.searchParams.get("action");
    if (action) {
      return this.handleAction(action, request, url);
    }
    const upgrade = request.headers.get("Upgrade");
    if (!upgrade || upgrade.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    const ownerId = this.resolveOwnerId(request, url);
    if (!ownerId) {
      return new Response("Unauthorized", { status: 401 });
    }
    const threadId = extractThreadId(url.pathname);
    if (!threadId) {
      return new Response("Invalid thread id", { status: 400 });
    }
    const participant = await this.db.getChatParticipant(threadId, ownerId);
    if (!participant) {
      return new Response("Forbidden", { status: 403 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server);
    server.serializeAttachment?.({ ownerId, threadId });
    this.sockets.set(server, { ownerId, threadId });
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(ws, message2) {
    let info = this.sockets.get(ws);
    if (!info) {
      const restored = this.restoreClientInfo(ws);
      if (restored) {
        this.sockets.set(ws, restored);
        info = restored;
      }
    }
    if (!info) {
      ws.close(1008, "Unknown session");
      return;
    }
    const text = typeof message2 === "string" ? message2 : new TextDecoder().decode(message2);
    const payload = safeJson(text);
    if (!payload || typeof payload.type !== "string") {
      this.sendError(ws, "Invalid payload");
      return;
    }
    try {
      switch (payload.type) {
        case "send":
          await this.handleSend(ws, info, payload);
          return;
        case "read":
          await this.handleRead(ws, info, payload);
          return;
        case "accept_request":
          await this.handleRequestDecision(ws, info, "accepted");
          return;
        case "reject_request":
          await this.handleRequestDecision(ws, info, "rejected");
          return;
        case "ping":
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        default:
          this.sendError(ws, "Unsupported message type");
      }
    } catch (err) {
      console.error("ChatThreadDO message failed", err);
      this.sendError(ws, "Unexpected error");
    }
  }
  webSocketClose(ws) {
    this.sockets.delete(ws);
  }
  webSocketError(ws) {
    this.sockets.delete(ws);
  }
  async handleAction(action, request, url) {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }
    if (action !== "thread_updated") {
      return new Response("Not found", { status: 404 });
    }
    const ownerId = this.resolveOwnerId(request, url);
    if (!ownerId) {
      return new Response("Unauthorized", { status: 401 });
    }
    const threadId = extractThreadId(url.pathname);
    if (!threadId) {
      return new Response("Invalid thread id", { status: 400 });
    }
    const participant = await this.db.getChatParticipant(threadId, ownerId);
    if (!participant) {
      return new Response("Forbidden", { status: 403 });
    }
    const thread = await this.db.getChatThreadById(threadId);
    if (!thread) {
      return new Response("Not found", { status: 404 });
    }
    this.broadcast({
      type: "thread_updated",
      thread: {
        id: thread.id,
        request_state: thread.requestState,
        request_sender_id: thread.requestSenderId ?? null,
        request_message_id: thread.requestMessageId ?? null,
        last_message_id: thread.lastMessageId ?? null,
        last_activity_at: thread.lastActivityAt ?? null
      }
    });
    return new Response("ok", { status: 200 });
  }
  async handleSend(ws, info, payload) {
    const rawBody = (payload.body_text ?? "").trim();
    if (!rawBody) {
      this.sendError(ws, "body_text required");
      return;
    }
    if (rawBody.length > 500) {
      this.sendError(ws, "body_text too long");
      return;
    }
    const thread = await this.db.getChatThreadById(info.threadId);
    if (!thread) {
      this.sendError(ws, "thread not found");
      return;
    }
    const state = thread.requestState;
    if (state === "pending") {
      if (thread.requestSenderId && thread.requestSenderId !== info.ownerId) {
        this.sendError(ws, "request pending");
        return;
      }
      if (thread.requestMessageId) {
        this.sendError(ws, "request already sent");
        return;
      }
    }
    if (state === "rejected") {
      this.sendError(ws, "request rejected");
      return;
    }
    const message2 = await this.db.insertChatMessage(info.threadId, info.ownerId, rawBody);
    const shouldSetRequestMessage = state === "pending" && !thread.requestMessageId;
    await this.db.updateChatThreadOnNewMessage(info.threadId, message2.id, {
      requestMessageId: shouldSetRequestMessage ? message2.id : null,
      requestSenderId: state === "pending" && !thread.requestSenderId ? info.ownerId : null
    });
    await this.db.clearParticipantsArchiveDeleted(info.threadId);
    const updated = await this.db.getChatThreadById(info.threadId);
    this.broadcast({
      type: "message_new",
      message: {
        id: message2.id,
        thread_id: message2.threadId,
        sender_id: message2.senderId,
        body_text: message2.bodyText,
        created_at: message2.createdAt
      }
    });
    if (updated) {
      this.broadcast({
        type: "thread_updated",
        thread: {
          id: updated.id,
          request_state: updated.requestState,
          request_sender_id: updated.requestSenderId ?? null,
          request_message_id: updated.requestMessageId ?? null,
          last_message_id: updated.lastMessageId ?? null,
          last_activity_at: updated.lastActivityAt ?? null
        }
      });
    }
  }
  async handleRead(ws, info, payload) {
    const messageId = (payload.last_read_message_id ?? "").trim();
    if (!messageId) {
      this.sendError(ws, "last_read_message_id required");
      return;
    }
    await this.db.setParticipantLastRead(info.threadId, info.ownerId, messageId);
    this.broadcastExceptOwner(info.ownerId, {
      type: "read_updated",
      owner_id: info.ownerId,
      last_read_message_id: messageId
    });
  }
  async handleRequestDecision(ws, info, nextState) {
    const thread = await this.db.getChatThreadById(info.threadId);
    if (!thread) {
      this.sendError(ws, "thread not found");
      return;
    }
    if (thread.requestState !== "pending") {
      this.sendError(ws, "invalid request state");
      return;
    }
    if (thread.requestSenderId && thread.requestSenderId === info.ownerId) {
      this.sendError(ws, "forbidden");
      return;
    }
    await this.db.updateChatThreadRequestState(info.threadId, nextState);
    const updated = await this.db.getChatThreadById(info.threadId);
    if (!updated) return;
    this.broadcast({
      type: "thread_updated",
      thread: {
        id: updated.id,
        request_state: updated.requestState,
        request_sender_id: updated.requestSenderId ?? null,
        request_message_id: updated.requestMessageId ?? null,
        last_message_id: updated.lastMessageId ?? null,
        last_activity_at: updated.lastActivityAt ?? null
      }
    });
  }
  broadcast(payload) {
    const message2 = JSON.stringify(payload);
    for (const socket of this.sockets.keys()) {
      try {
        socket.send(message2);
      } catch {
        this.sockets.delete(socket);
      }
    }
  }
  broadcastExceptOwner(ownerId, payload) {
    const message2 = JSON.stringify(payload);
    for (const [socket, info] of this.sockets.entries()) {
      if (info.ownerId === ownerId) continue;
      try {
        socket.send(message2);
      } catch {
        this.sockets.delete(socket);
      }
    }
  }
  sendError(ws, message2) {
    ws.send(JSON.stringify({ type: "error", message: message2 }));
  }
  resolveOwnerId(request, url) {
    const header = request.headers.get("authorization");
    const token = header && header.toLowerCase().startsWith("bearer ") ? header.slice("bearer ".length).trim() : url.searchParams.get("token")?.trim();
    if (!token) return null;
    return parseUserIdFromToken(token);
  }
  restoreClientInfo(ws) {
    const attachment = ws.deserializeAttachment?.();
    if (!attachment || typeof attachment !== "object") return null;
    const ownerId = attachment.ownerId;
    const threadId = attachment.threadId;
    if (typeof ownerId !== "string" || typeof threadId !== "string") return null;
    return { ownerId, threadId };
  }
};
function safeJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
__name(safeJson, "safeJson");
function extractThreadId(pathname) {
  const match = pathname.match(/\/ws\/threads\/([^/]+)/);
  if (match && match[1]) return match[1];
  const parts = pathname.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : null;
}
__name(extractThreadId, "extractThreadId");

// src/index.ts
var src_default = {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  }
};

// ../node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-RoT4Ec/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// ../node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-RoT4Ec/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  ChatThreadDO,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
