"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AdminOrderInput,
  PageSize,
  SessionStatus,
  SessionWithOrders,
} from "@/lib/types";
import { PAGE_SIZE_OPTIONS } from "@/lib/types";
import { formatDateTime } from "@/lib/format";

const STORAGE_KEY = "gate_admin_key";
const ADMIN_HEADER = "x-admin-key";

type Mode = "list" | "create" | "edit";

interface FormState {
  driverName: string;
  vehiclePlate: string;
  gateCode: string;
  status: SessionStatus;
  createdAt: string;
  exportStartedAt: string;
  exportEstimatedAt: string;
  exportFinishedAt: string;
  orders: AdminOrderInput[];
}

const EMPTY_FORM: FormState = {
  driverName: "",
  vehiclePlate: "",
  gateCode: "",
  status: "scanning",
  createdAt: "",
  exportStartedAt: "",
  exportEstimatedAt: "",
  exportFinishedAt: "",
  orders: [],
};

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIsoOrNull(local: string): string | null {
  if (!local.trim()) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [authError, setAuthError] = useState("");
  const [sessions, setSessions] = useState<SessionWithOrders[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<PageSize>(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>("list");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) setAdminKey(saved);
  }, []);

  const apiFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      if (!adminKey) throw new Error("Chưa đăng nhập");
      const res = await fetch(url, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          [ADMIN_HEADER]: adminKey,
          ...init?.headers,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Lỗi máy chủ");
      return data;
    },
    [adminKey]
  );

  const loadSessions = useCallback(async () => {
    if (!adminKey) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch(
        `/api/admin/sessions?page=${page}&limit=${limit}`
      );
      setSessions(data.sessions ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch (e) {
      setError((e as Error).message);
      if ((e as Error).message.includes("quyền")) {
        sessionStorage.removeItem(STORAGE_KEY);
        setAdminKey(null);
      }
    } finally {
      setLoading(false);
    }
  }, [adminKey, apiFetch, page, limit]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const login = async () => {
    setAuthError("");
    try {
      const res = await fetch("/api/admin/sessions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sai mã PIN");
      sessionStorage.setItem(STORAGE_KEY, pin);
      setAdminKey(pin);
      setPin("");
    } catch (e) {
      setAuthError((e as Error).message);
    }
  };

  const logout = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    setAdminKey(null);
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setMode("create");
    setMessage("");
    setError("");
  };

  const openEdit = (s: SessionWithOrders) => {
    setForm({
      driverName: s.driver_name,
      vehiclePlate: s.vehicle_plate,
      gateCode: s.gate_code,
      status: s.status,
      createdAt: toLocalInput(s.created_at),
      exportStartedAt: toLocalInput(s.export_started_at),
      exportEstimatedAt: toLocalInput(s.export_estimated_at),
      exportFinishedAt: toLocalInput(s.export_finished_at),
      orders: s.orders.map((o) => ({ id: o.id, orderCode: o.order_code })),
    });
    setEditingId(s.id);
    setMode("edit");
    setMessage("");
    setError("");
  };

  const closeForm = () => {
    setMode("list");
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const saveForm = async () => {
    setError("");
    setMessage("");
    const payload = {
      driverName: form.driverName,
      vehiclePlate: form.vehiclePlate,
      gateCode: form.gateCode,
      status: form.status,
      createdAt: toIsoOrNull(form.createdAt),
      exportStartedAt: toIsoOrNull(form.exportStartedAt),
      exportEstimatedAt: toIsoOrNull(form.exportEstimatedAt),
      exportFinishedAt: toIsoOrNull(form.exportFinishedAt),
      orders: form.orders.filter((o) => o.orderCode.trim()),
      orderCodes: form.orders.map((o) => o.orderCode.trim()).filter(Boolean),
    };

    try {
      if (mode === "create") {
        await apiFetch("/api/admin/sessions", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setMessage("Đã thêm phiên mới");
      } else if (editingId) {
        await apiFetch(`/api/admin/sessions/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setMessage("Đã cập nhật phiên");
      }
      closeForm();
      loadSessions();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const deleteSession = async (id: number) => {
    if (!confirm(`Xóa phiên #${id}? Hành động không thể hoàn tác.`)) return;
    setError("");
    try {
      await apiFetch(`/api/admin/sessions/${id}`, { method: "DELETE" });
      setMessage(`Đã xóa phiên #${id}`);
      loadSessions();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const addOrderRow = () => {
    setForm((f) => ({
      ...f,
      orders: [...f.orders, { orderCode: "" }],
    }));
  };

  const updateOrderRow = (index: number, orderCode: string) => {
    setForm((f) => ({
      ...f,
      orders: f.orders.map((o, i) => (i === index ? { ...o, orderCode } : o)),
    }));
  };

  const removeOrderRow = (index: number) => {
    setForm((f) => ({
      ...f,
      orders: f.orders.filter((_, i) => i !== index),
    }));
  };

  if (!adminKey) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-bold text-slate-800">Quản lý dữ liệu</h1>
          <p className="mt-1 text-sm text-slate-500">
            Trang ẩn — nhập mã PIN để truy cập
          </p>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()}
            placeholder="Mã PIN"
            className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500"
          />
          {authError && (
            <p className="mt-2 text-sm text-red-600">{authError}</p>
          )}
          <button
            onClick={login}
            className="mt-4 w-full rounded-xl bg-slate-800 py-3 font-semibold text-white active:bg-slate-900"
          >
            Vào trang quản lý
          </button>
        </div>
      </main>
    );
  }

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800">
            Quản lý lịch sử (ẩn)
          </h1>
          <p className="text-sm text-slate-500">
            Thêm · sửa · xóa phiên xuất hàng trong database
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={openCreate}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
          >
            + Thêm mới
          </button>
          <button
            onClick={logout}
            className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Đăng xuất
          </button>
        </div>
      </header>

      {message && (
        <div className="mb-3 rounded-xl bg-green-100 px-4 py-2 text-sm font-medium text-green-800">
          {message}
        </div>
      )}
      {error && (
        <div className="mb-3 rounded-xl bg-red-100 px-4 py-2 text-sm font-medium text-red-800">
          {error}
        </div>
      )}

      {mode !== "list" && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="mb-4 text-base font-bold text-slate-800">
            {mode === "create" ? "Thêm phiên mới" : `Sửa phiên #${editingId}`}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Tài xế">
              <input
                value={form.driverName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, driverName: e.target.value }))
                }
                className={inputCls}
              />
            </Field>
            <Field label="Biển số">
              <input
                value={form.vehiclePlate}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    vehiclePlate: e.target.value.toUpperCase(),
                  }))
                }
                className={inputCls}
              />
            </Field>
            <Field label="Cổng">
              <input
                value={form.gateCode}
                onChange={(e) =>
                  setForm((f) => ({ ...f, gateCode: e.target.value }))
                }
                className={inputCls}
              />
            </Field>
            <Field label="Trạng thái">
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    status: e.target.value as SessionStatus,
                  }))
                }
                className={inputCls}
              >
                <option value="scanning">Đang quét</option>
                <option value="exporting">Đang xuất</option>
                <option value="done">Hoàn thành</option>
              </select>
            </Field>
            <Field label="Vào cổng">
              <input
                type="datetime-local"
                value={form.createdAt}
                onChange={(e) =>
                  setForm((f) => ({ ...f, createdAt: e.target.value }))
                }
                className={inputCls}
              />
            </Field>
            <Field label="Bắt đầu xuất">
              <input
                type="datetime-local"
                value={form.exportStartedAt}
                onChange={(e) =>
                  setForm((f) => ({ ...f, exportStartedAt: e.target.value }))
                }
                className={inputCls}
              />
            </Field>
            <Field label="Dự kiến xong">
              <input
                type="datetime-local"
                value={form.exportEstimatedAt}
                onChange={(e) =>
                  setForm((f) => ({ ...f, exportEstimatedAt: e.target.value }))
                }
                className={inputCls}
              />
            </Field>
            <Field label="Xuất xong">
              <input
                type="datetime-local"
                value={form.exportFinishedAt}
                onChange={(e) =>
                  setForm((f) => ({ ...f, exportFinishedAt: e.target.value }))
                }
                className={inputCls}
              />
            </Field>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">
                Đơn hàng
              </span>
              <button
                type="button"
                onClick={addOrderRow}
                className="text-sm font-semibold text-blue-600"
              >
                + Thêm đơn
              </button>
            </div>
            {form.orders.length === 0 ? (
              <p className="text-sm text-slate-400">Chưa có đơn</p>
            ) : (
              <div className="flex flex-col gap-2">
                {form.orders.map((o, i) => (
                  <div key={o.id ?? `new-${i}`} className="flex gap-2">
                    <input
                      value={o.orderCode}
                      onChange={(e) => updateOrderRow(i, e.target.value)}
                      placeholder="Mã đơn"
                      className={`${inputCls} flex-1 font-mono`}
                    />
                    <button
                      type="button"
                      onClick={() => removeOrderRow(i)}
                      className="rounded-lg bg-red-100 px-3 text-sm font-semibold text-red-700"
                    >
                      Xóa
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-5 flex gap-2">
            <button
              onClick={saveForm}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white"
            >
              Lưu
            </button>
            <button
              onClick={closeForm}
              className="rounded-lg bg-slate-200 px-5 py-2 text-sm font-semibold text-slate-700"
            >
              Hủy
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">
            Đang tải...
          </div>
        ) : sessions.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">
            Chưa có dữ liệu
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Cổng</th>
                  <th className="px-3 py-2">Biển số</th>
                  <th className="px-3 py-2">Tài xế</th>
                  <th className="px-3 py-2">Đơn</th>
                  <th className="px-3 py-2">Trạng thái</th>
                  <th className="px-3 py-2">Xuất xong</th>
                  <th className="px-3 py-2">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sessions.map((s) => (
                  <tr key={s.id} className="text-slate-700">
                    <td className="px-3 py-2 font-mono text-xs">{s.id}</td>
                    <td className="px-3 py-2 font-semibold">{s.gate_code}</td>
                    <td className="px-3 py-2 font-bold">{s.vehicle_plate}</td>
                    <td className="px-3 py-2">{s.driver_name}</td>
                    <td className="px-3 py-2">{s.orders_count}</td>
                    <td className="px-3 py-2">{s.status}</td>
                    <td className="px-3 py-2">
                      {formatDateTime(s.export_finished_at)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button
                          onClick={() => openEdit(s)}
                          className="rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800"
                        >
                          Sửa
                        </button>
                        <button
                          onClick={() => deleteSession(s.id)}
                          className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700"
                        >
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span>Hiển thị</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value) as PageSize);
                setPage(1);
              }}
              className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <span>
              · {from}–{to} / {total}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-40"
            >
              ‹
            </button>
            <span className="px-2 text-sm">
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-40"
            >
              ›
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}
