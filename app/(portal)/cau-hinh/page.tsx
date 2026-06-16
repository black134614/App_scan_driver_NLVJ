"use client";

import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Modal from "@/components/ui/Modal";
import PageHeader from "@/components/ui/PageHeader";
import { SkeletonTable } from "@/components/ui/Skeleton";
import {
  ALL_DAYS_MASK,
  WEEKDAY_BITS,
  daysMaskFromWeekdays,
  formatDaysMask,
  weekdaysFromMask,
} from "@/lib/gate-weekdays";
import { minutesToTimeLabel } from "@/lib/plan-parse";
import { cardCls, inputCls, tableHeadCls, tableRowHoverCls } from "@/lib/ui";
import {
  CARRIER_COLOR_OPTIONS,
  carrierColorStyleByKey,
  type CarrierColorKey,
} from "@/lib/carrier-colors";
import type { CarrierRow, GateRow } from "@/lib/types";
import { useCallback, useEffect, useRef, useState } from "react";

type Tab = "carriers" | "gates" | "assign" | "links";

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
  const [pageLoading, setPageLoading] = useState(true);
  const [savingCarrier, setSavingCarrier] = useState(false);
  const [savingColorId, setSavingColorId] = useState<number | null>(null);
  const [savingGate, setSavingGate] = useState(false);
  const [savingEditGate, setSavingEditGate] = useState(false);
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [regeneratingTokenId, setRegeneratingTokenId] = useState<number | null>(null);
  const [regeneratingLinkKind, setRegeneratingLinkKind] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    type: "carrier" | "gate";
    id: number;
    name: string;
  } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const initialLoaded = useRef(false);
  const assignFetchFor = useRef<number | null>(null);

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

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    setError("");
    if (!opts?.silent && !initialLoaded.current) setPageLoading(true);
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
      setCarriers(
        (cData.carriers ?? []).map((c: CarrierRow) => ({
          ...c,
          id: Number(c.id),
        }))
      );
      setGates(
        (gData.gates ?? []).map((g: GateRow) => ({
          ...g,
          id: Number(g.id),
        }))
      );
      setLinks(lData.links ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      initialLoaded.current = true;
      setPageLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const fetchAssignment = useCallback(async (carrierId: number) => {
    const id = Number(carrierId);
    if (!Number.isInteger(id) || id <= 0) return;

    assignFetchFor.current = id;
    setAssignCarrierId(id);
    setAssignLoading(true);
    setSlotGateId(null);
    setSlotConfig({ slots: [], hidden: [] });
    setError("");

    try {
      const res = await fetch(
        `/api/config/carrier-gates?carrierId=${id}&_=${Date.now()}`,
        { cache: "no-store", credentials: "same-origin" }
      );
      const data = await res.json().catch(() => ({}));
      if (assignFetchFor.current !== id) return;

      if (!res.ok) {
        setAssignedGateIds([]);
        setError(data.error ?? "Không tải được phân quyền cổng");
        return;
      }

      const gateIds = (Array.isArray(data.gateIds) ? data.gateIds : [])
        .map((gid: unknown) => Number(gid))
        .filter((gid: number) => Number.isInteger(gid) && gid > 0);

      setAssignedGateIds(gateIds);
    } catch {
      if (assignFetchFor.current === id) {
        setAssignedGateIds([]);
        setError("Không tải được phân quyền cổng — kiểm tra kết nối");
      }
    } finally {
      if (assignFetchFor.current === id) setAssignLoading(false);
    }
  }, []);

  const selectAssignCarrier = (carrierId: number) => {
    clearFeedback();
    void fetchAssignment(carrierId);
  };

  const clearFeedback = () => {
    setMessage("");
    setError("");
  };

  const loadSlots = async (carrierId: number, gateId: number) => {
    setSlotsLoading(true);
    setSlotGateId(gateId);
    setError("");
    try {
      const res = await fetch(
        `/api/config/carrier-gates?carrierId=${carrierId}&gateId=${gateId}`
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Không tải được khung giờ");
        setSlotConfig({ slots: [], hidden: [] });
        return;
      }
      setSlotConfig({
        slots: Array.isArray(data.slots) ? data.slots : [],
        hidden: Array.isArray(data.hidden) ? data.hidden : [],
      });
    } catch {
      setError("Không tải được khung giờ");
      setSlotConfig({ slots: [], hidden: [] });
    } finally {
      setSlotsLoading(false);
    }
  };

  const copyText = async (text: string) => {
    clearFeedback();
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Đã copy link");
    } catch {
      setError("Không copy được — thử copy thủ công");
    }
  };

  const addCarrier = async () => {
    setSavingCarrier(true);
    clearFeedback();
    try {
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
    load({ silent: true });
    } finally {
      setSavingCarrier(false);
    }
  };

  const updateCarrierColor = async (id: number, color_key: CarrierColorKey) => {
    setSavingColorId(id);
    clearFeedback();
    try {
      const res = await fetch(`/api/config/carriers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color_key }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Không lưu được màu");
        return;
      }
      setCarriers((prev) =>
        prev.map((c) => (c.id === id ? { ...c, color_key } : c))
      );
      setMessage("Đã cập nhật màu dashboard");
    } catch {
      setError("Không lưu được màu");
    } finally {
      setSavingColorId(null);
    }
  };

  const addGate = async () => {
    if (newGate.weekdays.length === 0) {
      setError("Chọn ít nhất một ngày mở cổng");
      return;
    }
    setSavingGate(true);
    clearFeedback();
    try {
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
    load({ silent: true });
    } finally {
      setSavingGate(false);
    }
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
    if (editGateForm.weekdays.length === 0) {
      setError("Chọn ít nhất một ngày mở cổng");
      return;
    }
    setSavingEditGate(true);
    clearFeedback();
    try {
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
    load({ silent: true });
    } finally {
      setSavingEditGate(false);
    }
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
    setSavingAssignment(true);
    clearFeedback();
    try {
    const res = await fetch("/api/config/carrier-gates", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        carrierId: assignCarrierId,
        gateIds: assignedGateIds,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Không lưu được phân quyền");
      return;
    }
    setMessage("Đã lưu phân quyền cổng");
    if (Array.isArray(data.gateIds)) {
      setAssignedGateIds(
        data.gateIds
          .map((gid: unknown) => Number(gid))
          .filter((gid: number) => Number.isInteger(gid) && gid > 0)
      );
    } else {
      await fetchAssignment(assignCarrierId);
    }
    } finally {
      setSavingAssignment(false);
    }
  };

  const toggleSlot = async (slotMinutes: number, hidden: boolean) => {
    if (!assignCarrierId || !slotGateId) return;
    clearFeedback();
    const res = await fetch("/api/config/carrier-gates", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        carrierId: assignCarrierId,
        gateId: slotGateId,
        slotMinutes,
        hidden,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Không cập nhật được khung giờ");
      return;
    }
    loadSlots(assignCarrierId, slotGateId);
  };

  const regenerateLink = async (kind: string) => {
    setRegeneratingLinkKind(kind);
    clearFeedback();
    const res = await fetch("/api/config/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    if (!res.ok) {
      setError("Lỗi tạo lại link");
      setRegeneratingLinkKind(null);
      return;
    }
    setMessage(`Đã tạo lại link ${kind}`);
    load({ silent: true });
    setRegeneratingLinkKind(null);
  };

  const regenerateCarrierToken = async (id: number) => {
    setRegeneratingTokenId(id);
    clearFeedback();
    const res = await fetch(`/api/config/carriers/${id}/token`, {
      method: "POST",
    });
    if (!res.ok) {
      setError("Lỗi tạo lại token");
      setRegeneratingTokenId(null);
      return;
    }
    setMessage("Đã tạo lại link nhà vận tải");
    load({ silent: true });
    setRegeneratingTokenId(null);
  };

  const handleConfirmDelete = async () => {
    if (!confirm) return;
    setConfirmLoading(true);
    clearFeedback();
    try {
      const url =
        confirm.type === "carrier"
          ? `/api/config/carriers/${confirm.id}`
          : `/api/config/gates/${confirm.id}`;
      const res = await fetch(url, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Không xóa được");
      setMessage(
        confirm.type === "carrier"
          ? "Đã xóa nhà vận tải"
          : "Đã xóa cổng"
      );
      setConfirm(null);
      load({ silent: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConfirmLoading(false);
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "carriers", label: "Nhà vận tải" },
    { id: "gates", label: "Cổng" },
    { id: "assign", label: "Phân quyền" },
    { id: "links", label: "Link truy cập" },
  ];

  return (
    <>
      <PageHeader
        title="Cấu hình hệ thống"
        description="Quản lý nhà vận tải, cổng, khung giờ và link truy cập"
      />

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
            onClick={() => {
              setTab(t.id);
              setMessage("");
            }}
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
            <Button
              type="button"
              onClick={addCarrier}
              loading={savingCarrier}
              loadingText="Đang thêm..."
              className="mt-3"
            >
              Thêm
            </Button>
          </div>
          <div className={`overflow-hidden ${cardCls}`}>
            {pageLoading ? (
              <SkeletonTable rows={4} cols={5} />
            ) : carriers.length === 0 ? (
              <p className="py-12 text-center text-sm text-slate-400">
                Chưa có nhà vận tải
              </p>
            ) : (
            <table className="w-full text-left text-sm">
              <thead className={tableHeadCls}>
                <tr>
                  <th className="px-3 py-2">Mã</th>
                  <th className="px-3 py-2">Tên</th>
                  <th className="px-3 py-2">Màu dashboard</th>
                  <th className="px-3 py-2">Link</th>
                  <th className="px-3 py-2">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {carriers.map((c) => {
                  const preview =
                    carrierColorStyleByKey(c.color_key) ??
                    carrierColorStyleByKey("slate")!;
                  return (
                  <tr key={c.id} className={`border-t border-slate-100 ${tableRowHoverCls}`}>
                    <td className="px-3 py-2 font-mono font-semibold">{c.code}</td>
                    <td className="px-3 py-2">{c.name}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-block h-7 w-10 shrink-0 rounded border-2 ${preview.headerBg} ${preview.border}`}
                          title="Xem trước màu header"
                        />
                        <select
                          className={`min-w-[130px] ${inputCls} py-1.5 text-sm`}
                          value={c.color_key ?? "slate"}
                          disabled={savingColorId === c.id}
                          onChange={(e) =>
                            updateCarrierColor(
                              c.id,
                              e.target.value as CarrierColorKey
                            )
                          }
                        >
                          {CARRIER_COLOR_OPTIONS.map((opt) => (
                            <option key={opt.key} value={opt.key}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-blue-600 underline"
                        onClick={() =>
                          copyText(`${window.location.origin}/r/${c.token}`)
                        }
                      >
                        Copy link
                      </Button>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={regeneratingTokenId === c.id}
                          onClick={() => regenerateCarrierToken(c.id)}
                        >
                          Đổi link
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() =>
                            setConfirm({
                              type: "carrier",
                              id: c.id,
                              name: c.name,
                            })
                          }
                        >
                          Xóa
                        </Button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            )}
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
                      className="h-4 w-4 accent-blue-600"
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
            <Button
              type="button"
              onClick={addGate}
              loading={savingGate}
              loadingText="Đang thêm..."
              className="mt-3"
            >
              Thêm cổng
            </Button>
          </div>
          <div className={`overflow-x-auto ${cardCls}`}>
            {pageLoading ? (
              <SkeletonTable rows={4} cols={6} />
            ) : gates.length === 0 ? (
              <p className="py-12 text-center text-sm text-slate-400">
                Chưa có cổng
              </p>
            ) : (
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className={tableHeadCls}>
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
                  <tr key={g.id} className={`border-t border-slate-100 ${tableRowHoverCls}`}>
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
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="bg-amber-100 text-amber-800"
                          onClick={() => openEditGate(g)}
                        >
                          Sửa
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() =>
                            setConfirm({
                              type: "gate",
                              id: g.id,
                              name: g.code,
                            })
                          }
                        >
                          Xóa
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </div>
        </section>
      )}

      {tab === "assign" && (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-bold">Chọn nhà vận tải</h2>
            {pageLoading ? (
              <SkeletonTable rows={3} cols={1} />
            ) : carriers.length === 0 ? (
              <p className="text-sm text-slate-400">Chưa có nhà vận tải</p>
            ) : (
            <div className="space-y-2">
              {carriers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectAssignCarrier(Number(c.id))}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                    Number(assignCarrierId) === Number(c.id)
                      ? "border-blue-500 bg-blue-50 ring-1 ring-blue-200"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <span className="font-semibold">{c.code}</span> — {c.name}
                </button>
              ))}
            </div>
            )}
            {assignLoading && (
              <p className="mt-2 text-xs text-slate-400">Đang tải phân quyền...</p>
            )}
          </div>
          {assignCarrierId && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-bold">Cổng được phép</h2>
                  {!assignLoading && assignedGateIds.length > 0 ? (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                      {assignedGateIds.length} cổng
                    </span>
                  ) : null}
                </div>
                {assignLoading ? (
                  <p className="mb-3 text-sm text-slate-500">
                    Đang tải cổng đã phân quyền...
                  </p>
                ) : assignedGateIds.length === 0 ? (
                  <p className="mb-3 text-sm text-amber-700">
                    Chưa phân quyền cổng nào — tick cổng rồi bấm Lưu
                  </p>
                ) : null}
                <div
                  className={`space-y-2 ${assignLoading ? "pointer-events-none opacity-50" : ""}`}
                >
                  {gates.length === 0 ? (
                    <p className="text-sm text-slate-400">Chưa có cổng</p>
                  ) : (
                  gates.map((g) => (
                    <label
                      key={g.id}
                      className="flex items-center gap-2 rounded-lg border border-slate-100 px-2 py-1.5 text-sm hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 accent-blue-600"
                        checked={assignedGateIds.includes(Number(g.id))}
                        onChange={(e) => {
                          const gateId = Number(g.id);
                          if (e.target.checked) {
                            setAssignedGateIds((prev) =>
                              prev.includes(gateId)
                                ? prev
                                : [...prev, gateId]
                            );
                          } else {
                            setAssignedGateIds((prev) =>
                              prev.filter((id) => id !== gateId)
                            );
                          }
                        }}
                      />
                      {g.code} — {g.name}
                    </label>
                  ))
                  )}
                </div>
                <Button
                  type="button"
                  onClick={saveAssignment}
                  loading={savingAssignment}
                  loadingText="Đang lưu..."
                  className="mt-3"
                >
                  Lưu phân quyền
                </Button>
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
                    {slotsLoading ? (
                      <p className="text-xs text-slate-400">Đang tải khung giờ...</p>
                    ) : slotConfig.slots.length === 0 ? (
                      <p className="text-xs text-slate-400">
                        Không có khung giờ cho cổng này
                      </p>
                    ) : (
                    slotConfig.slots.map((s) => {
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
                    })
                    )}
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
            {pageLoading ? (
              <SkeletonTable rows={2} cols={2} />
            ) : links.length === 0 ? (
              <p className="text-sm text-slate-400">Chưa có link</p>
            ) : (
            links.map((l) => (
              <div
                key={l.kind}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 p-3"
              >
                <div>
                  <p className="font-semibold capitalize">{l.kind}</p>
                  <p className="break-all text-xs text-slate-500">{l.url}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => copyText(l.url)}>
                    Copy
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={regeneratingLinkKind === l.kind}
                    onClick={() => regenerateLink(l.kind)}
                  >
                    Đổi link
                  </Button>
                </div>
              </div>
            ))
            )}
            <p className="text-xs text-slate-500">
              Mỗi nhà vận tải có link riêng tại tab Nhà vận tải. Link kho = full
              quyền. Link driver = tài xế.
            </p>
          </div>
        </section>
      )}
      {editingGate && (
        <Modal open onClose={() => setEditingGate(null)} maxWidth="max-w-lg">
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
                      className="h-4 w-4 accent-blue-600"
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
              <Button
                type="button"
                onClick={saveEditGate}
                loading={savingEditGate}
                loadingText="Đang lưu..."
              >
                Lưu
              </Button>
              <Button
                type="button"
                onClick={() => setEditingGate(null)}
                variant="ghost"
                disabled={savingEditGate}
              >
                Hủy
              </Button>
            </div>
        </Modal>
      )}

      <ConfirmDialog
        open={confirm != null}
        title={confirm?.type === "carrier" ? "Xóa nhà vận tải" : "Xóa cổng"}
        message={
          confirm
            ? `Bạn có chắc muốn xóa "${confirm.name}"? Hành động không hoàn tác.`
            : ""
        }
        confirmLabel="Xóa"
        loading={confirmLoading}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}
