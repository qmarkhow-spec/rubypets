'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import type { ChatMessage, ChatThreadSummary, ChatRequestState } from "@/lib/types";

type MessagePage = { items: ChatMessage[]; nextCursor: string | null };

type WsMessage =
  | { type: "message_new"; message: WsChatMessage }
  | { type: "thread_updated"; thread: WsChatThread }
  | { type: "read_updated"; owner_id: string; last_read_message_id: string }
  | { type: "error"; message: string };

type WsChatMessage = {
  id: string;
  thread_id: string;
  sender_id: string;
  body_text: string;
  created_at: string;
};

type WsChatThread = {
  id: string;
  request_state: ChatRequestState;
  request_sender_id: string | null;
  request_message_id: string | null;
  last_message_id: string | null;
  last_activity_at: string | null;
};

export default function MessageThreadPage() {
  const params = useParams();
  const threadId = useMemo(() => (params?.id ? String(params.id) : ""), [params]);
  const { user, tokens } = useAuth();

  const [thread, setThread] = useState<ChatThreadSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [otherReadMessageId, setOtherReadMessageId] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!threadId || !user) return;
    setLoading(true);
    setError(null);
    Promise.all([loadThread(threadId), loadMessages(threadId, true)])
      .catch((err) => setError(readError(err)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, user?.id]);

  useEffect(() => {
    if (!threadId || !tokens?.accessToken) return;
    const wsBase = toWsBase(process.env.NEXT_PUBLIC_API_BASE ?? "https://api.rubypets.com");
    const ws = new WebSocket(`${wsBase}/ws/threads/${threadId}?token=${encodeURIComponent(tokens.accessToken)}`);
    wsRef.current = ws;
    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => setWsConnected(false);
    ws.onerror = () => setWsConnected(false);
    ws.onmessage = (event) => {
      const payload = safeJson<WsMessage>(event.data);
      if (!payload) return;
      handleWsMessage(payload);
    };
    return () => {
      wsRef.current = null;
      ws.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, tokens?.accessToken]);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || !wsConnected) return;
    if (user && isAtBottom(listRef.current)) {
      sendRead(lastMessage.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, wsConnected]);

  async function loadThread(id: string) {
    const { data } = await apiFetch<ChatThreadSummary>(`/api/chat/threads/${id}`);
    setThread(data);
  }

  async function loadMessages(id: string, reset: boolean) {
    if (!reset) setLoadingMore(true);
    try {
      const params = new URLSearchParams({ limit: "30" });
      if (!reset && cursor) params.set("before", cursor);
      const { data } = await apiFetch<MessagePage>(`/api/chat/threads/${id}/messages?${params.toString()}`);
      const items = data.items ?? [];
      setMessages((prev) => (reset ? items : [...items, ...prev]));
      setCursor(data.nextCursor ?? null);
    } catch (err) {
      setError(readError(err));
      throw err;
    } finally {
      setLoadingMore(false);
    }
  }

  function handleWsMessage(payload: WsMessage) {
    switch (payload.type) {
      case "message_new": {
        const msg = normalizeWsMessage(payload.message);
        setMessages((prev) => {
          if (prev.some((item) => item.id === msg.id)) return prev;
          return [...prev, msg];
        });
        setThread((prev) =>
          prev
            ? {
                ...prev,
                lastMessageId: msg.id,
                lastMessagePreview: msg.bodyText,
                lastActivityAt: msg.createdAt,
                archived: false,
                deleted: false
              }
            : prev
        );
        return;
      }
      case "thread_updated": {
        setThread((prev) =>
          prev
            ? {
                ...prev,
                requestState: payload.thread.request_state,
                requestSenderId: payload.thread.request_sender_id ?? null,
                requestMessageId: payload.thread.request_message_id ?? null,
                lastMessageId: payload.thread.last_message_id ?? prev.lastMessageId,
                lastActivityAt: payload.thread.last_activity_at ?? prev.lastActivityAt
              }
            : prev
        );
        return;
      }
      case "read_updated": {
        if (payload.owner_id !== user?.id) {
          setOtherReadMessageId(payload.last_read_message_id);
        }
        return;
      }
      case "error": {
        setError(payload.message);
        return;
      }
      default:
        return;
    }
  }

  async function sendMessage() {
    if (!canSend) return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError("WebSocket 尚未連線");
      return;
    }
    const text = input.trim();
    if (!text) return;
    if (text.length > 500) {
      setError("訊息最多 500 字");
      return;
    }
    setSending(true);
    try {
      wsRef.current.send(JSON.stringify({ type: "send", body_text: text }));
      setInput("");
    } finally {
      setSending(false);
    }
  }

  function sendRead(messageId: string) {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "read", last_read_message_id: messageId }));
  }

  async function acceptRequest() {
    if (!thread) return;
    try {
      await apiFetch(`/api/chat/threads/${thread.threadId}/request/accept`, { method: "POST" });
      setThread({ ...thread, requestState: "accepted" });
    } catch (err) {
      setError(readError(err));
    }
  }

  async function rejectRequest() {
    if (!thread) return;
    try {
      await apiFetch(`/api/chat/threads/${thread.threadId}/request/reject`, { method: "POST" });
      setThread({ ...thread, requestState: "rejected" });
    } catch (err) {
      setError(readError(err));
    }
  }

  if (!user) {
    return (
      <div className="card rounded-3xl p-6 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">訊息</h1>
        <p className="mt-4 text-slate-500">請先登入以查看訊息。</p>
        <Link href="/login" className="btn-primary mt-6 inline-flex items-center rounded-full px-6 py-2 text-sm">
          前往登入
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="card rounded-3xl p-6 text-center text-slate-600">
        <p>載入中...</p>
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="card rounded-3xl p-6 text-center text-slate-600">
        <p>找不到聊天室。</p>
        <Link href="/messages" className="btn-primary mt-4 inline-flex items-center rounded-full px-6 py-2 text-sm">
          返回列表
        </Link>
      </div>
    );
  }

  const isSender = thread.requestSenderId === user.id;
  const isPending = thread.requestState === "pending";
  const canSend =
    thread.requestState === "accepted" ||
    thread.requestState === "none" ||
    (isPending && isSender && !thread.requestMessageId);
  const lastMessage = messages[messages.length - 1];
  const showReadReceipt =
    lastMessage &&
    lastMessage.senderId === user.id &&
    otherReadMessageId &&
    otherReadMessageId === lastMessage.id;

  return (
    <div className="space-y-6">
      <header className="card rounded-3xl p-6">
        <Link href="/messages" className="text-sm text-slate-500 hover:text-slate-700">
          ← 返回訊息列表
        </Link>
        <div className="mt-4 flex items-center gap-4">
          <div className="h-12 w-12 overflow-hidden rounded-full bg-slate-100">
            {thread.otherOwner.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thread.otherOwner.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-slate-500">
                {thread.otherOwner.displayName?.slice(0, 1) ?? "?"}
              </div>
            )}
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{thread.otherOwner.displayName}</h1>
            <p className="text-sm text-slate-500">WebSocket {wsConnected ? "已連線" : "未連線"}</p>
          </div>
        </div>

        {!thread.isFriend && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            非好友提醒：此聊天室屬於訊息請求流程。
          </div>
        )}

        <div className="mt-4 space-y-2 text-sm text-slate-600">
          {thread.requestState === "pending" && !isSender && (
            <div className="flex flex-wrap items-center gap-3">
              <span>對方傳送訊息請求。</span>
              <button onClick={acceptRequest} className="btn-success rounded-full px-4 py-1.5 text-xs">
                接受
              </button>
              <button onClick={rejectRequest} className="rounded-full border border-slate-300 px-4 py-1.5 text-xs text-slate-600">
                拒絕
              </button>
            </div>
          )}
          {thread.requestState === "pending" && isSender && <span>等待對方接受你的訊息請求。</span>}
          {thread.requestState === "rejected" && <span className="text-rose-500">已拒絕，無法傳訊。</span>}
        </div>
      </header>

      <section className="card rounded-3xl p-4">
        <div className="flex items-center justify-between pb-3 text-xs text-slate-500">
          <span>訊息紀錄</span>
          {cursor && (
            <button
              onClick={() => loadMessages(thread.threadId, false)}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500"
              disabled={loadingMore}
            >
              {loadingMore ? "載入中..." : "載入更舊"}
            </button>
          )}
        </div>

        <div
          ref={listRef}
          onScroll={() => {
            if (lastMessage && isAtBottom(listRef.current)) {
              sendRead(lastMessage.id);
            }
          }}
          className="max-h-[480px] space-y-3 overflow-y-auto rounded-2xl bg-slate-50 p-4"
        >
          {messages.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">尚無訊息。</div>
          ) : (
            messages.map((msg) => {
              const isMine = msg.senderId === user.id;
              return (
                <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm ${
                      isMine ? "bg-blue-600 text-white" : "bg-white text-slate-700"
                    }`}
                  >
                    <p>{msg.bodyText}</p>
                    <div className="mt-1 text-xs opacity-70">{formatTime(msg.createdAt)}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        {showReadReceipt && <div className="mt-2 text-right text-xs text-slate-400">已讀</div>}
      </section>

      <section className="card rounded-3xl p-4">
        {error && <div className="mb-3 text-sm text-rose-600">{error}</div>}
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={canSend ? "輸入訊息..." : "目前無法傳送"}
            disabled={!canSend || sending}
            className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-400"
          />
          <button
            onClick={sendMessage}
            disabled={!canSend || sending}
            className="btn-primary rounded-full px-6 py-3 text-sm disabled:opacity-60"
          >
            送出
          </button>
        </div>
        {isPending && isSender && thread.requestMessageId && (
          <p className="mt-2 text-xs text-slate-500">訊息請求只能傳送 1 則，等待對方回應。</p>
        )}
      </section>
    </div>
  );
}

function normalizeWsMessage(message: WsChatMessage): ChatMessage {
  return {
    id: message.id,
    threadId: message.thread_id,
    senderId: message.sender_id,
    bodyText: message.body_text,
    createdAt: message.created_at
  };
}

function safeJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function toWsBase(base: string) {
  if (base.startsWith("https://")) return base.replace("https://", "wss://");
  if (base.startsWith("http://")) return base.replace("http://", "ws://");
  return base;
}

function isAtBottom(el: HTMLDivElement | null) {
  if (!el) return false;
  return el.scrollHeight - el.scrollTop - el.clientHeight < 40;
}

function formatTime(raw: string | null) {
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString();
}

function readError(err: unknown) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  const message = (err as { message?: string }).message;
  return message || "Unexpected error";
}
