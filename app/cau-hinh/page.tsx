"use client";

import AppNav from "@/components/AppNav";
import { minutesToTimeLabel } from "@/lib/plan-parse";
import {
  ALL_DAYS_MASK,
  WEEKDAY_BITS,
  daysMaskFromWeekdays,
  formatDaysMask,
  weekdaysFromMask,
} from "@/lib/gate-weekdays";
import type { CarrierRow, GateRow } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";

type Tab = "carriers" | "gates" | "assign" | "links";

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500";

function minutesFromTimeInput(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function timeInputFromMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function CauHinhPage() {
  const [tab, setTab] = useState<Tab>("carriers");
  const [carriers, setCarriers] = useState<CarrierRow[]>([]);
  const [gates, setGates] = useState<GateRow[]>([]);
  const [links, setLinks] = useState<
    { kind: string; token: string; url: string }[]
  >([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [newCarrier, setNewCarrier] = useState({ code: "", name: "" });
  const [newGate, setNewGate] = useState<{
    code: string;
    name: string;
    start: string;
    end: string;
    load: string;
    weekdays: number[];
  }>({
    code: "",
    name: "",
    start: "05:00",
    end: "12:00",
    load: "30",
    weekdays: WEEKDAY_BITS.map((b) => b.day),
  });

  const [editingGate, setEditingGate] = useState<GateRow | null>(null);
  const [editGateForm, setEditGateForm] = useState({
    code: "",
    name: "",
    start: "05:00",
    end: "12:00",
    load: "30",
    weekdays: [] as number[],
    active: true,
  });

  const [assignCarrierId, setAssignCarrierId] = useState<number | null>(null);
  const [assignedGateIds, setAssignedGateIds] = useState<number[]>([]);
  const [slotGateId, setSlotGateId] = useState<number | null>(null);
  const [slotConfig, setSlotConfig] = useState<{
    slots: { minutes: number; label: string }[];
    hidden: number[];
  }>({ slots: [], hidden: [] });

  const load = useCallback(async () => {
    setError("");
    try {
      const [cRes, gRes, lRes] = await Promise.all([
        fetch("/api/config/carriers"),
        fetch("/api/config/gates"),
        fetch("/api/config/links"),
      ]);
      if (!cRes.ok || !gRes.ok || !lRes.ok) {
        throw new Error("Không có quyền hoặc lỗi tải cấu hình");
      }
      const cData = await cRes.json();
      const gData = await gRes.json();
      const lData = await lRes.json();
      setCarriers(cData.carriers ?? []);
      setGates(gData.gates ?? []);
      setLinks(lData.links ?? []);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadAssignment = async (carrierId: number) => {
    setAssignCarrierId(carrierId);
    const res = await fetch(
      `/api/config/carrier-gates?carrierId=${carrierId}`
    );
    const data = await res.json();
    setAssignedGateIds(data.gateIds ?? []);
    setSlotGateId(null);
    setSlotConfig({ slots: [], hidden: [] });
  };

  const loadSlots = async (carrierId: number, gateId: number) => {
    setSlotGateId(gateId);
    const res = await fetch(
      `/api/config/carrier-gates?carrierId=${carrierId}&gateId=${gateId}`
    );
    const data = await res.json();
    setSlotConfig(data);
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setMessage("Đã copy link");
  };

  const addCarrier = async () => {
    const res = await fetch("/api/config/carriers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newCarrier),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Lỗi");
      return;
    }
    setNewCarrier({ code: "", name: "" });
    setMessage("Đã thêm nhà vận tải");
    load();
  };

  const addGate = async () => {
    const res = await fetch("/api/config/gates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: newGate.code,
        name: newGate.name,
        startMinutes: minutesFromTimeInput(newGate.start),
        endMinutes: minutesFromTimeInput(newGate.end),
        loadMinutes: Number(newGate.load) || 30,
        daysMask: daysMaskFromWeekdays(newGate.weekdays),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Lỗi");
      return;
    }
    setNewGate({
      code: "",
      name: "",
      start: "05:00",
      end: "12:00",
      load: "30",
      weekdays: WEEKDAY_BITS.map((b) => b.day),
    });
    setMessage("Đã thêm cổng");
    load();
  };

  const openEditGate = (gate: GateRow) => {
    setEditingGate(gate);
    setEditGateForm({
      code: gate.code,
      name: gate.name,
      start: timeInputFromMinutes(gate.start_minutes),
      end: timeInputFromMinutes(gate.end_minutes),
      load: String(gate.load_minutes),
      weekdays: weekdaysFromMask(gate.days_mask ?? ALL_DAYS_MASK),
      active: gate.active === 1,
    });
  };

  const saveEditGate = async () => {
    if (!editingGate) return;
    const res = await fetch(`/api/config/gates/${editingGate.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: editGateForm.code,
        name: editGateForm.name,
        startMinutes: minutesFromTimeInput(editGateForm.start),
        endMinutes: minutesFromTimeInput(editGateForm.end),
        loadMinutes: Number(editGateForm.load) || 30,
        daysMask: daysMaskFromWeekdays(editGateForm.weekdays),
        active: editGateForm.active,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Lỗi");
      return;
    }
    setEditingGate(null);
    setMessage("Đã cập nhật cổng");
    load();
  };

  const toggleWeekday = (
    day: number,
    checked: boolean,
    mode: "new" | "edit"
  ) => {
    if (mode === "new") {
      setNewGate((prev) => ({
        ...prev,
        weekdays: checked
          ? [...prev.weekdays, day]
          : prev.weekdays.filter((d) => d !== day),
      }));
    } else {
      setEditGateForm((prev) => ({
        ...prev,
        weekdays: checked
          ? [...prev.weekdays, day]
          : prev.weekdays.filter((d) => d !== day),
      }));
    }
  };

  const saveAssignment = async () => {
    if (!assignCarrierId) return;
    await fetch("/api/config/carrier-gates", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        carrierId: assignCarrierId,
        gateIds: assignedGateIds,
      }),
    });
    setMessage("Đã lưu phân quyền cổng");
  };

  const toggleSlot = async (slotMinutes: number, hidden: boolean) => {
    if (!assignCarrierId || !slotGateId) return;
    await fetch("/api/config/carrier-gates", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        carrierId: assignCarrierId,
        gateId: slotGateId,
        slotMinutes,
        hidden,
      }),
    });
    loadSlots(assignCarrierId, slotGateId);
  };

  const regenerateLink = async (kind: string) => {
    const res = await fetch("/api/config/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    if (!res.ok) {
      setError("Lỗi tạo lại link");
      return;
    }
    setMessage(`Đã tạo lại link ${kind}`);
    load();
  };

  const regenerateCarrierToken = async (id: number) => {
    const res = await fetch(`/api/config/carriers/${id}/token`, {
      method: "POST",
    });
    if (!res.ok) {
      setError("Lỗi tạo lại token");
      return;
    }
    setMessage("Đã tạo lại link nhà vận tải");
    load();
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "carriers", label: "Nhà vận tải" },
    { id: "gates", label: "Cổng" },
    { id: "assign", label: "Phân quyền" },
    { id: "links", label: "Link truy cập" },
  ];

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-6">
      <AppNav />
      <header className="mb-5">
        <h1 className="text-2xl font-extrabold text-slate-800">Cấu hình hệ thống</h1>
        <p className="text-sm text-slate-500">
          Quản lý nhà vận tải, cổng, khung giờ và link truy cập
        </p>
      </header>

      {message && (
        <div className="mb-3 rounded-xl bg-green-100 px-4 py-2 text-sm text-green-800">
          {message}
        </div>
      )}
      {error && (
        <div className="mb-3 rounded-xl bg-red-100 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              tab === t.id
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "carriers" && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-bold">Thêm nhà vận tải</h2>
            <div className="grid grid-cols-2 gap-2">
              <input
                className={inputCls}
                placeholder="Mã (TH, HTL...)"
                value={newCarrier.code}
                onChange={(e) =>
                  setNewCarrier({ ...newCarrier, code: e.target.value })
                }
              />
              <input
                className={inputCls}
                placeholder="Tên"
                value={newCarrier.name}
                onChange={(e) =>
                  setNewCarrier({ ...newCarrier, name: e.target.value })
                }
              />
            </div>
            <button
              type="button"
              onClick={addCarrier}
              className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Thêm
            </button>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-3 py-2">Mã</th>
                  <th className="px-3 py-2">Tên</th>
                  <th className="px-3 py-2">Link</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {carriers.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-mono font-semibold">{c.code}</td>
                    <td className="px-3 py-2">{c.name}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() =>
                          copyText(`${window.location.origin}/r/${c.token}`)
                        }
                        className="text-xs text-blue-600 underline"
                      >
                        Copy link
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => regenerateCarrierToken(c.id)}
                        className="text-xs text-slate-500"
                      >
                        Đổi link
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "gates" && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-bold">Thêm cổng</h2>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
              <input
                className={inputCls}
                placeholder="Mã cổng (Cua 3)"
                value={newGate.code}
                onChange={(e) =>
                  setNewGate({ ...newGate, code: e.target.value })
                }
              />
              <input
                className={inputCls}
                placeholder="Tên hiển thị"
                value={newGate.name}
                onChange={(e) =>
                  setNewGate({ ...newGate, name: e.target.value })
                }
              />
              <input
                className={inputCls}
                type="time"
                value={newGate.start}
                onChange={(e) =>
                  setNewGate({ ...newGate, start: e.target.value })
                }
              />
              <input
                className={inputCls}
                type="time"
                value={newGate.end}
                onChange={(e) =>
                  setNewGate({ ...newGate, end: e.target.value })
                }
              />
              <input
                className={inputCls}
                placeholder="Load (phút)"
                value={newGate.load}
                onChange={(e) =>
                  setNewGate({ ...newGate, load: e.target.value })
                }
              />
            </div>
            <div className="mt-3">
              <p className="mb-2 text-xs font-semibold text-slate-500">
                Ngày mở cổng
              </p>
              <div className="flex flex-wrap gap-3">
                {WEEKDAY_BITS.map(({ day, label }) => (
                  <label
                    key={day}
                    className="flex items-center gap-1.5 text-sm text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={newGate.weekdays.includes(day)}
                      onChange={(e) =>
                        toggleWeekday(day, e.target.checked, "new")
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={addGate}
              className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Thêm cổng
            </button>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-3 py-2">Mã</th>
                  <th className="px-3 py-2">Tên</th>
                  <th className="px-3 py-2">Khung giờ</th>
                  <th className="px-3 py-2">Load</th>
                  <th className="px-3 py-2">Ngày mở</th>
                  <th className="px-3 py-2">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {gates.map((g) => (
                  <tr key={g.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-semibold">{g.code}</td>
                    <td className="px-3 py-2">{g.name}</td>
                    <td className="px-3 py-2">
                      {minutesToTimeLabel(g.start_minutes)} –{" "}
                      {minutesToTimeLabel(g.end_minutes)}
                    </td>
                    <td className="px-3 py-2">{g.load_minutes}p</td>
                    <td className="px-3 py-2 text-xs">
                      {formatDaysMask(g.days_mask ?? ALL_DAYS_MASK)}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => openEditGate(g)}
                        className="rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800"
                      >
                        Sửa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "assign" && (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-bold">Chọn nhà vận tải</h2>
            <div className="space-y-2">
              {carriers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => loadAssignment(c.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                    assignCarrierId === c.id
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200"
                  }`}
                >
                  <span className="font-semibold">{c.code}</span> — {c.name}
                </button>
              ))}
            </div>
          </div>
          {assignCarrierId && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="mb-3 font-bold">Cổng được phép</h2>
                <div className="space-y-2">
                  {gates.map((g) => (
                    <label
                      key={g.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={assignedGateIds.includes(g.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setAssignedGateIds([...assignedGateIds, g.id]);
                          } else {
                            setAssignedGateIds(
                              assignedGateIds.filter((id) => id !== g.id)
                            );
                          }
                        }}
                      />
                      {g.code} — {g.name}
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={saveAssignment}
                  className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
                >
                  Lưu phân quyền
                </button>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="mb-3 font-bold">Ẩn/hiện khung giờ</h2>
                <div className="mb-2 flex flex-wrap gap-2">
                  {gates
                    .filter((g) => assignedGateIds.includes(g.id))
                    .map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => loadSlots(assignCarrierId, g.id)}
                        className={`rounded-lg px-3 py-1 text-xs font-semibold ${
                          slotGateId === g.id
                            ? "bg-blue-600 text-white"
                            : "bg-slate-100"
                        }`}
                      >
                        {g.code}
                      </button>
                    ))}
                </div>
                {slotGateId && (
                  <div className="flex flex-wrap gap-2">
                    {slotConfig.slots.map((s) => {
                      const hidden = slotConfig.hidden.includes(s.minutes);
                      return (
                        <button
                          key={s.minutes}
                          type="button"
                          onClick={() => toggleSlot(s.minutes, !hidden)}
                          className={`rounded-lg px-2 py-1 text-xs font-semibold ${
                            hidden
                              ? "bg-slate-200 text-slate-400 line-through"
                              : "bg-green-100 text-green-800"
                          }`}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {tab === "links" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-bold">Link truy cập hệ thống</h2>
          <div className="space-y-3">
            {links.map((l) => (
              <div
                key={l.kind}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 p-3"
              >
                <div>
                  <p className="font-semibold capitalize">{l.kind}</p>
                  <p className="break-all text-xs text-slate-500">{l.url}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => copyText(l.url)}
                    className="rounded-lg border px-3 py-1 text-xs font-semibold"
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={() => regenerateLink(l.kind)}
                    className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-semibold"
                  >
                    Đổi link
                  </button>
                </div>
              </div>
            ))}
            <p className="text-xs text-slate-500">
              Mỗi nhà vận tải có link riêng tại tab Nhà vận tải. Link kho = full
              quyền. Link driver = tài xế.
            </p>
          </div>
        </section>
      )}
      {editingGate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="mb-3 font-bold">Sửa cổng — {editingGate.code}</h3>
            <div className="grid grid-cols-2 gap-2">
              <input
                className={inputCls}
                placeholder="Mã cổng"
                value={editGateForm.code}
                onChange={(e) =>
                  setEditGateForm({ ...editGateForm, code: e.target.value })
                }
              />
              <input
                className={inputCls}
                placeholder="Tên hiển thị"
                value={editGateForm.name}
                onChange={(e) =>
                  setEditGateForm({ ...editGateForm, name: e.target.value })
                }
              />
              <input
                className={inputCls}
                type="time"
                value={editGateForm.start}
                onChange={(e) =>
                  setEditGateForm({ ...editGateForm, start: e.target.value })
                }
              />
              <input
                className={inputCls}
                type="time"
                value={editGateForm.end}
                onChange={(e) =>
                  setEditGateForm({ ...editGateForm, end: e.target.value })
                }
              />
              <input
                className={`${inputCls} col-span-2`}
                placeholder="Load (phút)"
                value={editGateForm.load}
                onChange={(e) =>
                  setEditGateForm({ ...editGateForm, load: e.target.value })
                }
              />
            </div>
            <div className="mt-3">
              <p className="mb-2 text-xs font-semibold text-slate-500">
                Ngày mở cổng
              </p>
              <div className="flex flex-wrap gap-3">
                {WEEKDAY_BITS.map(({ day, label }) => (
                  <label
                    key={day}
                    className="flex items-center gap-1.5 text-sm text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={editGateForm.weekdays.includes(day)}
                      onChange={(e) =>
                        toggleWeekday(day, e.target.checked, "edit")
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editGateForm.active}
                onChange={(e) =>
                  setEditGateForm({ ...editGateForm, active: e.target.checked })
                }
              />
              Cổng đang hoạt động
            </label>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={saveEditGate}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Lưu
              </button>
              <button
                type="button"
                onClick={() => setEditingGate(null)}
                className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
