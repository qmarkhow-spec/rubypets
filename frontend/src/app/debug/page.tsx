'use client';

import { FormEvent, useState } from "react";
import { apiFetch } from "@/lib/api-client";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export default function DebugPage() {
  const [method, setMethod] = useState<HttpMethod>("GET");
  const [path, setPath] = useState("/api/health");
  const [body, setBody] = useState("{\n  \"example\": true\n}");
  const [response, setResponse] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  async function send(e: FormEvent) {
    e.preventDefault();
    setError(null);
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
      setError(`HTTP ${status ?? "?"} ${typeof details === "object" ? JSON.stringify(details) : String(details ?? err)}`);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border bg-white p-6 shadow-sm">
      <h1 className="text-xl font-semibold">Debug / 任意 API 測試</h1>
      <form className="space-y-3" onSubmit={send}>
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
      {error && <p className="text-sm text-red-600">{error}</p>}
      {response && (
        <pre className="rounded bg-slate-50 p-3 text-xs text-slate-800">
          {response}
        </pre>
      )}
    </div>
  );
}
