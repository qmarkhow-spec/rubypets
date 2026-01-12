import { D1Client } from "../db/d1-client";
import { parseUserIdFromToken } from "../services/auth";
import { Env } from "../types";
import type { ChatRequestState } from "../db/models";

type ClientInfo = {
  ownerId: string;
  threadId: string;
};

type WebSocketWithAttachment = WebSocket & {
  serializeAttachment?: (attachment: unknown) => void;
  deserializeAttachment?: () => unknown;
};

type ClientMessage =
  | { type: "send"; body_text?: string }
  | { type: "read"; last_read_message_id?: string }
  | { type: "accept_request" }
  | { type: "reject_request" }
  | { type: "ping" };

type ServerMessage =
  | { type: "message_new"; message: ChatMessagePayload }
  | { type: "thread_updated"; thread: ChatThreadPayload }
  | { type: "read_updated"; owner_id: string; last_read_message_id: string }
  | { type: "error"; message: string }
  | { type: "pong" };

type ChatMessagePayload = {
  id: string;
  thread_id: string;
  sender_id: string;
  body_text: string;
  created_at: string;
};

type ChatThreadPayload = {
  id: string;
  request_state: ChatRequestState;
  request_sender_id: string | null;
  request_message_id: string | null;
  last_message_id: string | null;
  last_activity_at: string | null;
};

export class ChatThreadDO {
  private readonly state: DurableObjectState;
  private readonly env: Env;
  private readonly db: D1Client;
  private readonly sockets = new Map<WebSocket, ClientInfo>();

  constructor(state: DurableObjectState, env: Env) {
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

  async fetch(request: Request): Promise<Response> {
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
    (server as WebSocketWithAttachment).serializeAttachment?.({ ownerId, threadId });
    this.sockets.set(server, { ownerId, threadId });

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
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

    const text = typeof message === "string" ? message : new TextDecoder().decode(message);
    const payload = safeJson<ClientMessage>(text);
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

  webSocketClose(ws: WebSocket): void {
    this.sockets.delete(ws);
  }

  webSocketError(ws: WebSocket): void {
    this.sockets.delete(ws);
  }

  private async handleAction(action: string, request: Request, url: URL): Promise<Response> {
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

  private async handleSend(ws: WebSocket, info: ClientInfo, payload: { body_text?: string }) {
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

    const message = await this.db.insertChatMessage(info.threadId, info.ownerId, rawBody);

    const shouldSetRequestMessage = state === "pending" && !thread.requestMessageId;
    await this.db.updateChatThreadOnNewMessage(info.threadId, message.id, {
      requestMessageId: shouldSetRequestMessage ? message.id : null,
      requestSenderId: state === "pending" && !thread.requestSenderId ? info.ownerId : null
    });

    await this.db.clearParticipantsArchiveDeleted(info.threadId);

    const updated = await this.db.getChatThreadById(info.threadId);

    this.broadcast({
      type: "message_new",
      message: {
        id: message.id,
        thread_id: message.threadId,
        sender_id: message.senderId,
        body_text: message.bodyText,
        created_at: message.createdAt
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

  private async handleRead(ws: WebSocket, info: ClientInfo, payload: { last_read_message_id?: string }) {
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

  private async handleRequestDecision(ws: WebSocket, info: ClientInfo, nextState: "accepted" | "rejected") {
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

  private broadcast(payload: ServerMessage) {
    const message = JSON.stringify(payload);
    for (const socket of this.sockets.keys()) {
      try {
        socket.send(message);
      } catch {
        this.sockets.delete(socket);
      }
    }
  }

  private broadcastExceptOwner(ownerId: string, payload: ServerMessage) {
    const message = JSON.stringify(payload);
    for (const [socket, info] of this.sockets.entries()) {
      if (info.ownerId === ownerId) continue;
      try {
        socket.send(message);
      } catch {
        this.sockets.delete(socket);
      }
    }
  }

  private sendError(ws: WebSocket, message: string) {
    ws.send(JSON.stringify({ type: "error", message }));
  }

  private resolveOwnerId(request: Request, url: URL): string | null {
    const header = request.headers.get("authorization");
    const token =
      header && header.toLowerCase().startsWith("bearer ")
        ? header.slice("bearer ".length).trim()
        : url.searchParams.get("token")?.trim();
    if (!token) return null;
    return parseUserIdFromToken(token);
  }

  private restoreClientInfo(ws: WebSocket): ClientInfo | null {
    const attachment = (ws as WebSocketWithAttachment).deserializeAttachment?.();
    if (!attachment || typeof attachment !== "object") return null;
    const ownerId = (attachment as { ownerId?: unknown }).ownerId;
    const threadId = (attachment as { threadId?: unknown }).threadId;
    if (typeof ownerId !== "string" || typeof threadId !== "string") return null;
    return { ownerId, threadId };
  }
}

function safeJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function extractThreadId(pathname: string): string | null {
  const match = pathname.match(/\/ws\/threads\/([^/]+)/);
  if (match && match[1]) return match[1];
  const parts = pathname.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : null;
}
