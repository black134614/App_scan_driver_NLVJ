"use client";

import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import PageHeader from "@/components/ui/PageHeader";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { isPastDate } from "@/lib/access-shared";
import { isGateOpenOnDate } from "@/lib/gate-weekdays";
import { parseSheetRows, todayDateString } from "@/lib/plan-parse";
import { usePortal } from "@/lib/portal-context";
import { inputCls, tableHeadCls, tableRowHoverCls } from "@/lib/ui";
import type { GateRow, PlanOrderRow, TimeSlot } from "@/lib/types";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

interface PreviewRow {
  rowNumber: number;
  planDate: string;
  gateCode: string;
  expectedTime: string;
  orderCode: string;
  tonnage: number | null;
  vehiclePlate: string | null;
  driverName: string | null;
  errors: string[];
}

interface ManualOrderLine {
  orderCode: string;
  tonnage: string;
}

interface StagingGroup {
  groupKey: string;
  plate: string | null;
  driverName: string | null;
  rows: PreviewRow[];
  gateId: number | "";
  expectedTime: string;
}

function buildStagingGroups(rows: PreviewRow[]): StagingGroup[] {
  const valid = rows.filter((r) => r.errors.length === 0);
  const map = new Map<string, StagingGroup>();
  for (const row of valid) {
    const plate = row.vehiclePlate;
    const key = plate ?? `__row_${row.rowNumber}`;
    if (!map.has(key)) {
      map.set(key, {
        groupKey: key,
        plate,
        driverName: row.driverName,
        rows: [],
        gateId: "",
        expectedTime: "",
      });
    }
    const group = map.get(key)!;
    group.rows.push(row);
    if (!group.driverName && row.driverName) {
      group.driverName = row.driverName;
    }
  }
  return Array.from(map.values());
}


export default function KeHoachPage() {
  const [planDate, setPlanDate] = useState(todayDateString());
  const [orders, setOrders] = useState<PlanOrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [replaceOnImport, setReplaceOnImport] = useState(true);
  const [importing, setImporting] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const carrierFileInputRef = useRef<HTMLInputElement>(null);

  const [staging, setStaging] = useState<StagingGroup[]>([]);
  const [carrierFileName, setCarrierFileName] = useState("");
  const [savingStaging, setSavingStaging] = useState(false);

  const [manualGate, setManualGate] = useState("");
  const [manualTime, setManualTime] = useState("");
  const [manualPlate, setManualPlate] = useState("");
  const [manualDriver, setManualDriver] = useState("");
  const [manualLines, setManualLines] = useState<ManualOrderLine[]>([
    { orderCode: "", tonnage: "" },
  ]);

  const [editing, setEditing] = useState<PlanOrderRow | null>(null);
  const [editTonnageStr, setEditTonnageStr] = useState("");
  const { role, ready: portalReady } = usePortal();
  const [gates, setGates] = useState<GateRow[]>([]);
  const [manualGateId, setManualGateId] = useState<number | "">("");
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [editSlots, setEditSlots] = useState<TimeSlot[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [savingManual, setSavingManual] = useState(false);

  const manualSlotSeq = useRef(0);
  const editSlotSeq = useRef(0);

  const canEdit =
    portalReady &&
    (role === "warehouse" ||
      (role === "carrier" && !isPastDate(planDate)));

  const openGates = useMemo(
    () => gates.filter((g) => isGateOpenOnDate(g, planDate)),
    [gates, planDate]
  );

  const gateNameByCode = useMemo(() => {
    const map: Record<string, string> = {};
    for (const g of gates) {
      map[g.code] = g.name?.trim() || g.code;
    }
    return map;
  }, [gates]);

  const editOpenGates = useMemo(() => {
    if (!editing) return [];
    return gates.filter((g) => isGateOpenOnDate(g, editing.plan_date));
  }, [gates, editing]);

  const editGateOptions = useMemo(() => {
    if (!editing) return editOpenGates;
    const current = gates.find((g) => g.code === editing.gate_code);
    if (current && !editOpenGates.some((g) => g.id === current.id)) {
      return [current, ...editOpenGates];
    }
    return editOpenGates;
  }, [editOpenGates, editing, gates]);

  const editTimeOptions = useMemo(() => {
    if (!editing?.expected_time) return editSlots;
    if (editSlots.some((s) => s.label === editing.expected_time)) {
      return editSlots;
    }
    return [
      { minutes: editing.expected_minutes, label: editing.expected_time },
      ...editSlots,
    ];
  }, [editSlots, editing]);

  const loadGates = useCallback(async () => {
    try {
      const res = await fetch("/api/config/gates", { cache: "no-store" });
      const data = await res.json();
      setGates(data.gates ?? []);
    } catch {
      setGates([]);
    }
  }, []);

  useEffect(() => {
    loadGates();
  }, [loadGates]);

  useEffect(() => {
    if (editing) {
      setEditTonnageStr(
        editing.tonnage != null ? String(editing.tonnage) : ""
      );
    }
  }, [editing?.id, editing?.tonnage]);

  useEffect(() => {
    setPreview([]);
    setStaging([]);
    setSelectedFileName("");
    setCarrierFileName("");
    setManualLines([{ orderCode: "", tonnage: "" }]);
    setManualGate("");
    setManualTime("");
    setManualPlate("");
    setManualDriver("");
    setManualGateId("");
    setMessage("");
  }, [planDate]);

  useEffect(() => {
    if (manualGateId && !openGates.some((g) => g.id === manualGateId)) {
      setManualGateId("");
      setManualGate("");
      setManualTime("");
    }
  }, [openGates, manualGateId]);

  useEffect(() => {
    if (!manualGateId || !canEdit) {
      setSlots([]);
      return;
    }
    const seq = ++manualSlotSeq.current;
    const params = new URLSearchParams({
      date: planDate,
      gateId: String(manualGateId),
    });
    if (manualPlate.trim()) params.set("excludePlate", manualPlate.trim());
    fetch(`/api/plans/slots?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (seq !== manualSlotSeq.current) return;
        setSlots(d.slots ?? []);
      })
      .catch(() => {
        if (seq === manualSlotSeq.current) setSlots([]);
      });
  }, [manualGateId, planDate, manualPlate, canEdit]);

  useEffect(() => {
    if (!editing || gates.length === 0) {
      setEditSlots([]);
      return;
    }
    const gate = gates.find((g) => g.code === editing.gate_code);
    if (!gate) {
      setEditSlots([]);
      return;
    }
    const params = new URLSearchParams({
      date: editing.plan_date,
      gateId: String(gate.id),
    });
    if (editing.vehicle_plate) {
      params.set("excludePlate", editing.vehicle_plate);
    }
    const seq = ++editSlotSeq.current;
    fetch(`/api/plans/slots?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (seq !== editSlotSeq.current) return;
        setEditSlots(d.slots ?? []);
      })
      .catch(() => {
        if (seq === editSlotSeq.current) setEditSlots([]);
      });
  }, [
    editing?.id,
    editing?.gate_code,
    editing?.plan_date,
    editing?.vehicle_plate,
    gates,
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/plans?date=${planDate}&list=1`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lỗi tải dữ liệu");
      setOrders(data.orders ?? []);
    } catch (e) {
      setError((e as Error).message);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [planDate]);

  useEffect(() => {
    load();
  }, [load]);

  const handleFile = async (file: File) => {
    setError("");
    setMessage("");
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
    });
    if (json.length === 0) {
      setError("File trống");
      return;
    }
    const headers = Object.keys(json[0]);
    const parsed = parseSheetRows(headers, json, planDate);
    setPreview(parsed);
    setSelectedFileName(file.name);
    setMessage(
      `Đã đọc ${parsed.length} dòng — kiểm tra preview rồi bấm Import kế hoạch`
    );
  };

  const handleCarrierFile = async (file: File) => {
    setError("");
    setMessage("");
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
    });
    if (json.length === 0) {
      setError("File trống");
      return;
    }
    const headers = Object.keys(json[0]);
    const parsed = parseSheetRows(headers, json, planDate, {
      requireGateTime: false,
    });
    const errorRows = parsed.filter((r) => r.errors.length > 0);
    if (errorRows.length > 0) {
      setError(
        `${errorRows.length} dòng lỗi — sửa file hoặc kiểm tra cột bắt buộc (Đơn/Lệnh)`
      );
    }
    const groups = buildStagingGroups(parsed);
    if (groups.length === 0) {
      setError("Không có dòng hợp lệ để import");
      return;
    }
    setStaging(groups);
    setCarrierFileName(file.name);
    setMessage(
      `Đã đọc ${parsed.length} dòng — chọn Cổng và Giờ cho từng xe rồi Lưu`
    );
  };

  const cancelStaging = () => {
    setStaging([]);
    setCarrierFileName("");
    setMessage("");
    setError("");
    if (carrierFileInputRef.current) carrierFileInputRef.current.value = "";
  };

  const updateStagingGroup = (
    groupKey: string,
    patch: Partial<Pick<StagingGroup, "gateId" | "expectedTime">>
  ) => {
    setStaging((prev) =>
      prev.map((g) =>
        g.groupKey === groupKey
          ? {
              ...g,
              ...patch,
              ...(patch.gateId !== undefined ? { expectedTime: "" } : {}),
            }
          : g
      )
    );
  };

  const saveStaging = async () => {
    if (!canEdit) {
      setError("Không được sửa kế hoạch ngày đã qua");
      return;
    }
    const incomplete = staging.filter((g) => !g.gateId || !g.expectedTime);
    if (incomplete.length > 0) {
      setError("Mỗi nhóm xe cần chọn Cổng và Giờ");
      return;
    }
    const orders = staging.flatMap((g) => {
      const gate = gates.find((x) => x.id === g.gateId);
      if (!gate) return [];
      return g.rows.map((r) => ({
        planDate: r.planDate,
        gateCode: gate.code,
        expectedTime: g.expectedTime,
        orderCode: r.orderCode,
        tonnage: r.tonnage,
        vehiclePlate: g.plate,
        driverName: g.driverName ?? r.driverName,
        source: "import" as const,
      }));
    });
    if (orders.length === 0) {
      setError("Không có đơn để lưu");
      return;
    }
    setSavingStaging(true);
    setError("");
    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lỗi lưu");
      setMessage(`Đã lưu ${data.orders?.length ?? 0} đơn kế hoạch`);
      cancelStaging();
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingStaging(false);
    }
  };

  const cancelImport = () => {
    setPreview([]);
    setSelectedFileName("");
    setMessage("");
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const saveImport = async () => {
    const valid = preview.filter((r) => r.errors.length === 0);
    if (valid.length === 0) {
      setError("Không có dòng hợp lệ để lưu");
      return;
    }
    setImporting(true);
    setError("");
    try {
      const res = await fetch("/api/plans/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: planDate,
          replace: replaceOnImport,
          rows: preview,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import thất bại");
      setMessage(`Đã lưu ${data.imported} dòng kế hoạch`);
      cancelImport();
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const saveManual = async () => {
    if (!canEdit) {
      setError("Không được sửa kế hoạch ngày đã qua");
      return;
    }
    setError("");
    const lines = manualLines.filter((l) => l.orderCode.trim());
    const gate = gates.find((g) => g.id === manualGateId);
    const gateCode = gate?.code ?? manualGate;
    if (!gateCode.trim() || !manualTime.trim() || lines.length === 0) {
      setError("Cần cổng, giờ và ít nhất 1 đơn/lệnh");
      return;
    }
    setSavingManual(true);
    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orders: lines.map((l) => ({
            planDate,
            gateCode,
            expectedTime: manualTime,
            orderCode: l.orderCode,
            tonnage: l.tonnage ? Number(l.tonnage.replace(",", ".")) : null,
            vehiclePlate: manualPlate || null,
            driverName: manualDriver || null,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lỗi lưu");
      setMessage(`Đã thêm ${data.orders?.length ?? 0} đơn`);
      setManualLines([{ orderCode: "", tonnage: "" }]);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingManual(false);
    }
  };

  const deleteOrder = async (id: number) => {
    if (!confirm("Xóa dòng kế hoạch này?")) return;
    try {
      const res = await fetch(`/api/plans/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Không xóa được");
      setMessage("Đã xóa dòng kế hoạch");
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSavingEdit(true);
    setError("");
    const tonnageParsed = editTonnageStr.trim()
      ? Number(editTonnageStr.replace(",", "."))
      : null;
    const tonnage =
      tonnageParsed != null && !Number.isNaN(tonnageParsed)
        ? tonnageParsed
        : null;
    try {
      const res = await fetch(`/api/plans/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planDate: editing.plan_date,
          gateCode: editing.gate_code,
          expectedTime: editing.expected_time,
          orderCode: editing.order_code,
          tonnage,
          vehiclePlate: editing.vehicle_plate,
          driverName: editing.driver_name,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lỗi lưu");
      setEditing(null);
      setMessage("Đã cập nhật dòng kế hoạch");
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Kế hoạch vận tải"
        description="Import Excel hoặc nhập tay — mỗi dòng = 1 đơn/lệnh"
        actions={
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-slate-600">Ngày kế hoạch</span>
            <input
              type="date"
              value={planDate}
              onChange={(e) => setPlanDate(e.target.value)}
              className={inputCls}
            />
          </label>
        }
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

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {role === "warehouse" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold text-slate-800">Import Excel / CSV</h2>
            <a
              href={`/api/plans/template?date=${planDate}`}
              download
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Tải mẫu Excel
            </a>
          </div>
          <p className="mb-3 text-xs text-slate-500">
            Cột bắt buộc: <b>Ngày, Cổng, Giờ, Đơn/Lệnh</b>. Tùy chọn: Số tấn,
            Số xe, Tài xế
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />

          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-100"
            >
              Chọn file Excel / CSV
            </button>
            {selectedFileName && (
              <span className="truncate text-sm text-slate-600">
                {selectedFileName}
              </span>
            )}
          </div>

          <label className="mb-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={replaceOnImport}
              onChange={(e) => setReplaceOnImport(e.target.checked)}
            />
            Ghi đè kế hoạch ngày này trước khi import
          </label>

          {preview.length > 0 && (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <span>
                  Preview: <b>{preview.length}</b> dòng ·{" "}
                  <b className="text-green-700">
                    {preview.filter((r) => r.errors.length === 0).length}
                  </b>{" "}
                  hợp lệ ·{" "}
                  <b className="text-red-600">
                    {preview.filter((r) => r.errors.length > 0).length}
                  </b>{" "}
                  lỗi
                </span>
              </div>
              <div className="mb-3 max-h-48 overflow-auto rounded border text-xs">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-2 py-1">#</th>
                      <th className="px-2 py-1">Cổng</th>
                      <th className="px-2 py-1">Giờ</th>
                      <th className="px-2 py-1">Đơn/Lệnh</th>
                      <th className="px-2 py-1">Xe</th>
                      <th className="px-2 py-1">Lỗi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r) => (
                      <tr
                        key={r.rowNumber}
                        className={
                          r.errors.length ? "bg-red-50" : "bg-white"
                        }
                      >
                        <td className="px-2 py-1">{r.rowNumber}</td>
                        <td className="px-2 py-1">{r.gateCode}</td>
                        <td className="px-2 py-1">{r.expectedTime}</td>
                        <td className="px-2 py-1">{r.orderCode}</td>
                        <td className="px-2 py-1">{r.vehiclePlate ?? "-"}</td>
                        <td className="px-2 py-1 text-red-600">
                          {r.errors.join("; ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  onClick={saveImport}
                  variant="success"
                  size="lg"
                  loading={importing}
                  loadingText="Đang import..."
                  disabled={
                    preview.filter((r) => r.errors.length === 0).length === 0
                  }
                  className="flex-1 shadow-md"
                >
                  Import kế hoạch
                </Button>
                <Button
                  type="button"
                  onClick={cancelImport}
                  variant="secondary"
                  size="lg"
                  disabled={importing}
                  className="sm:flex-none"
                >
                  Hủy
                </Button>
              </div>
            </>
          )}
        </section>
        )}

        {role === "carrier" && canEdit && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold text-slate-800">Import Excel / CSV</h2>
            <a
              href={`/api/plans/template?date=${planDate}`}
              download
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Tải mẫu Excel
            </a>
          </div>
          <p className="mb-3 text-xs text-slate-500">
            Cột bắt buộc: <b>Ngày, Đơn/Lệnh</b>. Tùy chọn: Số tấn, Số xe, Tài
            xế. Sau import chọn <b>Cổng</b> và <b>Giờ</b> trên app.
          </p>

          <input
            ref={carrierFileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleCarrierFile(f);
            }}
          />

          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => carrierFileInputRef.current?.click()}
              className="rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-100"
            >
              Chọn file Excel / CSV
            </button>
            {carrierFileName && (
              <span className="truncate text-sm text-slate-600">
                {carrierFileName}
              </span>
            )}
          </div>

          {staging.length > 0 && (
            <>
              <p className="mb-3 text-xs text-slate-600">
                {staging.length} nhóm xe — mỗi xe chọn 1 cổng và 1 khung giờ
              </p>
              <div className="mb-3 space-y-3">
                {staging.map((group) => (
                  <StagingGroupCard
                    key={group.groupKey}
                    group={group}
                    gates={openGates}
                    planDate={planDate}
                    inputCls={inputCls}
                    onChange={(patch) =>
                      updateStagingGroup(group.groupKey, patch)
                    }
                  />
                ))}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  onClick={saveStaging}
                  variant="success"
                  size="lg"
                  loading={savingStaging}
                  loadingText="Đang lưu..."
                  className="flex-1 shadow-md"
                >
                  Lưu kế hoạch
                </Button>
                <Button
                  type="button"
                  onClick={cancelStaging}
                  variant="secondary"
                  size="lg"
                  disabled={savingStaging}
                  className="sm:flex-none"
                >
                  Hủy
                </Button>
              </div>
            </>
          )}
        </section>
        )}

        <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${role !== "warehouse" && !(role === "carrier" && canEdit) ? "lg:col-span-2" : ""}`}>
          <h2 className="mb-3 font-bold text-slate-800">Nhập tay</h2>
          {!canEdit && (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Ngày đã qua — chỉ xem, không sửa/xóa
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Cổng vào">
              {gates.length > 0 ? (
                <>
                  <select
                    value={manualGateId}
                    onChange={(e) => {
                      const id = e.target.value ? Number(e.target.value) : "";
                      setManualGateId(id);
                      const g = openGates.find((x) => x.id === id);
                      setManualGate(g?.code ?? "");
                      setManualTime("");
                    }}
                    className={inputCls}
                    disabled={!canEdit}
                  >
                    <option value="">-- Chọn cổng --</option>
                    {openGates.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.code} — {g.name}
                      </option>
                    ))}
                  </select>
                  {openGates.length === 0 && (
                    <p className="mt-1 text-xs text-amber-700">
                      Không có cổng mở vào ngày này
                    </p>
                  )}
                </>
              ) : (
                <input
                  value={manualGate}
                  onChange={(e) => setManualGate(e.target.value)}
                  className={inputCls}
                  placeholder="Cua 3"
                  disabled={!canEdit}
                />
              )}
            </Field>
            <Field label="Giờ dự kiến">
              {gates.length > 0 ? (
                <>
                  <select
                    value={manualTime}
                    onChange={(e) => setManualTime(e.target.value)}
                    className={inputCls}
                    disabled={!canEdit || !manualGateId}
                  >
                    <option value="">
                      {!manualGateId
                        ? "-- Chọn cổng trước --"
                        : "-- Chọn giờ --"}
                    </option>
                    {slots.map((s) => (
                      <option key={s.minutes} value={s.label}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  {manualGateId && slots.length === 0 && (
                    <p className="mt-1 text-xs text-amber-700">
                      Không còn khung giờ trống
                    </p>
                  )}
                </>
              ) : (
                <input
                  value={manualTime}
                  onChange={(e) => setManualTime(e.target.value)}
                  className={inputCls}
                  placeholder="6h30"
                  disabled={!canEdit}
                />
              )}
            </Field>
            <Field label="Số xe (tùy chọn)">
              <input
                value={manualPlate}
                onChange={(e) => setManualPlate(e.target.value.toUpperCase())}
                className={inputCls}
                disabled={!canEdit}
              />
            </Field>
            <Field label="Tài xế (tùy chọn)">
              <input
                value={manualDriver}
                onChange={(e) => setManualDriver(e.target.value)}
                className={inputCls}
                disabled={!canEdit}
              />
            </Field>
          </div>
          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="mb-2 text-xs font-semibold text-slate-500">
              Đơn / lệnh <span className="text-red-500">*</span>
            </p>
            <div className="mb-1 grid grid-cols-[1fr_5rem] gap-2 text-xs font-semibold text-slate-400">
              <span>Đơn/Lệnh</span>
              <span>Số tấn</span>
            </div>
            <div className="space-y-2">
              {manualLines.map((line, i) => (
                <div key={i} className="grid grid-cols-[1fr_5rem] gap-2">
                  <input
                    value={line.orderCode}
                    onChange={(e) => {
                      const next = [...manualLines];
                      next[i] = { ...next[i], orderCode: e.target.value };
                      setManualLines(next);
                    }}
                    placeholder="HCM1"
                    className={`${inputCls} min-w-0 font-mono`}
                    disabled={!canEdit}
                  />
                  <input
                    value={line.tonnage}
                    onChange={(e) => {
                      const next = [...manualLines];
                      next[i] = { ...next[i], tonnage: e.target.value };
                      setManualLines(next);
                    }}
                    placeholder="1.2"
                    inputMode="decimal"
                    className={`${inputCls} min-w-0`}
                    disabled={!canEdit}
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                setManualLines([...manualLines, { orderCode: "", tonnage: "" }])
              }
              className="mt-2 text-sm font-semibold text-blue-600"
              disabled={!canEdit}
            >
              + Thêm đơn
            </button>
          </div>
          <Button
            onClick={saveManual}
            disabled={!canEdit}
            loading={savingManual}
            loadingText="Đang lưu..."
            className="mt-3"
          >
            Lưu nhập tay
          </Button>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="font-bold text-slate-800">
            Danh sách kế hoạch ({orders.length})
          </h2>
          <a
            href={`/api/plans/export?date=${planDate}`}
            download
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Export Excel
          </a>
        </div>
        {loading ? (
          <SkeletonTable rows={6} cols={8} />
        ) : orders.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">
            Chưa có kế hoạch cho ngày này
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className={tableHeadCls}>
                <tr>
                  <th className="px-3 py-2">Giờ</th>
                  <th className="px-3 py-2">Cổng</th>
                  <th className="px-3 py-2">Đơn/Lệnh</th>
                  <th className="px-3 py-2">Tấn</th>
                  <th className="px-3 py-2">Xe</th>
                  <th className="px-3 py-2">Tài xế</th>
                  <th className="px-3 py-2">Nguồn</th>
                  <th className="px-3 py-2">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((o) => (
                  <tr key={o.id} className={tableRowHoverCls}>
                    <td className="px-3 py-2 font-semibold">{o.expected_time}</td>
                    <td className="px-3 py-2" title={o.gate_code}>
                      {gateNameByCode[o.gate_code] ?? o.gate_code}
                    </td>
                    <td className="px-3 py-2 font-mono">{o.order_code}</td>
                    <td className="px-3 py-2">{o.tonnage ?? "-"}</td>
                    <td className="px-3 py-2">{o.vehicle_plate ?? "-"}</td>
                    <td className="px-3 py-2">{o.driver_name ?? "-"}</td>
                    <td className="px-3 py-2 text-xs">{o.source}</td>
                    <td className="px-3 py-2">
                      {canEdit ? (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="bg-amber-100 text-amber-800 hover:bg-amber-200"
                            onClick={() => setEditing(o)}
                          >
                            Sửa
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            className="bg-red-100 text-red-700 hover:bg-red-200"
                            onClick={() => deleteOrder(o.id)}
                          >
                            Xóa
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && (
        <Modal open onClose={() => setEditing(null)} maxWidth="max-w-lg">
            <h3 className="mb-3 font-bold">Sửa dòng kế hoạch</h3>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Cổng">
                {gates.length > 0 ? (
                  <select
                    value={editing.gate_code}
                    onChange={(e) => {
                      const code = e.target.value;
                      setEditing({
                        ...editing,
                        gate_code: code,
                        expected_time: "",
                        expected_minutes: 0,
                      });
                    }}
                    className={inputCls}
                  >
                    <option value="">-- Chọn cổng --</option>
                    {editGateOptions.map((g) => (
                      <option key={g.id} value={g.code}>
                        {g.code} — {g.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={editing.gate_code}
                    onChange={(e) =>
                      setEditing({ ...editing, gate_code: e.target.value })
                    }
                    className={inputCls}
                  />
                )}
              </Field>
              <Field label="Giờ">
                {gates.length > 0 ? (
                  <select
                    value={editing.expected_time}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        expected_time: e.target.value,
                      })
                    }
                    className={inputCls}
                    disabled={!editing.gate_code}
                  >
                    <option value="">
                      {!editing.gate_code
                        ? "-- Chọn cổng trước --"
                        : "-- Chọn giờ --"}
                    </option>
                    {editTimeOptions.map((s) => (
                      <option key={`${s.minutes}-${s.label}`} value={s.label}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={editing.expected_time}
                    onChange={(e) =>
                      setEditing({ ...editing, expected_time: e.target.value })
                    }
                    className={inputCls}
                  />
                )}
              </Field>
              <Field label="Đơn/Lệnh">
                <input
                  value={editing.order_code}
                  onChange={(e) =>
                    setEditing({ ...editing, order_code: e.target.value })
                  }
                  className={inputCls}
                />
              </Field>
              <Field label="Tấn">
                <input
                  value={editTonnageStr}
                  onChange={(e) => setEditTonnageStr(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Xe">
                <input
                  value={editing.vehicle_plate ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      vehicle_plate: e.target.value.toUpperCase() || null,
                    })
                  }
                  className={inputCls}
                />
              </Field>
              <Field label="Tài xế">
                <input
                  value={editing.driver_name ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      driver_name: e.target.value || null,
                    })
                  }
                  className={inputCls}
                />
              </Field>
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                onClick={saveEdit}
                loading={savingEdit}
                loadingText="Đang lưu..."
              >
                Lưu
              </Button>
              <Button
                onClick={() => setEditing(null)}
                variant="ghost"
                disabled={savingEdit}
              >
                Hủy
              </Button>
            </div>
        </Modal>
      )}
    </>
  );
}

function StagingGroupCard({
  group,
  gates,
  planDate,
  inputCls,
  onChange,
}: {
  group: StagingGroup;
  gates: GateRow[];
  planDate: string;
  inputCls: string;
  onChange: (patch: Partial<Pick<StagingGroup, "gateId" | "expectedTime">>) => void;
}) {
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const stagingSlotSeq = useRef(0);

  useEffect(() => {
    if (!group.gateId) {
      setSlots([]);
      return;
    }
    const seq = ++stagingSlotSeq.current;
    const params = new URLSearchParams({
      date: planDate,
      gateId: String(group.gateId),
    });
    if (group.plate) params.set("excludePlate", group.plate);
    fetch(`/api/plans/slots?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (seq !== stagingSlotSeq.current) return;
        setSlots(d.slots ?? []);
      })
      .catch(() => {
        if (seq === stagingSlotSeq.current) setSlots([]);
      });
  }, [group.gateId, group.plate, planDate]);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold text-slate-800">
          {group.plate ?? `Dòng #${group.rows[0]?.rowNumber}`}
        </span>
        {group.driverName && (
          <span className="text-xs text-slate-500">{group.driverName}</span>
        )}
      </div>
      <ul className="mb-3 space-y-0.5 text-xs text-slate-600">
        {group.rows.map((r) => (
          <li key={r.rowNumber}>
            <span className="font-mono">{r.orderCode}</span>
            {r.tonnage != null && (
              <span className="text-slate-400"> · {r.tonnage} tấn</span>
            )}
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Cổng">
          <select
            value={group.gateId}
            onChange={(e) => {
              const id = e.target.value ? Number(e.target.value) : "";
              onChange({ gateId: id });
            }}
            className={inputCls}
          >
            <option value="">-- Chọn cổng --</option>
            {gates.map((g) => (
              <option key={g.id} value={g.id}>
                {g.code} — {g.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Giờ">
          <select
            value={group.expectedTime}
            onChange={(e) => onChange({ expectedTime: e.target.value })}
            className={inputCls}
            disabled={!group.gateId}
          >
            <option value="">
              {!group.gateId ? "-- Chọn cổng trước --" : "-- Chọn giờ --"}
            </option>
            {slots.map((s) => (
              <option key={s.minutes} value={s.label}>
                {s.label}
              </option>
            ))}
          </select>
          {group.gateId && slots.length === 0 && (
            <p className="mt-1 text-xs text-amber-700">
              Không có khung giờ khả dụng (cổng đóng hoặc đã hết slot)
            </p>
          )}
        </Field>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}
