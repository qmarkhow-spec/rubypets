'use client';

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";
import type { AdminAccount, PermissionOption } from "@/lib/admin-types";
import { PERMISSION_OPTIONS } from "@/lib/admin-types";
import { getAdminToken } from "@/lib/admin-auth";

type FormState = {
  adminId: string;
  password: string;
  permission: PermissionOption["value"];
};

export default function AdminAccountsPage() {
  const [items, setItems] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({ adminId: "", password: "", permission: "Inspector" });
  const [rollModal, setRollModal] = useState<string | null>(null);
  const [rollPassword, setRollPassword] = useState(generatePasswordValue());

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: AdminAccount[] }>("/admin/admin-accounts", { headers: tokenHeaders() });
      setItems(res.data);
    } catch (err) {
      setError((err as Error).message || "無法取得管理員列表");
    } finally {
      setLoading(false);
    }
  }

  const permissionLabel = (value: string) => PERMISSION_OPTIONS.find((p) => p.value === value)?.label ?? value;

  function generatePassword() {
    setForm((f) => ({ ...f, password: generatePasswordValue() }));
  }

  function generateRollPassword() {
    setRollPassword(generatePasswordValue());
  }

  async function handleSave() {
    if (!form.adminId || !form.password) {
      setError("帳號與密碼必填");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/admin/admin-accounts", {
        method: "POST",
        headers: tokenHeaders(),
        body: JSON.stringify({ adminId: form.adminId, password: form.password, permission: form.permission })
      });
      setShowModal(false);
      setForm({ adminId: "", password: "", permission: "Inspector" });
      await load();
    } catch (err) {
      setError((err as Error).message || "建立失敗");
    } finally {
      setSaving(false);
    }
  }

  function openRollModal(adminId: string) {
    setError(null);
    setRollPassword(generatePasswordValue());
    setRollModal(adminId);
  }

  async function handleRollSave() {
    if (!rollModal) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/admin/admin-accounts/${encodeURIComponent(rollModal)}/roll`, {
        method: "POST",
        headers: tokenHeaders(),
        body: JSON.stringify({ password: rollPassword })
      });
      setRollModal(null);
      await load();
    } catch (err) {
      setError((err as Error).message || "重置失敗");
    } finally {
      setSaving(false);
    }
  }

  const sorted = useMemo(() => items, [items]);

  return (
    <AppShell
      title="管理員帳號"
      intro="管理 admin_accounts 的登入帳號與權限，密碼不會顯示。"
      actions={
        <button className="btn" onClick={() => setShowModal(true)}>
          新增管理員
        </button>
      }
    >
      <section className="card">
        <h3>帳號列表</h3>
        {error ? <div className="callout" style={{ color: "#fecdd3" }}>{error}</div> : null}
        <table className="table" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>ID</th>
              <th>帳號</th>
              <th>權限</th>
              <th>建立時間</th>
              <th>最近上線</th>
              <th>最近修改</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ color: "var(--muted)" }}>
                  {loading ? "載入中..." : "目前沒有管理員帳號。"}
                </td>
              </tr>
            ) : (
              sorted.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>{item.adminId}</td>
                  <td>{permissionLabel(item.permission)}</td>
                  <td>{new Date(item.createdAt).toLocaleString()}</td>
                  <td>{item.lastAt ? new Date(item.lastAt).toLocaleString() : "—"}</td>
                  <td>{new Date(item.updatedAt).toLocaleString()}</td>
                  <td>
                    <button className="btn ghost" onClick={() => openRollModal(item.adminId)}>
                      roll
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {showModal ? (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>新增管理員</h3>
            <div className="form-grid" style={{ marginTop: 10 }}>
              <div className="field">
                <label>帳號</label>
                <input
                  value={form.adminId}
                  onChange={(e) => setForm((f) => ({ ...f, adminId: e.target.value }))}
                  placeholder="admin_id"
                />
              </div>
              <div className="field">
                <label>密碼</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    style={{ flex: 1 }}
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="輸入或生成隨機密碼"
                  />
                  <button type="button" className="btn ghost" onClick={generatePassword}>
                    生成隨機密碼
                  </button>
                </div>
              </div>
              <div className="field">
                <label>權限</label>
                <select
                  value={form.permission}
                  onChange={(e) => setForm((f) => ({ ...f, permission: e.target.value as FormState["permission"] }))}
                >
                  {PERMISSION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="btn-row" style={{ justifyContent: "flex-end", marginTop: 14 }}>
              <button className="btn ghost" onClick={() => setShowModal(false)} disabled={saving}>
                取消
              </button>
              <button className="btn" onClick={handleSave} disabled={saving}>
                {saving ? "儲存中..." : "確定"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {rollModal ? (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>重置密碼</h3>
            <p className="helper">帳號：{rollModal}</p>
            <div className="field" style={{ marginTop: 10 }}>
              <label>新密碼</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={rollPassword} readOnly />
                <button type="button" className="btn ghost" onClick={generateRollPassword}>
                  重新生成
                </button>
              </div>
            </div>
            {error ? <div className="callout" style={{ color: "#fecdd3" }}>{error}</div> : null}
            <div className="btn-row" style={{ justifyContent: "flex-end", marginTop: 14 }}>
              <button className="btn ghost" onClick={() => setRollModal(null)} disabled={saving}>
                取消
              </button>
              <button className="btn" onClick={handleRollSave} disabled={saving}>
                {saving ? "儲存中..." : "確定"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

function tokenHeaders() {
  const token = getAdminToken();
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  return headers;
}

function generatePasswordValue() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  let out = "";
  for (let i = 0; i < 12; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}
