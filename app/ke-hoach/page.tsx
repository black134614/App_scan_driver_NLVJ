"use client";

import AppNav from "@/components/AppNav";
import { parseSheetRows, todayDateString } from "@/lib/plan-parse";
import type { PlanOrderRow } from "@/lib/types";
import { useCallback, useEffect, useRef, useState } from "react";

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

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500";

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

  const [manualGate, setManualGate] = useState("");
  const [manualTime, setManualTime] = useState("");
  const [manualPlate, setManualPlate] = useState("");
  const [manualDriver, setManualDriver] = useState("");
  const [manualLines, setManualLines] = useState<ManualOrderLine[]>([
    { orderCode: "", tonnage: "" },
  ]);

  const [editing, setEditing] = useState<PlanOrderRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/plans?date=${planDate}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lỗi tải dữ liệu");
      setOrders(data.orders ?? []);
    } catch (e) {
      setError((e as Error).message);
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
    setError("");
    const lines = manualLines.filter((l) => l.orderCode.trim());
    if (!manualGate.trim() || !manualTime.trim() || lines.length === 0) {
      setError("Cần cổng, giờ và ít nhất 1 mã đơn");
      return;
    }
    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orders: lines.map((l) => ({
            planDate,
            gateCode: manualGate,
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
    }
  };

  const deleteOrder = async (id: number) => {
    if (!confirm("Xóa dòng kế hoạch này?")) return;
    await fetch(`/api/plans/${id}`, { method: "DELETE" });
    load();
  };

  const saveEdit = async () => {
    if (!editing) return;
    const res = await fetch(`/api/plans/${editing.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planDate: editing.plan_date,
        gateCode: editing.gate_code,
        expectedTime: editing.expected_time,
        orderCode: editing.order_code,
        tonnage: editing.tonnage,
        vehiclePlate: editing.vehicle_plate,
        driverName: editing.driver_name,
      }),
    });
    if (res.ok) {
      setEditing(null);
      load();
    }
  };

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6">
      <AppNav />
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">
            Kế hoạch vận tải
          </h1>
          <p className="text-sm text-slate-500">
            Import Excel hoặc nhập tay — mỗi dòng = 1 đơn/lệnh
          </p>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-slate-600">Ngày kế hoạch</span>
          <input
            type="date"
            value={planDate}
            onChange={(e) => setPlanDate(e.target.value)}
            className={inputCls}
          />
        </label>
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

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
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
            Cột bắt buộc: <b>Ngày, Cổng, Giờ, Mã đơn</b>. Tùy chọn: Số tấn,
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
                      <th className="px-2 py-1">Mã đơn</th>
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
                <button
                  type="button"
                  onClick={saveImport}
                  disabled={
                    importing ||
                    preview.filter((r) => r.errors.length === 0).length === 0
                  }
                  className="flex-1 rounded-xl bg-emerald-600 px-6 py-3.5 text-base font-bold text-white shadow-md hover:bg-emerald-700 disabled:bg-slate-300"
                >
                  {importing ? "Đang import..." : "Import kế hoạch"}
                </button>
                <button
                  type="button"
                  onClick={cancelImport}
                  disabled={importing}
                  className="rounded-xl border-2 border-slate-300 bg-white px-6 py-3.5 text-base font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:flex-none"
                >
                  Hủy
                </button>
              </div>
            </>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-bold text-slate-800">Nhập tay</h2>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Cổng vào">
              <input
                value={manualGate}
                onChange={(e) => setManualGate(e.target.value)}
                className={inputCls}
                placeholder="Cua 3"
              />
            </Field>
            <Field label="Giờ dự kiến">
              <input
                value={manualTime}
                onChange={(e) => setManualTime(e.target.value)}
                className={inputCls}
                placeholder="6h30"
              />
            </Field>
            <Field label="Số xe (tùy chọn)">
              <input
                value={manualPlate}
                onChange={(e) => setManualPlate(e.target.value.toUpperCase())}
                className={inputCls}
              />
            </Field>
            <Field label="Tài xế (tùy chọn)">
              <input
                value={manualDriver}
                onChange={(e) => setManualDriver(e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>
          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="mb-2 text-xs font-semibold text-slate-500">
              Đơn / lệnh <span className="text-red-500">*</span>
            </p>
            <div className="mb-1 grid grid-cols-[1fr_5rem] gap-2 text-xs font-semibold text-slate-400">
              <span>Mã đơn</span>
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
            >
              + Thêm đơn
            </button>
          </div>
          <button
            onClick={saveManual}
            className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Lưu nhập tay
          </button>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="font-bold text-slate-800">
            Danh sách kế hoạch ({orders.length})
          </h2>
        </div>
        {loading ? (
          <p className="py-12 text-center text-sm text-slate-400">Đang tải...</p>
        ) : orders.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">
            Chưa có kế hoạch cho ngày này
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-3 py-2">Giờ</th>
                  <th className="px-3 py-2">Cổng</th>
                  <th className="px-3 py-2">Mã đơn</th>
                  <th className="px-3 py-2">Tấn</th>
                  <th className="px-3 py-2">Xe</th>
                  <th className="px-3 py-2">Tài xế</th>
                  <th className="px-3 py-2">Nguồn</th>
                  <th className="px-3 py-2">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="px-3 py-2 font-semibold">{o.expected_time}</td>
                    <td className="px-3 py-2">{o.gate_code}</td>
                    <td className="px-3 py-2 font-mono">{o.order_code}</td>
                    <td className="px-3 py-2">{o.tonnage ?? "-"}</td>
                    <td className="px-3 py-2">{o.vehicle_plate ?? "-"}</td>
                    <td className="px-3 py-2">{o.driver_name ?? "-"}</td>
                    <td className="px-3 py-2 text-xs">{o.source}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button
                          onClick={() => setEditing(o)}
                          className="rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800"
                        >
                          Sửa
                        </button>
                        <button
                          onClick={() => deleteOrder(o.id)}
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
      </section>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="mb-3 font-bold">Sửa dòng kế hoạch</h3>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Cổng">
                <input
                  value={editing.gate_code}
                  onChange={(e) =>
                    setEditing({ ...editing, gate_code: e.target.value })
                  }
                  className={inputCls}
                />
              </Field>
              <Field label="Giờ">
                <input
                  value={editing.expected_time}
                  onChange={(e) =>
                    setEditing({ ...editing, expected_time: e.target.value })
                  }
                  className={inputCls}
                />
              </Field>
              <Field label="Mã đơn">
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
                  value={editing.tonnage ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      tonnage: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
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
              <button
                onClick={saveEdit}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Lưu
              </button>
              <button
                onClick={() => setEditing(null)}
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
