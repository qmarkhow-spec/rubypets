import { fcmSend } from "../lib/fcm";

export type NotificationType = "post_like" | "comment_like" | "post_comment" | "comment_reply" | "friend_request";

type FcmEnv = {
  FCM_SERVICE_ACCOUNT_JSON?: string;
  FCM_PROJECT_ID?: string;
};

type PushTokenRow = { fcm_token: string; platform: string };

type NotificationRow = {
  id: string;
  type: NotificationType;
  recipient_owner_id: string;
  actor_count: number;
  latest_actor_owner_id: string | null;
  latest_action_at: string | null;
  post_id: string | null;
  comment_id: string | null;
  friendship_id: number | null;
  created_at: string;
};

type ActorRow = { actor_owner_id: string; display_name: string };

const nowIso = () => new Date().toISOString();

export async function registerPushToken(
  db: D1Database,
  ownerId: string,
  platform: "ios" | "android",
  fcmToken: string
): Promise<void> {
  const ts = nowIso();
  await db
    .prepare(
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
    )
    .bind(ownerId, platform, fcmToken, ts, ts, ts)
    .run();
}

export async function unregisterPushToken(db: D1Database, fcmToken: string): Promise<void> {
  const ts = nowIso();
  await db
    .prepare(
      `
      update push_tokens set is_active = 0, updated_at = ?
      where fcm_token = ?
      `
    )
    .bind(ts, fcmToken)
    .run();
}

export async function listActivePushTokens(db: D1Database, ownerId: string): Promise<PushTokenRow[]> {
  const { results } = await db
    .prepare(
      `
      select fcm_token, platform
      from push_tokens
      where owner_id = ? and is_active = 1
      `
    )
    .bind(ownerId)
    .all<PushTokenRow>();
  return results ?? [];
}

export async function notifyPostLike(args: {
  env: FcmEnv;
  db: D1Database;
  recipientId: string;
  actorId: string;
  postId: string;
}): Promise<void> {
  await notifyAggregated({
    ...args,
    type: "post_like",
    groupKey: `post_like:${args.recipientId}:${args.postId}`,
    postId: args.postId
  });
}

export async function notifyCommentLike(args: {
  env: FcmEnv;
  db: D1Database;
  recipientId: string;
  actorId: string;
  postId: string;
  commentId: string;
}): Promise<void> {
  await notifyAggregated({
    ...args,
    type: "comment_like",
    groupKey: `comment_like:${args.recipientId}:${args.commentId}`,
    postId: args.postId,
    commentId: args.commentId
  });
}

export async function notifyPostComment(args: {
  env: FcmEnv;
  db: D1Database;
  recipientId: string;
  actorId: string;
  postId: string;
}): Promise<void> {
  await notifySingle({
    ...args,
    type: "post_comment",
    postId: args.postId
  });
}

export async function notifyCommentReply(args: {
  env: FcmEnv;
  db: D1Database;
  recipientId: string;
  actorId: string;
  postId: string;
  commentId: string;
}): Promise<void> {
  await notifySingle({
    ...args,
    type: "comment_reply",
    postId: args.postId,
    commentId: args.commentId
  });
}

export async function notifyFriendRequest(args: {
  env: FcmEnv;
  db: D1Database;
  recipientId: string;
  actorId: string;
  friendshipId: number;
}): Promise<void> {
  await notifySingle({
    ...args,
    type: "friend_request",
    friendshipId: args.friendshipId
  });
}

type AggregatedArgs = {
  env: FcmEnv;
  db: D1Database;
  type: NotificationType;
  recipientId: string;
  actorId: string;
  groupKey: string;
  postId?: string;
  commentId?: string;
};

type SingleArgs = {
  env: FcmEnv;
  db: D1Database;
  type: NotificationType;
  recipientId: string;
  actorId: string;
  postId?: string;
  commentId?: string;
  friendshipId?: number;
};

async function notifyAggregated(args: AggregatedArgs): Promise<void> {
  const { db } = args;
  const ts = nowIso();
  const id = crypto.randomUUID();

  await db
    .prepare(
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
    )
    .bind(
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
    )
    .run();

  const notifRow = await db
    .prepare(`select id from notifications where group_key = ?`)
    .bind(args.groupKey)
    .first<{ id: string }>();

  const notificationId = notifRow?.id ?? id;

  await db
    .prepare(
      `
      insert into notification_actors (notification_id, actor_owner_id, first_action_at, last_action_at)
      values (?, ?, ?, ?)
      on conflict(notification_id, actor_owner_id) do update set
        last_action_at = excluded.last_action_at
      `
    )
    .bind(notificationId, args.actorId, ts, ts)
    .run();

  await db
    .prepare(
      `
      update notifications
      set actor_count = (select count(*) from notification_actors where notification_id = ?)
      where id = ?
      `
    )
    .bind(notificationId, notificationId)
    .run();

  const row = await db
    .prepare(
      `
      select id, type, recipient_owner_id, actor_count, latest_actor_owner_id, latest_action_at, post_id, comment_id, friendship_id, created_at
      from notifications where id = ?
      `
    )
    .bind(notificationId)
    .first<NotificationRow>();

  if (!row) return;
  await pushNotification(args.env, db, row);
}

async function notifySingle(args: SingleArgs): Promise<void> {
  const { db } = args;
  const ts = nowIso();
  const id = crypto.randomUUID();

  await db
    .prepare(
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
    )
    .bind(
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
    )
    .run();

  await db
    .prepare(
      `
      insert into notification_actors (notification_id, actor_owner_id, first_action_at, last_action_at)
      values (?, ?, ?, ?)
      `
    )
    .bind(id, args.actorId, ts, ts)
    .run();

  const row: NotificationRow = {
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

async function pushNotification(env: FcmEnv, db: D1Database, notif: NotificationRow): Promise<void> {
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
      const message = {
        token: tokenRow.fcm_token,
        notification: {
          title: "Rubypets",
          body
        },
        data
      };

      let resp: Response | null = null;
      let text = "";
      try {
        resp = await fcmSend(fcmEnv, message);
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

function requireFcmEnv(env: FcmEnv): { FCM_SERVICE_ACCOUNT_JSON: string; FCM_PROJECT_ID: string } {
  if (!env.FCM_SERVICE_ACCOUNT_JSON || !env.FCM_PROJECT_ID) {
    throw new Error("FCM not configured");
  }
  return {
    FCM_SERVICE_ACCOUNT_JSON: env.FCM_SERVICE_ACCOUNT_JSON,
    FCM_PROJECT_ID: env.FCM_PROJECT_ID
  };
}

async function listTopActors(db: D1Database, notificationId: string, limit: number): Promise<string[]> {
  const { results } = await db
    .prepare(
      `
      select na.actor_owner_id, o.display_name
      from notification_actors na
      join owners o on o.uuid = na.actor_owner_id
      where na.notification_id = ?
      order by na.last_action_at desc
      limit ?
      `
    )
    .bind(notificationId, limit)
    .all<ActorRow>();

  return (results ?? []).map((row) => row.display_name || row.actor_owner_id);
}

function buildNotificationBody(type: NotificationType, actors: string[], actorCount: number): string {
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

function buildAggregatedBody(nameA: string, nameB: string, count: number, action: string): string {
  if (count <= 1) return `${nameA} ${action}`;
  if (count === 2) return `${nameA} and ${nameB} ${action}`;
  const others = Math.max(0, count - 2);
  return `${nameA}, ${nameB}, and ${others} others ${action}`;
}
