import { HandlerContext } from "../../types";
import { asNumber, errorJson, okJson } from "../utils";
import { requireAuthOwner } from "./shared";
import { registerPushToken, unregisterPushToken } from "../../services/notifications";
import { DynamicRoute, Route } from "./types";

type NotificationListRow = {
  id: string;
  type: string;
  actor_count: number;
  latest_action_at: string | null;
  post_id: string | null;
  comment_id: string | null;
  friendship_id: number | null;
  is_read: number;
  is_hidden: number;
  created_at: string;
  sort_ts: string;
};

type ActorRow = { actor_owner_id: string; display_name: string };

type Cursor = { ts: string; id: string };

async function registerPushTokenRoute(ctx: HandlerContext): Promise<Response> {
  const me = await requireAuthOwner(ctx);
  const body = (await ctx.request.json().catch(() => ({}))) as {
    platform?: "ios" | "android";
    fcm_token?: string;
  };

  const platform = body.platform;
  const fcmToken = (body.fcm_token ?? "").trim();
  if (!platform || !["ios", "android"].includes(platform)) return errorJson("invalid platform", 400);
  if (!fcmToken) return errorJson("fcm_token required", 400);

  await registerPushToken(ctx.env.DB, me.uuid, platform, fcmToken);
  return okJson({ fcm_token: fcmToken }, 200);
}

async function unregisterPushTokenRoute(ctx: HandlerContext): Promise<Response> {
  const me = await requireAuthOwner(ctx);
  const body = (await ctx.request.json().catch(() => ({}))) as { fcm_token?: string };
  const fcmToken = (body.fcm_token ?? "").trim();
  if (!fcmToken) return errorJson("fcm_token required", 400);
  await unregisterPushToken(ctx.env.DB, fcmToken);
  return okJson({ fcm_token: fcmToken, owner_id: me.uuid }, 200);
}

async function listNotificationsRoute(ctx: HandlerContext): Promise<Response> {
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

async function markReadRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const me = await requireAuthOwner(ctx);
  const id = params.id;
  const ts = new Date().toISOString();
  const res = await ctx.env.DB
    .prepare(
      `
      update notifications
      set is_read = 1, read_at = ?, updated_at = ?
      where id = ? and recipient_owner_id = ?
      `
    )
    .bind(ts, ts, id, me.uuid)
    .run();
  const changes = (res as { meta?: { changes?: number } })?.meta?.changes ?? 0;
  if (!changes) return errorJson("Not found", 404);
  return okJson({ id }, 200);
}

async function markAllReadRoute(ctx: HandlerContext): Promise<Response> {
  const me = await requireAuthOwner(ctx);
  const ts = new Date().toISOString();
  await ctx.env.DB
    .prepare(
      `
      update notifications
      set is_read = 1, read_at = ?, updated_at = ?
      where recipient_owner_id = ? and is_hidden = 0 and is_read = 0
      `
    )
    .bind(ts, ts, me.uuid)
    .run();
  return okJson({ ok: true }, 200);
}

async function hideNotificationRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const me = await requireAuthOwner(ctx);
  const id = params.id;
  const ts = new Date().toISOString();
  const res = await ctx.env.DB
    .prepare(
      `
      update notifications
      set is_hidden = 1, hidden_at = ?, updated_at = ?
      where id = ? and recipient_owner_id = ?
      `
    )
    .bind(ts, ts, id, me.uuid)
    .run();
  const changes = (res as { meta?: { changes?: number } })?.meta?.changes ?? 0;
  if (!changes) return errorJson("Not found", 404);
  return okJson({ id }, 200);
}

function parseCursor(value: string | null): Cursor | null {
  if (!value) return null;
  const [ts, id] = value.split("|");
  if (!ts || !id) return null;
  return { ts, id };
}

function toCursor(row: NotificationListRow): string {
  return `${row.sort_ts}|${row.id}`;
}

async function listNotifications(
  db: D1Database,
  ownerId: string,
  limit: number,
  cursor: Cursor | null
): Promise<{ items: NotificationListRow[]; nextCursor: string | null }> {
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

  const params: Array<string | number> = [ownerId];
  if (cursor) {
    sql += ` and (${sortExpr} < ? or (${sortExpr} = ? and id < ?))`;
    params.push(cursor.ts, cursor.ts, cursor.id);
  }

  sql += ` order by ${sortExpr} desc, id desc limit ?`;
  params.push(safeLimit + 1);

  const { results } = await db.prepare(sql).bind(...params).all<NotificationListRow>();
  const rows = results ?? [];
  const hasMore = rows.length > safeLimit;
  const pageRows = hasMore ? rows.slice(0, safeLimit) : rows;
  const nextCursor = hasMore && pageRows.length > 0 ? toCursor(pageRows[pageRows.length - 1]) : null;

  return { items: pageRows, nextCursor };
}

async function listActors(db: D1Database, notificationId: string, limit: number) {
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

  return (results ?? []).map((row) => ({
    ownerId: row.actor_owner_id,
    displayName: row.display_name
  }));
}

export const routes: Route[] = [
  { method: "POST", path: "/push-tokens/register", handler: registerPushTokenRoute },
  { method: "POST", path: "/push-tokens/unregister", handler: unregisterPushTokenRoute },
  { method: "GET", path: "/notifications", handler: listNotificationsRoute },
  { method: "POST", path: "/notifications/mark-all-read", handler: markAllReadRoute }
];

export const dynamicRoutes: DynamicRoute[] = [
  { method: "POST", pattern: /^\/notifications\/([^/]+)\/read$/, handler: markReadRoute },
  { method: "DELETE", pattern: /^\/notifications\/([^/]+)$/, handler: hideNotificationRoute }
];
