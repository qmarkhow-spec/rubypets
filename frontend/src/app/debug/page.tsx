'use client';

export const runtime = 'edge';

import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { HealthStatus, Post } from "@/lib/types";
import { loadTokens } from "@/lib/auth-storage";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type Json = Record<string, unknown> | Array<unknown> | string | number | boolean | null;

export default function DebugPage() {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "https://api.rubypets.com";

  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regHandle, setRegHandle] = useState("");
  const [regDisplay, setRegDisplay] = useState("");
  const [regResult, setRegResult] = useState<Json | null>(null);
  const [regError, setRegError] = useState<string | null>(null);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginResult, setLoginResult] = useState<Json | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [postsUserId, setPostsUserId] = useState("demo-user");
  const [postsLimit, setPostsLimit] = useState(10);
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsError, setPostsError] = useState<string | null>(null);

  const [recentPosts, setRecentPosts] = useState<Post[]>([]);
  const [recentPostsError, setRecentPostsError] = useState<string | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string>("");
  const [commentLogs, setCommentLogs] = useState<string[]>([]);
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  const [method, setMethod] = useState<HttpMethod>("GET");
  const [path, setPath] = useState("/api/health");
  const [body, setBody] = useState("{\n  \"example\": true\n}");
  const [response, setResponse] = useState<string>("");
  const [requestError, setRequestError] = useState<string | null>(null);

  async function runHealth() {
    setHealthError(null);
    try {
      const { data } = await apiFetch<HealthStatus>("/api/health");
      setHealth(data);
    } catch (err) {
      setHealthError(readError(err));
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setRegError(null);
    setRegResult(null);
    try {
      const { data } = await apiFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: regEmail,
          password: regPassword,
          handle: regHandle || regEmail.split("@")[0] || "user",
          displayName: regDisplay || regHandle || regEmail.split("@")[0] || "user",
        }),
      });
      setRegResult(data as Json);
    } catch (err) {
      setRegError(readError(err));
    }
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setLoginResult(null);
    try {
      const { data } = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      setLoginResult(data as Json);
    } catch (err) {
      setLoginError(readError(err));
    }
  }

  async function loadPosts() {
    setPostsError(null);
    try {
      const params = new URLSearchParams({ limit: String(postsLimit) });
      if (postsUserId.trim()) params.set("userId", postsUserId.trim());
      const { data } = await apiFetch<Post[]>(`/api/posts?${params.toString()}`);
      setPosts(data);
    } catch (err) {
      setPostsError(readError(err));
    }
  }

  function appendLog(message: string) {
    const ts = new Date().toISOString();
    setCommentLogs((prev) => [...prev, `[${ts}] ${message}`]);
  }

  async function loadRecentPosts() {
    setRecentPostsError(null);
    appendLog("Loading recent posts (limit=5)");
    try {
      const { data } = await apiFetch<Post[]>("/api/posts?limit=5");
      setRecentPosts(data);
      const firstId = data[0]?.id ?? "";
      setSelectedPostId((current) => current || firstId);
      appendLog(`Loaded ${data.length} posts`);
    } catch (err) {
      const message = readError(err);
      setRecentPostsError(message);
      appendLog(`Failed to load posts: ${message}`);
    }
  }

  async function sendTestComment() {
    if (commentSubmitting) return;
    if (!selectedPostId) {
      appendLog("No post selected");
      return;
    }
    setCommentSubmitting(true);
    const tokens = loadTokens();
    const path = `/api/posts/${selectedPostId}/comments`;
    const base = apiBase.replace(/\/$/, "");
    const target = base.startsWith("http") ? `${base}${path}` : path;
    appendLog(tokens?.accessToken ? "Auth token found" : "Auth token missing");
    appendLog(`API base: ${apiBase}`);
    appendLog(`Request target: ${target}`);
    appendLog(`Sending test comment for post ${selectedPostId}`);
    try {
      const payload = { content: "test comment", parent_comment_id: null as string | null };
      const headers = new Headers();
      headers.set("content-type", "application/json");
      if (tokens?.accessToken) {
        headers.set("authorization", `Bearer ${tokens.accessToken}`);
      }
      const response = await fetch(target, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });
      appendLog(`Response HTTP ${response.status}`);
      appendLog(`Response redirected: ${response.redirected}`);
      appendLog(`Response url: ${response.url}`);
      const text = await response.text();
      let parsed = text;
      try {
        parsed = JSON.stringify(JSON.parse(text));
      } catch {
        // keep raw text
      }
      appendLog(`Response body: ${parsed || "<empty>"}`);
    } catch (err) {
      appendLog(`Request failed: ${String(err)}`);
    } finally {
      setCommentSubmitting(false);
    }
  }

  useEffect(() => {
    void loadRecentPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendRequest(e: FormEvent) {
    e.preventDefault();
    setRequestError(null);
    setResponse("");
    try {
      const opts: RequestInit = { method };
      if (method !== "GET" && method !== "DELETE" && body.trim()) {
        opts.body = body;
      }
      const { status, data } = await apiFetch(path, opts);
      setResponse(`HTTP ${status}\n${JSON.stringify(data, null, 2)}`);
    } catch (err) {
      const status = (err as { status?: number }).status;
      const details = (err as { details?: unknown }).details;
      setRequestError(`HTTP ${status ?? "?"} ${typeof details === "object" ? JSON.stringify(details) : String(details ?? err)}`);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-white/10 bg-white/90 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">健康檢查</h2>
          <button
            type="button"
            onClick={runHealth}
            className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800"
          >
            呼叫 /api/health
          </button>
        </div>
        <div className="mt-3 text-sm">
          {health && <pre className="rounded bg-slate-50 p-3 text-xs text-slate-800">{JSON.stringify(health, null, 2)}</pre>}
          {healthError && <p className="text-sm text-red-600">{healthError}</p>}
          {!health && !healthError && <p className="text-slate-500">尚未測試</p>}
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/90 p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold text-slate-900">註冊 / 登入 測試</h2>
          <p className="text-xs text-slate-500">呼叫 /api/auth/register、/api/auth/login</p>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <form className="space-y-3 rounded border border-slate-200 p-3" onSubmit={handleRegister}>
            <div className="text-sm font-medium">註冊</div>
            <input
              className="w-full rounded border border-slate-200 p-2 text-sm"
              placeholder="Email"
              type="email"
              required
              value={regEmail}
              onChange={(e) => setRegEmail(e.target.value)}
            />
            <input
              className="w-full rounded border border-slate-200 p-2 text-sm"
              placeholder="Password"
              type="password"
              required
              value={regPassword}
              onChange={(e) => setRegPassword(e.target.value)}
            />
            <input
              className="w-full rounded border border-slate-200 p-2 text-sm"
              placeholder="Handle（可空白，預設取 email 前綴）"
              value={regHandle}
              onChange={(e) => setRegHandle(e.target.value)}
            />
            <input
              className="w-full rounded border border-slate-200 p-2 text-sm"
              placeholder="Display name（可空白）"
              value={regDisplay}
              onChange={(e) => setRegDisplay(e.target.value)}
            />
            <button
              type="submit"
              className="w-full rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            >
              送出 /api/auth/register
            </button>
            {regError && <p className="text-sm text-red-600">{regError}</p>}
            {regResult && <pre className="rounded bg-slate-50 p-2 text-xs text-slate-800">{JSON.stringify(regResult, null, 2)}</pre>}
          </form>

          <form className="space-y-3 rounded border border-slate-200 p-3" onSubmit={handleLogin}>
            <div className="text-sm font-medium">登入</div>
            <input
              className="w-full rounded border border-slate-200 p-2 text-sm"
              placeholder="Email"
              type="email"
              required
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
            />
            <input
              className="w-full rounded border border-slate-200 p-2 text-sm"
              placeholder="Password"
              type="password"
              required
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
            />
            <button
              type="submit"
              className="w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              送出 /api/auth/login
            </button>
            {loginError && <p className="text-sm text-red-600">{loginError}</p>}
            {loginResult && <pre className="rounded bg-slate-50 p-2 text-xs text-slate-800">{JSON.stringify(loginResult, null, 2)}</pre>}
          </form>
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/90 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">查詢貼文</h2>
          <button
            type="button"
            onClick={loadPosts}
            className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800"
          >
            呼叫 /api/posts
          </button>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm text-slate-700">userId（可留空）</label>
            <input
              className="w-full rounded border border-slate-200 p-2 text-sm"
              value={postsUserId}
              onChange={(e) => setPostsUserId(e.target.value)}
              placeholder="demo-user 或留空取全部"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-slate-700">limit</label>
            <input
              type="number"
              min={1}
              max={100}
              className="w-full rounded border border-slate-200 p-2 text-sm"
              value={postsLimit}
              onChange={(e) => setPostsLimit(Number(e.target.value))}
            />
          </div>
        </div>
        {postsError && <p className="mt-2 text-sm text-red-600">{postsError}</p>}
        <div className="mt-3 space-y-2">
          {posts.length === 0 && !postsError && <p className="text-sm text-slate-500">尚未查詢或沒有資料。</p>}
          {posts.map((post) => (
            <div key={post.id} className="rounded border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{post.authorDisplayName || post.authorHandle || post.authorId}</span>
                <span>{new Date(post.createdAt).toLocaleString()}</span>
              </div>
              <p className="mt-1 text-sm text-slate-800">{post.body ?? post.content ?? "(無內容)"}</p>
              {post.mediaKey && <p className="text-xs text-slate-500">mediaKey: {post.mediaKey}</p>}
            </div>
          ))}
        </div>
      </section>

      
      <section className="rounded-xl border border-white/10 bg-white/90 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Test Comment</h2>
          <button
            type="button"
            onClick={loadRecentPosts}
            className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800"
          >
            Refresh posts
          </button>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm text-slate-700">Recent posts (limit 5)</label>
            <select
              className="w-full rounded border border-slate-200 p-2 text-sm"
              value={selectedPostId}
              onChange={(e) => setSelectedPostId(e.target.value)}
            >
              <option value="">Select a post</option>
              {recentPosts.map((post) => (
                <option key={post.id} value={post.id}>
                  {post.authorDisplayName || post.authorHandle || post.authorId} - {post.id.slice(0, 8)}
                </option>
              ))}
            </select>
            {recentPostsError && <p className="text-sm text-red-600">{recentPostsError}</p>}
          </div>
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={sendTestComment}
              className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
              disabled={commentSubmitting}
            >
              Test comment
            </button>
            <button
              type="button"
              onClick={() => setCommentLogs([])}
              className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
              disabled={commentSubmitting}
            >
              Clear logs
            </button>
          </div>
        </div>
        <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          {commentLogs.length === 0 && <p className="text-slate-500">No logs yet.</p>}
          {commentLogs.length > 0 && (
            <pre className="whitespace-pre-wrap">{commentLogs.join("\n")}</pre>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/90 p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">自訂 API 測試</h2>
        <form className="mt-3 space-y-3" onSubmit={sendRequest}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              className="rounded border border-slate-200 p-2 text-sm"
              value={method}
              onChange={(e) => setMethod(e.target.value as HttpMethod)}
            >
              {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <input
              className="w-full rounded border border-slate-200 p-2 text-sm"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/api/health"
            />
            <button
              type="submit"
              className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
            >
              送出
            </button>
          </div>
          {method !== "GET" && method !== "DELETE" && (
            <textarea
              className="h-40 w-full rounded border border-slate-200 p-2 font-mono text-xs"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          )}
        </form>
        {requestError && <p className="mt-2 text-sm text-red-600">{requestError}</p>}
        {response && (
          <pre className="mt-3 rounded bg-slate-50 p-3 text-xs text-slate-800">
            {response}
          </pre>
        )}
      </section>
    </div>
  );
}

function readError(err: unknown): string {
  if (!err) return "未知錯誤";
  if (typeof err === "string") return err;
  const status = (err as { status?: number }).status;
  const details = (err as { details?: unknown }).details;
  if (details && typeof details === "object" && "error" in details) {
    return `${status ?? ""} ${(details as { error?: string }).error ?? "發生錯誤"}`;
  }
  return status ? `HTTP ${status}` : "error";
}
