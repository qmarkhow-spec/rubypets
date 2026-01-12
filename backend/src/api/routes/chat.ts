import { HandlerContext } from "../../types";
import { asNumber, errorJson, okJson } from "../utils";
import { requireAuthOwner } from "./shared";
import { DynamicRoute, Route } from "./types";
import type { ChatThreadListItem } from "../../db";

const MAX_MESSAGE_LENGTH = 500;

async function listThreadsRoute(ctx: HandlerContext): Promise<Response> {
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

async function getThreadRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const me = await requireAuthOwner(ctx);
  const thread = await ctx.db.getChatThreadForOwner(params.id, me.uuid);
  if (!thread) return errorJson("thread not found", 404);
  const isFriend = await ctx.db.isFriends(me.uuid, thread.otherOwner.uuid);
  return okJson(serializeThreadItem(thread, isFriend), 200);
}

async function createThreadRoute(ctx: HandlerContext): Promise<Response> {
  const me = await requireAuthOwner(ctx);
  const payload = (await ctx.request.json().catch(() => ({}))) as {
    otherOwnerId?: string;
    firstMessageText?: string;
  };
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
    const isFriend = await ctx.db.isFriends(me.uuid, otherOwnerId);
    const requestState = isFriend ? "accepted" : "pending";
    if (!isFriend && !firstMessageText) {
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
      const message = await ctx.db.insertChatMessage(thread.id, me.uuid, firstMessageText);
      await ctx.db.updateChatThreadOnNewMessage(thread.id, message.id, {
        requestMessageId: requestState === "pending" ? message.id : null,
        requestSenderId: requestState === "pending" ? me.uuid : null
      });
    }
  } else {
    await ctx.db.setParticipantDeleted(thread.id, me.uuid, null);
    await ctx.db.setParticipantArchived(thread.id, me.uuid, null);
    if (
      firstMessageText &&
      thread.requestState === "pending" &&
      thread.requestSenderId === me.uuid &&
      !thread.requestMessageId
    ) {
      const message = await ctx.db.insertChatMessage(thread.id, me.uuid, firstMessageText);
      await ctx.db.updateChatThreadOnNewMessage(thread.id, message.id, {
        requestMessageId: message.id,
        requestSenderId: me.uuid
      });
    }
  }

  const detail = await ctx.db.getChatThreadForOwner(thread.id, me.uuid);
  if (!detail) return errorJson("thread not found", 404);
  const isFriend = await ctx.db.isFriends(me.uuid, detail.otherOwner.uuid);
  return okJson(serializeThreadItem(detail, isFriend), 200);
}

async function listMessagesRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const me = await requireAuthOwner(ctx);
  const participant = await ctx.db.getChatParticipant(params.id, me.uuid);
  if (!participant) return errorJson("forbidden", 403);

  const url = new URL(ctx.request.url);
  const limit = asNumber(url.searchParams.get("limit"), 30);
  const before = url.searchParams.get("before");

  const page = await ctx.db.listChatMessages(params.id, limit, before);
  return okJson(page, 200);
}

async function acceptRequestRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  return updateRequestState(ctx, params.id, "accepted");
}

async function rejectRequestRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  return updateRequestState(ctx, params.id, "rejected");
}

async function archiveThreadRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const me = await requireAuthOwner(ctx);
  const participant = await ctx.db.getChatParticipant(params.id, me.uuid);
  if (!participant) return errorJson("forbidden", 403);
  await ctx.db.setParticipantArchived(params.id, me.uuid, new Date().toISOString());
  return okJson(null, 200);
}

async function deleteThreadRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const me = await requireAuthOwner(ctx);
  const participant = await ctx.db.getChatParticipant(params.id, me.uuid);
  if (!participant) return errorJson("forbidden", 403);
  await ctx.db.setParticipantDeleted(params.id, me.uuid, new Date().toISOString());
  return okJson(null, 200);
}

async function wsThreadRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const upgrade = ctx.request.headers.get("Upgrade");
  if (!upgrade || upgrade.toLowerCase() !== "websocket") {
    return errorJson("Expected websocket", 426);
  }
  const doId = ctx.env.CHAT_THREAD_DO.idFromName(params.id);
  const stub = ctx.env.CHAT_THREAD_DO.get(doId);
  return stub.fetch(ctx.request);
}

async function updateRequestState(
  ctx: HandlerContext,
  threadId: string,
  nextState: "accepted" | "rejected"
): Promise<Response> {
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

async function notifyThreadUpdated(ctx: HandlerContext, threadId: string) {
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

function serializeThreadItem(item: ChatThreadListItem, isFriend: boolean) {
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

function buildPairKey(ownerA: string, ownerB: string): string {
  return ownerA < ownerB ? `${ownerA}:${ownerB}` : `${ownerB}:${ownerA}`;
}

export const routes: Route[] = [
  { method: "GET", path: "/chat/threads", handler: listThreadsRoute },
  { method: "POST", path: "/chat/threads", handler: createThreadRoute }
];

export const dynamicRoutes: DynamicRoute[] = [
  { method: "GET", pattern: /^\/chat\/threads\/([^/]+)$/, handler: getThreadRoute },
  { method: "GET", pattern: /^\/chat\/threads\/([^/]+)\/messages$/, handler: listMessagesRoute },
  { method: "POST", pattern: /^\/chat\/threads\/([^/]+)\/request\/accept$/, handler: acceptRequestRoute },
  { method: "POST", pattern: /^\/chat\/threads\/([^/]+)\/request\/reject$/, handler: rejectRequestRoute },
  { method: "POST", pattern: /^\/chat\/threads\/([^/]+)\/archive$/, handler: archiveThreadRoute },
  { method: "POST", pattern: /^\/chat\/threads\/([^/]+)\/delete$/, handler: deleteThreadRoute },
  { method: "GET", pattern: /^\/ws\/threads\/([^/]+)$/, handler: wsThreadRoute }
];
